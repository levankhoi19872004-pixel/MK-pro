#!/usr/bin/env node
'use strict';

const path = require('node:path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

let mongoose = null;
const { validateArLedgerContract } = require('../src/domain/ar/arLedgerValidator');

function clean(value = '') { return String(value ?? '').trim(); }
function dbNameFromUri(uri = '') {
  try {
    const parsed = new URL(uri.replace(/^mongodb\+srv:/, 'https:').replace(/^mongodb:/, 'http:'));
    return decodeURIComponent(parsed.pathname.replace(/^\//, '') || '(default)');
  } catch (_) { return '(unknown)'; }
}
function classifyAction(row = {}) {
  const validation = validateArLedgerContract(row);
  const errors = validation.errors.map((err) => err.code);
  if (!errors.length) return { action: 'keep', errors };
  if (errors.every((code) => [
    'DIRTY_LEDGER_MISSING_CATEGORY',
    'DIRTY_LEDGER_MISSING_LEDGER_TYPE',
    'DIRTY_LEDGER_MISSING_ENTRY_TYPE',
    'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT'
  ].includes(code)) && /^AR-(SALE|RECEIPT|RETURN)/i.test(clean(row.code || row.id))) {
    return { action: 'normalize_contract_candidate', errors };
  }
  return { action: 'manual_review', errors };
}
function summarize(row = {}) {
  const plan = classifyAction(row);
  return {
    action: plan.action,
    errors: plan.errors,
    id: clean(row.id || row._id),
    code: clean(row.code),
    category: clean(row.category),
    ledgerType: clean(row.ledgerType),
    entryType: clean(row.entryType),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    customerCode: clean(row.customerCode),
    amount: Number(row.amount || 0),
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    active: row.active,
    reversed: row.reversed
  };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!uri) throw new Error('MONGO_URI is required. This script is dry-run/plan only and never modifies data.');
  mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const rows = await db.collection('arLedgers').find({ account: 'AR', accountingConfirmed: true }).sort({ createdAt: -1 }).limit(20000).toArray();
  const dirty = rows.filter((row) => !validateArLedgerContract(row).ok);
  const planned = dirty.map(summarize);
  const counts = planned.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});
  const arDebtOrdersCount = await db.collection('arDebtOrders').countDocuments().catch(() => 0);
  const arDebtCustomersCount = await db.collection('arDebtCustomers').countDocuments().catch(() => 0);

  console.log('# AR Debt Cleanup Plan');
  console.log('');
  console.log('- Mode: dry-run/plan only');
  console.log(`- DB name: ${dbNameFromUri(uri)}`);
  console.log(`- dirtyLedgerCount: ${dirty.length}`);
  console.log(`- arDebtOrdersCount: ${arDebtOrdersCount}`);
  console.log(`- arDebtCustomersCount: ${arDebtCustomersCount}`);
  console.log('');
  console.log('## Recommended source cleanup');
  console.log('- Debt UI/API should use arLedgers canonical directly.');
  console.log('- arDebtOrders/arDebtCustomers are deprecated for UI and may be dropped only in test DB after backup.');
  console.log('- Production cleanup must be backup -> apply explicit repair -> audit -> UI smoke test.');
  console.log('');
  console.log('## Planned actions');
  console.log(JSON.stringify(counts, null, 2));
  console.log('');
  console.log('## Sample plan rows');
  console.log('```json');
  console.log(JSON.stringify(planned.slice(0, 50), null, 2));
  console.log('```');
}

main().catch((err) => {
  console.error(`[plan-ar-debt-cleanup] failed: ${err.message}`);
  process.exitCode = 1;
}).finally(async () => {
  try { if (mongoose) await mongoose.disconnect(); } catch (_) {}
});
