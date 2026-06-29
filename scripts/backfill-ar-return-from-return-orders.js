'use strict';

// scripts/backfill-ar-return-from-return-orders.js
// Dry-run mặc định; chỉ tạo AR-RETURN khi chạy --apply.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ReturnOrder = require('../src/models/ReturnOrder');
const ArLedger = require('../src/models/ArLedger');
const postingEngine = require('../src/engines/posting.engine');
const dateUtil = require('../src/utils/date.util');
const { toNumber } = require('../src/utils/common.util');
const { requireApplyConfirmation } = require('./lib/scriptSafety');

const INACTIVE = new Set(['void', 'cancelled', 'canceled', 'deleted', 'removed', 'duplicate_cancelled', 'cleared']);

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return process.argv.includes(`--${name}`) ? '1' : fallback;
}

function truthy(value) {
  return ['1', 'true', 'yes', 'y', 'apply'].includes(String(value || '').trim().toLowerCase());
}

function isActiveReturnOrder(row = {}) {
  const statuses = [row.status, row.returnStatus, row.returnState, row.accountingStatus, row.warehouseReceiveStatus]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return !row.deletedAt && !statuses.some((status) => INACTIVE.has(status));
}

function firstPositive(...values) {
  for (const value of values) {
    const amount = toNumber(value);
    if (amount > 0) return amount;
  }
  return 0;
}

function returnAmount(row = {}) {
  const direct = firstPositive(row.debtReduction, row.amount, row.totalReturnAmount, row.totalAmount, row.returnAmount, row.returnedAmount, row.totalValue);
  if (direct > 0) return Math.round(direct);
  return Math.round((Array.isArray(row.items) ? row.items : []).reduce((sum, item) => {
    const amount = firstPositive(item.returnAmount, item.amount, item.totalAmount);
    if (amount > 0) return sum + amount;
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
    return sum + Math.round(qty * price);
  }, 0));
}

function compactKeys(row = {}) {
  return [...new Set([
    row.id, row._id, row.code, row.returnOrderId, row.returnOrderCode,
    row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode,
    row.sourceOrderId, row.sourceOrderCode, row.refId, row.refCode
  ].map((value) => String(value || '').trim()).filter(Boolean))];
}

function returnKeys(row = {}) {
  return [...new Set([row.id, row._id, row.code, row.returnOrderId, row.returnOrderCode]
    .map((value) => String(value || '').trim()).filter(Boolean))];
}

function orderKeys(row = {}) {
  return [...new Set([row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode, row.sourceOrderId, row.sourceOrderCode]
    .map((value) => String(value || '').trim()).filter(Boolean))];
}

async function hasActiveArReturn(row = {}) {
  const rKeys = returnKeys(row);
  const oKeys = orderKeys(row);
  const or = [];
  if (rKeys.length) {
    or.push(
      { id: { $in: rKeys.map((key) => `AR-RETURN-${key}`) } },
      { code: { $in: rKeys.map((key) => `AR-RETURN-${key}`) } },
      { refId: { $in: rKeys } },
      { refCode: { $in: rKeys } },
      { returnOrderId: { $in: rKeys } },
      { returnOrderCode: { $in: rKeys } }
    );
  }
  if (oKeys.length) {
    or.push(
      { orderId: { $in: oKeys } },
      { orderCode: { $in: oKeys } },
      { salesOrderId: { $in: oKeys } },
      { salesOrderCode: { $in: oKeys } },
      { refId: { $in: oKeys } },
      { refCode: { $in: oKeys } }
    );
  }
  if (!or.length) return false;
  const existing = await ArLedger.findOne({
    status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    $and: [
      { $or: [
        { type: 'ar_return' },
        { type: 'AR-RETURN' },
        { ledgerType: 'AR-RETURN' },
        { category: 'AR-RETURN' },
        { code: /^AR-RETURN-/ }
      ] },
      { $or: or }
    ]
  }).select('id code credit amount status reversed').lean();
  return Boolean(existing && toNumber(existing.credit ?? existing.amount) > 0);
}

function buildFilter() {
  const filter = {};
  const from = dateUtil.toDateOnly(arg('from', ''));
  const to = dateUtil.toDateOnly(arg('to', ''));
  const order = arg('order', '') || arg('orderCode', '');
  const customer = arg('customer', '') || arg('customerCode', '');
  const dateOr = [];
  if (from || to) {
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    dateOr.push({ date: range }, { documentDate: range }, { deliveryDate: range }, { returnDate: range });
  }
  if (dateOr.length) filter.$or = dateOr;
  const and = [];
  if (order) {
    and.push({ $or: [
      { salesOrderCode: order }, { orderCode: order }, { sourceOrderCode: order }, { code: order },
      { salesOrderId: order }, { orderId: order }, { sourceOrderId: order }
    ] });
  }
  if (customer) and.push({ $or: [{ customerCode: customer }, { customerId: customer }] });
  if (and.length) filter.$and = and;
  return filter;
}

async function main() {
  const apply = truthy(arg('apply', ''));
  if (apply) {
    requireApplyConfirmation({
      args: process.argv.slice(2),
      scriptName: 'backfill-ar-return-from-return-orders.js',
      requiredFlags: ['--confirm-backfill-ar-return'],
      danger: 'This backfill creates AR-RETURN ledger rows from returnOrders.'
    });
  }
  const dryRun = !apply;
  await connectDB();
  const limit = Math.max(1, Number(arg('limit', 5000)) || 5000);
  const filter = buildFilter();
  const rows = await ReturnOrder.find(filter).sort({ date: 1, createdAt: 1 }).limit(limit).lean();
  const report = {
    ok: true,
    mode: dryRun ? 'dry-run' : 'apply',
    scanned: rows.length,
    activeWithAmount: 0,
    alreadyHasArReturn: 0,
    missingArReturn: 0,
    created: 0,
    skippedInactive: 0,
    skippedZeroAmount: 0,
    rows: []
  };

  for (const row of rows) {
    if (!isActiveReturnOrder(row)) {
      report.skippedInactive += 1;
      continue;
    }
    const amount = returnAmount(row);
    if (amount <= 0) {
      report.skippedZeroAmount += 1;
      continue;
    }
    report.activeWithAmount += 1;
    const exists = await hasActiveArReturn(row);
    const item = {
      returnOrderId: String(row.id || row._id || ''),
      returnOrderCode: row.code || '',
      orderCode: row.salesOrderCode || row.orderCode || row.sourceOrderCode || '',
      customerCode: row.customerCode || '',
      amount,
      keys: compactKeys(row).slice(0, 10),
      action: exists ? 'skip_existing_ar_return' : (dryRun ? 'would_create_ar_return' : 'create_ar_return')
    };
    if (exists) {
      report.alreadyHasArReturn += 1;
      report.rows.push(item);
      continue;
    }
    report.missingArReturn += 1;
    if (!dryRun) {
      const entry = await postingEngine.postReturnOrderAR({
        ...row,
        amount,
        debtReduction: amount,
        totalReturnAmount: amount,
        source: row.source || 'returnOrders_backfill',
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        note: row.note || `Backfill AR-RETURN từ returnOrders ${row.code || row.id || ''}`
      });
      if (entry) report.created += 1;
      item.createdLedgerCode = entry?.code || '';
    }
    report.rows.push(item);
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('[BACKFILL_AR_RETURN_FAILED]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
