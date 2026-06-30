#!/usr/bin/env node
'use strict';

const path = require('node:path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

let mongoose = null;
const { validateArLedgerContract, isCanonicalArDebtLedger } = require('../src/domain/ar/arLedgerValidator');

function clean(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return clean(value).toUpperCase(); }
function dbNameFromUri(uri = '') {
  try {
    const parsed = new URL(uri.replace(/^mongodb\+srv:/, 'https:').replace(/^mongodb:/, 'http:'));
    return decodeURIComponent(parsed.pathname.replace(/^\//, '') || '(default)');
  } catch (_) { return '(unknown)'; }
}
function summarize(row = {}) {
  const validation = validateArLedgerContract(row);
  return {
    id: clean(row.id || row._id),
    code: clean(row.code),
    category: clean(row.category),
    ledgerType: clean(row.ledgerType),
    entryType: clean(row.entryType),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    orderCode: clean(row.orderCode || row.salesOrderCode || row.sourceCode),
    customerCode: clean(row.customerCode),
    deliveryStaffCode: clean(row.deliveryStaffCode),
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    amount: Number(row.amount || 0),
    active: row.active,
    reversed: row.reversed,
    accountingConfirmed: row.accountingConfirmed === true,
    accountingStatus: clean(row.accountingStatus),
    idempotencyKey: clean(row.idempotencyKey),
    errors: validation.errors.map((err) => err.code)
  };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!uri) throw new Error('MONGO_URI is required. This script is dry-run/report only and never modifies data.');
  mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const ar = db.collection('arLedgers');
  const [totalArLedgers, arDebtOrdersCount, arDebtCustomersCount] = await Promise.all([
    ar.countDocuments({ account: 'AR', accountingConfirmed: true }),
    db.collection('arDebtOrders').countDocuments().catch(() => 0),
    db.collection('arDebtCustomers').countDocuments().catch(() => 0)
  ]);
  const rows = await ar.find({ account: 'AR', accountingConfirmed: true }).sort({ createdAt: -1 }).limit(20000).toArray();
  const dirty = [];
  const dirtyByCategory = new Map();
  const missing = { category: 0, ledgerType: 0, entryType: 0, active: 0, reversed: 0, sourceId: 0, sourceCode: 0, customerCode: 0 };
  const ledgerWithoutOrderKey = [];
  let canonicalArLedgers = 0;
  for (const row of rows) {
    const category = upper(row.category || row.ledgerType || 'UNKNOWN');
    if (isCanonicalArDebtLedger(row)) canonicalArLedgers += 1;
    const validation = validateArLedgerContract(row);
    if (!validation.ok) {
      dirty.push(row);
      dirtyByCategory.set(category, (dirtyByCategory.get(category) || 0) + 1);
    }
    if (!clean(row.category)) missing.category += 1;
    if (!clean(row.ledgerType)) missing.ledgerType += 1;
    if (!clean(row.entryType)) missing.entryType += 1;
    if (row.active !== true) missing.active += 1;
    if (row.reversed === undefined) missing.reversed += 1;
    if (!clean(row.sourceId)) missing.sourceId += 1;
    if (!clean(row.sourceCode)) missing.sourceCode += 1;
    if (!clean(row.customerCode)) missing.customerCode += 1;
    if (!clean(row.orderCode || row.salesOrderCode || row.sourceCode || row.sourceId)) ledgerWithoutOrderKey.push(row);
  }

  const simulatedOrders = new Map();
  for (const row of rows.filter(isCanonicalArDebtLedger)) {
    const key = `${clean(row.customerCode)}::${clean(row.sourceId)}`;
    if (!simulatedOrders.has(key)) simulatedOrders.set(key, { debit: 0, credit: 0, customerCode: clean(row.customerCode) });
    const target = simulatedOrders.get(key);
    target.debit += Number(row.debit || 0);
    target.credit += Number(row.credit || 0);
  }
  const openOrders = Array.from(simulatedOrders.values()).filter((row) => Math.round(row.debit - row.credit) > 1000);
  const openCustomers = new Set(openOrders.map((row) => row.customerCode).filter(Boolean));

  console.log('# AR Debt Cleanliness Audit');
  console.log('');
  console.log('- Mode: dry-run/report only');
  console.log(`- DB name: ${dbNameFromUri(uri)}`);
  console.log(`- totalArLedgers: ${totalArLedgers}`);
  console.log(`- canonicalArLedgers: ${canonicalArLedgers}`);
  console.log(`- dirtyArLedgers: ${dirty.length}`);
  console.log(`- arDebtOrdersCount: ${arDebtOrdersCount}`);
  console.log(`- arDebtCustomersCount: ${arDebtCustomersCount}`);
  console.log(`- debtApiWouldReturnOrders: ${openOrders.length}`);
  console.log(`- debtApiWouldReturnCustomers: ${openCustomers.size}`);
  console.log('');
  console.log('## Missing contract fields');
  console.log(JSON.stringify(missing, null, 2));
  console.log('');
  console.log('## Dirty by category');
  console.log(JSON.stringify(Object.fromEntries([...dirtyByCategory.entries()].sort()), null, 2));
  console.log('');
  console.log('## Sample dirty ledgers');
  console.log('```json');
  console.log(JSON.stringify(dirty.slice(0, 20).map(summarize), null, 2));
  console.log('```');
  console.log('');
  console.log('## Sample ledger without order key');
  console.log('```json');
  console.log(JSON.stringify(ledgerWithoutOrderKey.slice(0, 20).map(summarize), null, 2));
  console.log('```');
}

main().catch((err) => {
  console.error(`[audit-ar-debt-cleanliness] failed: ${err.message}`);
  process.exitCode = 1;
}).finally(async () => {
  try { if (mongoose) await mongoose.disconnect(); } catch (_) {}
});
