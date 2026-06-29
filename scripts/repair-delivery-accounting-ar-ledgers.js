'use strict';

// scripts/repair-delivery-accounting-ar-ledgers.js
// Dry-run mặc định. Dùng để kiểm tra/sửa dữ liệu cũ sau luồng mở khóa kế toán
// khiến AR-SALE còn active nhiều dòng hoặc returnOrders đã có nhưng thiếu AR-RETURN.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const ReturnOrder = require('../src/models/ReturnOrder');
const postingEngine = require('../src/engines/posting.engine');
const dateUtil = require('../src/utils/date.util');
const { toNumber, makeId } = require('../src/utils/common.util');
const { requireApplyConfirmation } = require('./lib/scriptSafety');

const INACTIVE = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled', 'removed', 'reversed'];

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return process.argv.includes(`--${name}`) ? '1' : fallback;
}

function truthy(value) {
  return ['1', 'true', 'yes', 'y', 'apply'].includes(String(value || '').trim().toLowerCase());
}

function text(value) {
  return String(value || '').trim();
}

function amountOf(row = {}) {
  return Math.max(0, Math.round(toNumber(row.debit || row.credit || row.amount)));
}

function orderKeys(row = {}) {
  return [...new Set([
    row.orderId, row.orderCode, row.salesOrderId, row.salesOrderCode, row.refId, row.refCode
  ].map(text).filter(Boolean))];
}

function primaryOrderKey(row = {}) {
  return text(row.orderCode || row.salesOrderCode || row.orderId || row.salesOrderId || row.refCode || row.refId);
}

function activeLedgerFilter(extra = {}) {
  return {
    status: { $nin: INACTIVE },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    type: { $nin: ['ar_reversal', 'reversal', 'ar_void', 'ar_sale_reversal', 'ar_return_reversal'] },
    ...extra
  };
}

function dateFilter() {
  const from = dateUtil.toDateOnly(arg('from', ''));
  const to = dateUtil.toDateOnly(arg('to', ''));
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  return filter;
}

function scopedOrderOr() {
  const order = text(arg('order', '') || arg('orderCode', ''));
  if (!order) return [];
  return [
    { orderId: order }, { orderCode: order }, { salesOrderId: order }, { salesOrderCode: order },
    { refId: order }, { refCode: order }
  ];
}

async function loadActiveSaleRows() {
  const orderOr = scopedOrderOr();
  const customer = text(arg('customer', '') || arg('customerCode', ''));
  const deliveryStaff = text(arg('deliveryStaff', '') || arg('delivery', ''));
  const filter = activeLedgerFilter({ type: 'ar_sale', ...dateFilter() });
  const and = [];
  if (orderOr.length) and.push({ $or: orderOr });
  if (customer) and.push({ $or: [{ customerCode: customer }, { customerId: customer }] });
  if (deliveryStaff) and.push({ $or: [{ deliveryStaffCode: deliveryStaff }, { deliveryCode: deliveryStaff }, { nvghCode: deliveryStaff }] });
  if (and.length) filter.$and = and;
  const limit = Math.max(1, Number(arg('limit', 10000)) || 10000);
  return ArLedger.find(filter).sort({ date: 1, createdAt: 1 }).limit(limit).lean();
}

function groupByOrder(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = primaryOrderKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function chooseActiveSaleToKeep(rows = []) {
  return [...rows].sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)) || text(b._id).localeCompare(text(a._id)))[0];
}

async function repairDuplicateSales(grouped, apply, report) {
  for (const [orderKey, rows] of grouped.entries()) {
    if (rows.length <= 1) continue;
    const keep = chooseActiveSaleToKeep(rows);
    const duplicates = rows.filter((row) => String(row._id || row.id || row.code) !== String(keep._id || keep.id || keep.code));
    const item = {
      orderCode: orderKey,
      action: apply ? 'mark_duplicate_ar_sale_reversed' : 'would_mark_duplicate_ar_sale_reversed',
      keep: keep.code || keep.id || String(keep._id || ''),
      duplicateCount: duplicates.length,
      activeSaleAmountBefore: rows.reduce((sum, row) => sum + amountOf(row), 0),
      expectedSaleAmountAfter: amountOf(keep),
      duplicates: duplicates.map((row) => ({ id: row.id || '', code: row.code || '', amount: amountOf(row), createdAt: row.createdAt || '' }))
    };
    report.duplicateArSaleOrders += 1;
    report.actions.push(item);
    if (!apply) continue;
    for (const row of duplicates) {
      const reverseBatchId = `REPAIR-AR-SALE-DUP-${orderKey}-${Date.now()}-${makeId('AR')}`;
      const amount = amountOf(row);
      const reversal = {
        ...row,
        _id: undefined,
        id: `AR-SALE-REV-${row.id || row.code || makeId('AR')}-${reverseBatchId}`,
        code: `AR-SALE-REV-${row.code || row.id || makeId('AR')}-${reverseBatchId}`,
        type: 'ar_sale_reversal',
        debit: 0,
        credit: amount,
        amount,
        status: 'posted',
        reversedFromId: row.id || '',
        reversedFromCode: row.code || '',
        source: 'repair_delivery_accounting_ar_ledgers',
        note: `Repair duplicate AR-SALE active for ${orderKey}`,
        createdAt: dateUtil.nowIso(),
        updatedAt: dateUtil.nowIso()
      };
      await ArLedger.updateOne({ _id: row._id }, { $set: { reversed: true, status: 'reversed', reversedAt: dateUtil.nowIso(), reversedBy: 'repair-script', updatedAt: dateUtil.nowIso() } });
      await ArLedger.updateOne({ id: reversal.id }, { $set: reversal }, { upsert: true });
      report.reversedDuplicateArSale += 1;
    }
  }
}

function returnAmount(row = {}) {
  const direct = [row.debtReduction, row.amount, row.totalReturnAmount, row.totalAmount, row.returnAmount, row.returnedAmount, row.totalValue]
    .map(toNumber).find((n) => n > 0);
  if (direct > 0) return Math.round(direct);
  return Math.round((Array.isArray(row.items) ? row.items : []).reduce((sum, item) => {
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? 0);
    return sum + qty * price;
  }, 0));
}

async function hasActiveArReturnFor(row = {}) {
  const keys = orderKeys(row);
  if (!keys.length) return false;
  const found = await ArLedger.findOne(activeLedgerFilter({
    $and: [
      { $or: [
        { type: 'ar_return' },
        { type: 'AR-RETURN' },
        { ledgerType: 'AR-RETURN' },
        { category: 'AR-RETURN' },
        { code: /^AR-RETURN-/ }
      ] },
      { $or: [
        { orderId: { $in: keys } }, { orderCode: { $in: keys } }, { salesOrderId: { $in: keys } }, { salesOrderCode: { $in: keys } },
        { refId: { $in: keys } }, { refCode: { $in: keys } }
      ] }
    ]
  })).select('id code credit amount status reversed').lean();
  return Boolean(found && toNumber(found.credit ?? found.amount) > 0);
}

async function repairMissingReturns(apply, report) {
  const filter = { ...dateFilter() };
  const orderOr = scopedOrderOr();
  const customer = text(arg('customer', '') || arg('customerCode', ''));
  const deliveryStaff = text(arg('deliveryStaff', '') || arg('delivery', ''));
  const and = [];
  if (orderOr.length) and.push({ $or: orderOr });
  if (customer) and.push({ $or: [{ customerCode: customer }, { customerId: customer }] });
  if (deliveryStaff) and.push({ $or: [{ deliveryStaffCode: deliveryStaff }, { deliveryCode: deliveryStaff }, { nvghCode: deliveryStaff }] });
  if (and.length) filter.$and = and;
  const rows = await ReturnOrder.find(filter).sort({ date: 1, createdAt: 1 }).limit(Math.max(1, Number(arg('limit', 10000)) || 10000)).lean();
  for (const row of rows) {
    const inactive = [row.status, row.returnStatus, row.returnState, row.accountingStatus, row.warehouseReceiveStatus]
      .map((v) => text(v).toLowerCase())
      .some((status) => INACTIVE.includes(status));
    const amount = returnAmount(row);
    if (inactive || amount <= 0) continue;
    const exists = await hasActiveArReturnFor(row);
    if (exists) continue;
    const item = {
      orderCode: row.salesOrderCode || row.orderCode || row.sourceOrderCode || '',
      returnOrderCode: row.code || row.id || '',
      customerCode: row.customerCode || '',
      amount,
      action: apply ? 'create_missing_ar_return' : 'would_create_missing_ar_return'
    };
    report.missingArReturnOrders += 1;
    report.actions.push(item);
    if (!apply) continue;
    const entry = await postingEngine.postReturnOrderAR({
      ...row,
      amount,
      debtReduction: amount,
      totalReturnAmount: amount,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      source: 'repair_delivery_accounting_ar_ledgers',
      note: `Repair missing AR-RETURN from returnOrders ${row.code || row.id || ''}`
    });
    if (entry) report.createdArReturn += 1;
  }
}

async function main() {
  const apply = truthy(arg('apply', ''));
  if (apply) {
    requireApplyConfirmation({
      args: process.argv.slice(2),
      scriptName: 'repair-delivery-accounting-ar-ledgers.js',
      requiredFlags: ['--confirm-repair-delivery-accounting-ar-ledgers'],
      danger: 'This repair updates AR ledgers and can create missing AR-RETURN rows.'
    });
  }
  await connectDB();
  const activeSales = await loadActiveSaleRows();
  const report = {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    scannedActiveArSale: activeSales.length,
    duplicateArSaleOrders: 0,
    reversedDuplicateArSale: 0,
    missingArReturnOrders: 0,
    createdArReturn: 0,
    actions: []
  };
  await repairDuplicateSales(groupByOrder(activeSales), apply, report);
  await repairMissingReturns(apply, report);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('[REPAIR_DELIVERY_ACCOUNTING_AR_LEDGER_FAILED]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
