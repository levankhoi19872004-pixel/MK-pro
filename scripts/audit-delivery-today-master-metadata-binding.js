'use strict';

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const MasterOrder = require('../src/models/MasterOrder');
const reader = require('../src/services/delivery/deliveryTodayCanonicalOrderReader');

function text(value = '') {
  return String(value ?? '').trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const result = { orderCodes: [], json: false };
  for (const arg of argv) {
    if (arg === '--json') {
      result.json = true;
      continue;
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (key === 'date') result.date = value;
    if (key === 'delivery') result.delivery = value;
    if (key === 'order-codes') result.orderCodes = value.split(',').map(text).filter(Boolean);
  }
  return result;
}

function orderCodeFilter(codes = []) {
  const list = [...new Set(codes.map(text).filter(Boolean))];
  if (!list.length) return {};
  return {
    $or: [
      { code: { $in: list } },
      { orderCode: { $in: list } },
      { salesOrderCode: { $in: list } },
      { documentCode: { $in: list } },
      { invoiceCode: { $in: list } },
      { id: { $in: list } }
    ]
  };
}

function mergeAnd(filters = []) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length);
  if (!active.length) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

function storedDeliveryCode(order = {}) {
  return text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode);
}

function resolvedMasterId(binding = null) {
  return binding && binding.verified === true && binding.master ? text(binding.master.id || binding.master._id) : '';
}

function resolvedMasterCode(binding = null) {
  return binding && binding.verified === true && binding.master ? text(binding.master.code || binding.master.masterOrderCode) : '';
}

function resolvedDeliveryCode(order = {}, binding = null) {
  const stored = storedDeliveryCode(order);
  if (stored) return stored;
  return binding && binding.verified === true && binding.master
    ? text(binding.master.deliveryStaffCode || binding.master.deliveryCode || binding.master.nvghCode)
    : '';
}

async function buildAudit(options = {}, models = { SalesOrder, MasterOrder }) {
  const query = {
    date: options.date,
    delivery: options.delivery,
    deliveryStaffCode: options.delivery,
    deliveryDateChangedByUser: '1',
    limit: 500
  };
  const match = mergeAnd([
    reader.buildCanonicalSalesOrderMatch({ date: options.date, deliveryDateChangedByUser: '1' }, { allowBroadDeliveryScan: true }),
    orderCodeFilter(options.orderCodes || [])
  ]);
  let q = models.SalesOrder.find(match);
  if (q && typeof q.sort === 'function') q = q.sort({ deliveryDate: -1, createdAt: -1 });
  if (q && typeof q.limit === 'function') q = q.limit(500);
  if (q && typeof q.lean === 'function') q = q.lean();
  const orders = await q;
  const metadata = await reader.loadMasterOrderMetadata(orders || [], { MasterOrder: models.MasterOrder });
  const rows = (orders || []).map((order) => {
    const binding = reader.metadataForOrder(order, metadata.metadataByOrderKey);
    const enriched = reader.enrichOrderWithMasterMetadata(order, binding);
    return {
      orderId: text(order.id || order._id),
      orderCode: text(order.code || order.orderCode || order.salesOrderCode),
      mergeStatus: text(order.mergeStatus),
      storedMasterOrderId: text(order.masterOrderId || order.masterId),
      storedMasterOrderCode: text(order.masterOrderCode || order.masterCode),
      storedDeliveryStaffCode: storedDeliveryCode(order),
      resolvedMasterOrderId: resolvedMasterId(binding),
      resolvedMasterOrderCode: resolvedMasterCode(binding),
      resolvedDeliveryStaffCode: resolvedDeliveryCode(order, binding),
      bindingVerified: binding && binding.verified === true,
      bindingSource: binding && binding.source ? binding.source : 'none',
      conflicts: binding && Array.isArray(binding.conflicts) ? binding.conflicts : [],
      wouldMatchDeliveryFilter: reader.deliveryMatches(enriched, query)
    };
  });
  return {
    input: {
      date: text(options.date),
      delivery: text(options.delivery),
      orderCodes: options.orderCodes || []
    },
    readOnly: true,
    queryCount: 1 + (metadata.queryExecuted ? 1 : 0),
    rows
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await buildAudit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.table(result.rows);
    console.log(`readOnly=${result.readOnly} queryCount=${result.queryCount}`);
  }
  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[audit-delivery-today-master-metadata-binding] failed:', err);
    try { await mongoose.connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  buildAudit
};

