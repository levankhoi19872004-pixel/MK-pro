'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const Receipt = require('../src/models/Receipt');
const ReturnOrder = require('../src/models/ReturnOrder');
const Payment = require('../src/models/Payment');
const postingEngine = require('../src/engines/posting.engine');
const { toNumber, makeId } = require('../src/utils/common.util');

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

async function postReceiptAR(receipt = {}) {
  const amount = toNumber(receipt.amount ?? receipt.totalAmount ?? receipt.value);
  if (amount <= 0) return null;
  const entry = {
    id: `AR-RECEIPT-${receipt.id || receipt.code}`,
    code: `AR-RECEIPT-${receipt.code || receipt.id}`,
    date: String(receipt.date || receipt.documentDate || receipt.createdAt || today()).slice(0, 10),
    type: 'ar_receipt',
    account: 'AR',
    refType: 'RECEIPT',
    refId: receipt.id || receipt._id || receipt.code,
    refCode: receipt.code || receipt.id,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    customerId: receipt.customerId || '',
    customerCode: receipt.customerCode || '',
    customerName: receipt.customerName || '',
    debit: 0,
    credit: amount,
    amount,
    note: receipt.note || `Thu công nợ ${receipt.code || receipt.id}`,
    status: 'posted',
    source: 'rebuild_ar_ledger_script',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await Payment.findOneAndUpdate({ id: entry.id }, entry, { upsert: true, new: true, setDefaultsOnInsert: true });
  return entry;
}

async function main() {
  await connectDB();
  await Payment.deleteMany({
    $or: [
      { account: 'AR' },
      { type: { $regex: '^ar_', $options: 'i' } }
    ]
  });

  const [orders, receipts, returns] = await Promise.all([
    SalesOrder.find({}).lean(),
    Receipt.find({}).lean(),
    ReturnOrder.find({}).lean()
  ]);

  let saleCount = 0;
  let receiptCount = 0;
  let returnCount = 0;

  for (const order of orders.filter(isActive)) {
    const entry = await postingEngine.postSalesOrderAR(order);
    if (entry) saleCount += 1;
  }

  for (const receipt of receipts.filter(isActive)) {
    const entry = await postReceiptAR(receipt);
    if (entry) receiptCount += 1;
  }

  for (const row of returns.filter(isActive)) {
    const entry = await postingEngine.postReturnOrderAR(row);
    if (entry) returnCount += 1;
  }

  console.log(JSON.stringify({ ok: true, collection: 'journals', saleCount, receiptCount, returnCount }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
