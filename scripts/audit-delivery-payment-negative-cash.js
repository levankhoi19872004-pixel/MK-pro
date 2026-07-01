#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function text(value = '') {
  return String(value ?? '').trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const get = (name, fallback = '') => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
  return {
    strict: argv.includes('--strict'),
    json: argv.includes('--json'),
    limit: Math.max(1, Number(get('--limit', '20000')) || 20000)
  };
}

function orderCode(order = {}) {
  return text(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id || order._id);
}

function currentCashFromOrder(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  return money(closeout.cashCollectedAmount ?? closeout.collectedAmount ?? order.cashAmount ?? order.cashCollectedAmount ?? order.collectedAmount ?? 0);
}

async function audit(options = {}) {
  const orderRows = await SalesOrder.find({
    $or: [
      { cashAmount: { $lt: 0 } },
      { cashCollectedAmount: { $lt: 0 } },
      { collectedAmount: { $lt: 0 } },
      { 'deliveryCloseout.cashCollectedAmount': { $lt: 0 } },
      { 'deliveryCloseout.collectedAmount': { $lt: 0 } }
    ]
  }).limit(options.limit || 20000).lean();

  const versionRows = await DeliveryCloseoutVersion.find({
    $or: [
      { cashCollectedAmount: { $lt: 0 } },
      { collectedAmount: { $lt: 0 } },
      { previousCashCollectedAmount: { $lt: 0 } }
    ]
  }).limit(options.limit || 20000).lean();

  const negativeOrders = orderRows.map((order) => ({
    orderId: text(order.id || order._id),
    orderCode: orderCode(order),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    currentCashAmount: currentCashFromOrder(order),
    deliveryCloseoutStatus: text(order.deliveryCloseoutStatus || order.closeoutStatus || order.accountingStatus || order.status),
    deliveryCloseoutId: text(order.deliveryCloseout && (order.deliveryCloseout.id || order.deliveryCloseout.closeoutId || order.deliveryCloseout.code))
  }));

  const negativeVersions = versionRows.map((version) => ({
    versionId: text(version.id || version._id),
    closeoutVersion: version.closeoutVersion,
    orderId: text(version.orderId || version.salesOrderId),
    orderCode: text(version.orderCode || version.salesOrderCode),
    customerCode: text(version.customerCode),
    cashCollectedAmount: money(version.cashCollectedAmount ?? version.collectedAmount),
    previousCashCollectedAmount: money(version.previousCashCollectedAmount),
    correctionId: text(version.correctionId),
    reason: text(version.reason)
  }));

  return {
    title: 'DELIVERY_PAYMENT_NEGATIVE_CASH_AUDIT',
    dryRun: true,
    checkedOrderRows: orderRows.length,
    checkedVersionRows: versionRows.length,
    negativeOrderCount: negativeOrders.length,
    negativeVersionCount: negativeVersions.length,
    negativeOrders,
    negativeVersions,
    note: 'Read-only audit. It does not mutate or repair production data.'
  };
}

function printText(result) {
  console.log(result.title);
  console.log(`Negative orders: ${result.negativeOrderCount}`);
  console.log(`Negative versions: ${result.negativeVersionCount}`);
  console.log(result.negativeOrderCount || result.negativeVersionCount ? 'AUDIT_FAIL' : 'AUDIT_PASS');
  if (result.negativeOrderCount || result.negativeVersionCount) {
    console.log(JSON.stringify({ negativeOrders: result.negativeOrders, negativeVersions: result.negativeVersions }, null, 2));
  }
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await audit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  await mongoose.connection.close();
  if (options.strict && (result.negativeOrderCount || result.negativeVersionCount)) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[audit-delivery-payment-negative-cash] failed:', err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { audit };
