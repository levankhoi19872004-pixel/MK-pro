'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const MongoStore = require('../src/models');
const arDocumentService = require('../src/services/arDocumentService');
const { toNumber } = require('../src/utils/common.util');

function clean(value) { return String(value || '').trim(); }
function pickOrderCode(row = {}) { return clean(row.orderCode || row.salesOrderCode || row.refCode || row.orderId || row.salesOrderId || row.refId); }
function pickOrderId(row = {}) { return clean(row.orderId || row.salesOrderId || row.refId || row.orderCode || row.salesOrderCode || row.refCode); }

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI/MONGO_URI');
  await mongoose.connect(uri);
  const rows = await MongoStore.arLedgers.find({ status: { $ne: 'replaced' } }).lean();
  const groups = new Map();
  for (const row of rows) {
    const key = pickOrderCode(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let migrated = 0;
  for (const [key, ledgers] of groups.entries()) {
    const first = ledgers[0] || {};
    const debit = ledgers.reduce((sum, row) => sum + toNumber(row.debit), 0);
    const cash = ledgers.filter((row) => /receipt|payment|collection/.test(String(row.type || '').toLowerCase()) && /cash|tiền mặt/.test(String(row.method || row.note || '').toLowerCase())).reduce((sum, row) => sum + toNumber(row.credit || row.amount), 0);
    const bank = ledgers.filter((row) => /bank|transfer|chuyển khoản/.test(String(row.type || row.method || row.note || '').toLowerCase())).reduce((sum, row) => sum + toNumber(row.credit || row.amount), 0);
    const returnAmount = ledgers.filter((row) => /return/.test(String(row.type || '').toLowerCase())).reduce((sum, row) => sum + toNumber(row.credit || row.amount), 0);
    const bonusAmount = ledgers.filter((row) => /bonus|discount|allowance/.test(String(row.type || '').toLowerCase())).reduce((sum, row) => sum + toNumber(row.credit || row.amount), 0);
    const order = {
      id: pickOrderId(first),
      code: key,
      customerId: first.customerId || '',
      customerCode: first.customerCode || '',
      customerName: first.customerName || '',
      salesmanCode: first.salesmanCode || first.salesStaffCode || '',
      salesmanName: first.salesmanName || first.salesStaffName || '',
      deliveryStaffCode: first.deliveryStaffCode || '',
      deliveryStaffName: first.deliveryStaffName || '',
      date: first.date || first.createdAt || '',
      deliveryDate: first.date || '',
      totalAmount: debit,
      amount: debit,
      cashAmount: cash,
      bankAmount: bank,
      returnAmount,
      rewardAmount: bonusAmount,
      accountingConfirmedBy: 'migration'
    };
    await arDocumentService.upsertArDocumentForOrder(order, { mode: 'migration', confirmedBy: 'migration' });
    migrated += 1;
  }
  console.log(`Migrated ${migrated} AR documents from ${rows.length} AR ledger rows.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
