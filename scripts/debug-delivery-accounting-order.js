#!/usr/bin/env node
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const MongoStore = require('../src/models');

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]).trim();
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1).trim() : '';
}

function value(row, fields = []) {
  for (const field of fields) {
    const v = row && row[field];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function compact(row = {}, fields = []) {
  const out = {};
  for (const field of fields) out[field] = row[field] == null ? '' : row[field];
  return out;
}

function activeArReturnQuery(orderCode, orderIds = [], returnIds = []) {
  const orderKeys = [...new Set([orderCode, ...orderIds].map((v) => String(v || '').trim()).filter(Boolean))];
  const returnKeys = [...new Set(returnIds.map((v) => String(v || '').trim()).filter(Boolean))];
  const or = [];
  if (orderKeys.length) {
    or.push(
      { orderCode: { $in: orderKeys } },
      { salesOrderCode: { $in: orderKeys } },
      { sourceOrderCode: { $in: orderKeys } },
      { refCode: { $in: orderKeys } },
      { orderId: { $in: orderKeys } },
      { salesOrderId: { $in: orderKeys } },
      { refId: { $in: orderKeys } }
    );
  }
  if (returnKeys.length) {
    or.push(
      { returnOrderId: { $in: returnKeys } },
      { returnOrderCode: { $in: returnKeys } },
      { sourceId: { $in: returnKeys } },
      { sourceCode: { $in: returnKeys } },
      { refId: { $in: returnKeys } },
      { refCode: { $in: returnKeys } }
    );
  }
  return {
    $and: [
      {
        $or: [
          { type: 'ar_return' },
          { type: 'AR-RETURN' },
          { ledgerType: 'AR-RETURN' },
          { category: 'AR-RETURN' },
          { code: /^AR-RETURN-/ }
        ]
      },
      { $or: or.length ? or : [{ _id: null }] },
      { status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] } },
      { accountingStatus: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] } },
      { lifecycleStatus: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] } },
      { reversed: { $ne: true } },
      { isDeleted: { $ne: true } },
      { deleted: { $ne: true } }
    ]
  };
}

async function main() {
  const orderCode = argValue('--orderCode') || argValue('--code');
  if (!orderCode) {
    console.error('Usage: node scripts/debug-delivery-accounting-order.js --orderCode B0038424');
    process.exitCode = 1;
    return;
  }

  await connectDB();

  const salesOrders = await MongoStore.salesOrders.find({
    $or: [
      { code: orderCode },
      { orderCode },
      { salesOrderCode: orderCode },
      { documentCode: orderCode },
      { id: orderCode }
    ]
  }).lean();

  const orderIds = salesOrders.flatMap((row) => [row.id, row._id, row.code, row.orderCode, row.salesOrderId, row.salesOrderCode]).map((v) => String(v || '').trim()).filter(Boolean);

  const returnOrders = await MongoStore.returnOrders.find({
    $or: [
      { orderCode },
      { salesOrderCode: orderCode },
      { sourceOrderCode: orderCode },
      { deliveryOrderCode: orderCode },
      { orderId: { $in: orderIds } },
      { salesOrderId: { $in: orderIds } },
      { sourceOrderId: { $in: orderIds } },
      { deliveryOrderId: { $in: orderIds } }
    ]
  }).lean();

  const returnIds = returnOrders.flatMap((row) => [row.id, row._id, row.code, row.returnOrderId, row.returnOrderCode]).map((v) => String(v || '').trim()).filter(Boolean);

  const arRows = await MongoStore.arLedgers.find({
    $or: [
      { orderCode },
      { salesOrderCode: orderCode },
      { refCode: orderCode },
      { sourceOrderCode: orderCode },
      { orderId: { $in: orderIds } },
      { salesOrderId: { $in: orderIds } },
      { refId: { $in: orderIds } },
      { returnOrderId: { $in: returnIds } },
      { returnOrderCode: { $in: returnIds } },
      { sourceId: { $in: returnIds } },
      { sourceCode: { $in: returnIds } }
    ]
  }).lean();

  const activeArReturn = await MongoStore.arLedgers.find(activeArReturnQuery(orderCode, orderIds, returnIds)).lean();

  console.log('[ORDER]');
  console.log(JSON.stringify(salesOrders.map((row) => compact(row, [
    'id', 'code', 'orderCode', 'salesOrderCode', 'customerCode', 'customerName',
    'deliveryStatus', 'accountingConfirmed', 'accountingStatus', 'accountingNeedsReconfirm',
    'returnAmount', 'returnAmountFromReturnOrders', 'cashCollected', 'cashAmount', 'bankAmount',
    'rewardAmount', 'debtAmount', 'debt', 'deliveryStaffCode', 'salesStaffCode'
  ])), null, 2));

  console.log('[RETURN ORDERS]');
  console.log(JSON.stringify(returnOrders.map((row) => compact(row, [
    'id', 'code', 'returnOrderId', 'returnOrderCode', 'orderId', 'orderCode', 'salesOrderId',
    'salesOrderCode', 'customerCode', 'customerName', 'amount', 'returnAmount', 'totalAmount',
    'debtReduction', 'accountingConfirmed', 'accountingStatus', 'status', 'returnStatus',
    'deliveryStaffCode', 'salesStaffCode'
  ])), null, 2));

  console.log('[AR LEDGERS]');
  console.log(JSON.stringify(arRows.map((row) => compact(row, [
    'id', 'code', 'type', 'ledgerType', 'category', 'orderId', 'orderCode', 'salesOrderId',
    'salesOrderCode', 'returnOrderId', 'returnOrderCode', 'sourceType', 'sourceId', 'sourceCode',
    'customerCode', 'debit', 'credit', 'amount', 'status', 'accountingStatus', 'reversed',
    'idempotencyKey', 'createdAt'
  ])), null, 2));

  const hasReturnAmountOnOrder = salesOrders.some((row) => Number(row.returnAmount || row.returnAmountFromReturnOrders || row.returnedAmount || 0) > 0);
  const hasReturnOrder = returnOrders.length > 0;
  const hasActiveArReturn = activeArReturn.length > 0;

  console.log('[DIAGNOSIS]');
  console.log(JSON.stringify({
    orderCode,
    salesOrders: salesOrders.length,
    returnOrders: returnOrders.length,
    arLedgers: arRows.length,
    activeArReturns: activeArReturn.length,
    missingReturnOrder: hasReturnAmountOnOrder && !hasReturnOrder,
    missingArReturn: hasReturnOrder && !hasActiveArReturn,
    duplicateActiveArReturn: activeArReturn.length > 1,
    likelyReportGroupingIssue: hasActiveArReturn && arRows.some((row) => String(row.type || row.ledgerType || row.category || '').toLowerCase().includes('return'))
  }, null, 2));
}

main().catch((err) => {
  console.error('[ERROR]', err && err.message ? err.message : err);
  process.exitCode = 1;
}).finally(async () => {
  try { if (mongoose.connection.readyState) await mongoose.disconnect(); } catch (_) {}
});
