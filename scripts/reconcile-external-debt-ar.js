#!/usr/bin/env node
'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const ExternalDebtOrder = require('../src/models/ExternalDebtOrder');
const { summarizeExternalDebtAr } = require('./lib/externalDebtArReconcile');

const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const strict = args.has('--strict');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : 10000;

async function loadRows() {
  const [externalDebtOrders, arLedgers] = await Promise.all([
    ExternalDebtOrder.find({})
      .select('_id id code status accountingStatus accountingConfirmed customerId customerCode customerName totalAmount documentDate arLedgerId arLedgerCode')
      .limit(limit)
      .lean(),
    ArLedger.find({
      $or: [
        { type: 'ar_external_debt' },
        { ledgerType: 'AR-EXTERNAL-DEBT' },
        { category: 'AR-EXTERNAL-DEBT' },
        { orderType: 'external_debt' },
        { code: /^AR-EXTERNAL-/ },
        { id: /^AR-EXTERNAL-/ }
      ]
    })
      .select('_id id code type ledgerType category status accountingStatus reversed isDeleted deletedAt orderType sourceType sourceId sourceCode orderId orderCode refId refCode customerId customerCode customerName amount debit credit date idempotencyKey')
      .limit(limit * 5)
      .lean()
  ]);
  return { externalDebtOrders, arLedgers };
}

function printHuman(summary = {}) {
  const t = summary.totals || {};
  console.log('External debt AR reconcile (dry-run, không sửa dữ liệu)');
  console.log('='.repeat(72));
  console.log(`Canonical ledger type                  : ${summary.canonical?.ledgerType}`);
  console.log(`Canonical sourceType                   : ${summary.canonical?.sourceType}`);
  console.log(`External debt orders checked           : ${t.externalDebtOrders}`);
  console.log(`AR external debt ledgers checked       : ${t.arExternalDebtLedgers}`);
  console.log(`Active AR external debt ledgers        : ${t.activeArExternalDebtLedgers}`);
  console.log(`P0 cases                               : ${t.p0Cases}`);
  console.log(`P1 cases                               : ${t.p1Cases}`);
  if ((summary.cases || []).length) {
    console.log('\nCases:');
    for (const item of summary.cases.slice(0, 50)) {
      console.log(`- [${item.severity}] ${item.issue} | key=${item.key} | count=${item.count}`);
    }
  }
}

async function main() {
  await connectDB();
  const rows = await loadRows();
  const summary = summarizeExternalDebtAr(rows);
  summary.commands = {
    reconcile: 'node scripts/reconcile-external-debt-ar.js --dry-run',
    reconcileJson: 'node scripts/reconcile-external-debt-ar.js --json'
  };
  if (json) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);
  await mongoose.connection.close();
  if (strict && summary.totals?.p0Cases) process.exit(2);
}

main().catch(async (err) => {
  console.error('[reconcile-external-debt-ar] failed:', err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});
