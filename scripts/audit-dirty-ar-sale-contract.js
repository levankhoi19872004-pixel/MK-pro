#!/usr/bin/env node
'use strict';

const path = require('node:path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {
  // dotenv is optional for production Render env vars and unavailable in some audit sandboxes.
}

let mongoose = null;
const { validateArLedgerContract } = require('../src/domain/ar/arLedgerValidator');

function clean(value = '') {
  return String(value ?? '').trim();
}

function classify(row = {}) {
  const category = clean(row.category).toUpperCase();
  const ledgerType = clean(row.ledgerType).toUpperCase();
  const code = clean(row.code || row.id).toUpperCase();
  if (category) return category;
  if (ledgerType) return ledgerType;
  if (code.startsWith('AR-SALE-REVERSAL')) return 'AR-SALE-REVERSAL';
  if (code.startsWith('AR-SALE')) return 'AR-SALE';
  if (code.startsWith('AR-RECEIPT')) return 'AR-RECEIPT';
  if (code.startsWith('AR-RETURN')) return 'AR-RETURN';
  return 'UNKNOWN';
}

function dbNameFromUri(uri = '') {
  try {
    const parsed = new URL(uri.replace(/^mongodb\+srv:/, 'https:').replace(/^mongodb:/, 'http:'));
    return decodeURIComponent(parsed.pathname.replace(/^\//, '') || '(default)');
  } catch (_) {
    return '(unknown)';
  }
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!uri) throw new Error('MONGO_URI is required. This script is dry-run/report only and does not modify data.');
  mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const filter = {
    account: 'AR',
    accountingConfirmed: true,
    $or: [
      { category: '' }, { category: { $exists: false } },
      { ledgerType: '' }, { ledgerType: { $exists: false } },
      { entryType: '' }, { entryType: { $exists: false } },
      { active: { $exists: false } }, { reversed: { $exists: false } }
    ]
  };
  const rows = await db.collection('arLedgers').find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
  const byKind = new Map();
  const affectedOrders = new Set();
  const affectedCustomers = new Set();
  const samples = [];
  for (const row of rows) {
    const kind = classify(row);
    const item = byKind.get(kind) || { count: 0, invalidContract: 0, acc: 0, rev: 0 };
    item.count += 1;
    if (!validateArLedgerContract(row).ok) item.invalidContract += 1;
    if (/^ACC-/i.test(clean(row.accountingBatchId))) item.acc += 1;
    if (/^REV-/i.test(clean(row.accountingBatchId))) item.rev += 1;
    byKind.set(kind, item);
    const order = clean(row.orderCode || row.salesOrderCode || row.sourceCode || row.orderId || row.salesOrderId || row.sourceId);
    const customer = clean(row.customerCode || row.customerId);
    if (order) affectedOrders.add(order);
    if (customer) affectedCustomers.add(customer);
    if (samples.length < 20) {
      samples.push({
        id: clean(row.id || row._id),
        code: clean(row.code),
        kind,
        accountingBatchId: clean(row.accountingBatchId),
        customerCode: customer,
        orderCode: order,
        amount: row.amount,
        category: clean(row.category),
        ledgerType: clean(row.ledgerType),
        entryType: clean(row.entryType),
        active: row.active,
        reversed: row.reversed,
        errors: validateArLedgerContract(row).errors.map((err) => err.code)
      });
    }
  }

  console.log('# Dirty AR Ledger Contract Audit');
  console.log('');
  console.log(`- Mode: dry-run/report only`);
  console.log(`- DB name: ${dbNameFromUri(uri)}`);
  console.log(`- Total dirty AR ledger rows scanned: ${rows.length}`);
  console.log(`- Affected customers: ${affectedCustomers.size}`);
  console.log(`- Affected orders: ${affectedOrders.size}`);
  console.log('');
  console.log('| Kind | Count | Invalid contract | ACC batch | REV batch |');
  console.log('|---|---:|---:|---:|---:|');
  for (const [kind, item] of [...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`| ${kind} | ${item.count} | ${item.invalidContract} | ${item.acc} | ${item.rev} |`);
  }
  console.log('');
  console.log('## Sample rows');
  console.log('');
  console.log('```json');
  console.log(JSON.stringify(samples, null, 2));
  console.log('```');
  console.log('');
  console.log('Recommended action: review samples, rebuild read model in dry-run, then create an explicit repair plan. This script never applies repair.');
}

main().catch((err) => {
  console.error(`[audit-dirty-ar-sale-contract] failed: ${err.message}`);
  process.exitCode = 1;
}).finally(async () => {
  try { if (mongoose) await mongoose.disconnect(); } catch (_) {}
});
