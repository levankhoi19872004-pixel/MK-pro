'use strict';

/**
 * Dọn các SalesOrder đã bị bỏ khỏi đơn tổng nhưng còn sót NVGH/ngày giao/route.
 *
 * Mặc định chỉ dry-run:
 *   node scripts/repair-detached-delivery-assignments.js --order=SO1781309656775700
 *
 * Ghi dữ liệu sau khi đã kiểm tra kết quả dry-run:
 *   node scripts/repair-detached-delivery-assignments.js --order=SO1781309656775700 --write
 *
 * Quét toàn bộ dữ liệu an toàn:
 *   node scripts/repair-detached-delivery-assignments.js
 *   node scripts/repair-detached-delivery-assignments.js --write
 */
require('dotenv').config();
const mongoose = require('mongoose');
const SalesOrder = require('../src/models/SalesOrder');
const MasterOrder = require('../src/models/MasterOrder');
const returnOrderService = require('../src/services/returnOrderService');
const { withMongoTransaction } = require('../src/utils/transaction.util');
const {
  buildDetachedSalesOrderMongoUpdate,
  hasDeliveryOperationalData
} = require('../src/utils/masterOrderAssignment.util');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function getArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? text(process.argv[index + 1]) : '';
}

function orderKeys(order = {}) {
  return [order.id, order.code, order.documentCode, order.invoiceCode, order.orderCode, order.salesOrderCode]
    .map(text)
    .filter(Boolean);
}

function isExternalDebtOrder(order = {}) {
  const values = [order.source, order.orderSource, order.orderType, order.createdFrom, order.refType]
    .map((value) => text(value).toLowerCase());
  return values.some((value) => value.includes('external_debt') || value.includes('debt_external'));
}

function hasStaleDeliveryAssignment(order = {}) {
  return [
    order.deliveryStaffId,
    order.deliveryStaffCode,
    order.deliveryStaffName,
    order.deliveryCode,
    order.deliveryName,
    order.shipperCode,
    order.shipperName,
    order.nvghCode,
    order.nvghName,
    order.driverCode,
    order.driverName,
    order.deliveryDate,
    order.routeName,
    order.deliveryRoute
  ].some((value) => text(value));
}

function identityFilter(order = {}) {
  const conditions = [
    order.id && { id: order.id },
    order.code && { code: order.code },
    order.documentCode && { documentCode: order.documentCode },
    order.invoiceCode && { invoiceCode: order.invoiceCode },
    order.orderCode && { orderCode: order.orderCode },
    order.salesOrderCode && { salesOrderCode: order.salesOrderCode }
  ].filter(Boolean);
  return conditions.length ? { $or: conditions } : { _id: order._id };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('Thiếu MONGO_URI/MONGODB_URI/DATABASE_URL');

  const write = process.argv.includes('--write');
  const orderArg = getArg('order');
  await mongoose.connect(uri);

  const activeMasters = await MasterOrder.find({
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] }
  }).select('id code childOrderIds status').lean();

  const activeChildKeys = new Set();
  for (const master of activeMasters) {
    for (const child of (Array.isArray(master.childOrderIds) ? master.childOrderIds : [])) {
      const key = text(child && typeof child === 'object' ? (child.id || child.code || child._id) : child);
      if (key) activeChildKeys.add(key);
    }
  }

  const filter = orderArg
    ? { $or: [
      { id: orderArg },
      { code: orderArg },
      { documentCode: orderArg },
      { invoiceCode: orderArg },
      { orderCode: orderArg },
      { salesOrderCode: orderArg }
    ] }
    : {
      $and: [
        {
          $or: [
            { deliveryStaffCode: { $nin: [null, ''] } },
            { deliveryStaffName: { $nin: [null, ''] } },
            { deliveryDate: { $nin: [null, ''] } },
            { routeName: { $nin: [null, ''] } },
            { deliveryRoute: { $nin: [null, ''] } }
          ]
        },
        {
          $or: [
            { mergeStatus: { $in: [null, '', 'unmerged'] } },
            { mergeStatus: { $exists: false } },
            { masterOrderId: { $in: [null, ''] } },
            { masterOrderId: { $exists: false } }
          ]
        }
      ],
      status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed'] }
    };

  const orders = await SalesOrder.find(filter).lean();
  const report = {
    ok: true,
    mode: write ? 'write' : 'dry-run',
    orderFilter: orderArg || 'all-detached-candidates',
    scanned: orders.length,
    candidates: [],
    repaired: 0,
    skipped: 0
  };

  for (const order of orders) {
    const keys = orderKeys(order);
    const code = text(order.code || order.orderCode || order.salesOrderCode || order.id || order._id);
    let reason = '';

    if (keys.some((key) => activeChildKeys.has(key))) reason = 'still_member_of_active_master_order';
    else if (isExternalDebtOrder(order)) reason = 'external_debt_assignment_is_not_master_delivery';
    else if (!hasStaleDeliveryAssignment(order)) reason = 'no_stale_delivery_assignment';
    else if (hasDeliveryOperationalData(order)) reason = 'delivery_or_accounting_activity_exists';

    const row = {
      id: text(order.id),
      code,
      masterOrderId: text(order.masterOrderId),
      masterOrderCode: text(order.masterOrderCode),
      mergeStatus: text(order.mergeStatus),
      deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
      deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
      deliveryDate: text(order.deliveryDate),
      routeName: text(order.routeName || order.deliveryRoute),
      action: reason ? 'skip' : (write ? 'repair' : 'would_repair'),
      reason
    };
    report.candidates.push(row);

    if (reason) {
      report.skipped += 1;
      continue;
    }

    if (!write) continue;

    const now = new Date().toISOString();
    await withMongoTransaction(async (session) => {
      await SalesOrder.updateOne(identityFilter(order), buildDetachedSalesOrderMongoUpdate(now), { session });
      await returnOrderService.detachMasterOrderFromReturnDrafts([order], { session });
    });
    report.repaired += 1;
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err && (err.stack || err.message) || err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
