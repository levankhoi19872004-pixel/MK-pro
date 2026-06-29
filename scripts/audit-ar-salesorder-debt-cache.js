#!/usr/bin/env node
'use strict';

require('dotenv').config();

const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const Customer = require('../src/models/Customer');
const ArLedger = require('../src/models/ArLedger');
const {
  scanSourceForDebtCacheRisks,
  summarizeArSalesOrderDebtCacheAudit
} = require('./lib/arSalesOrderDebtCacheAudit');

const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const strict = args.has('--strict');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : 5000;

async function loadRows() {
  const [salesOrders, customers, arLedgers] = await Promise.all([
    SalesOrder.find({ $or: [{ debtAmount: { $exists: true } }, { debt: { $exists: true } }, { arBalance: { $exists: true } }, { arDebtAmount: { $exists: true } }, { remainingDebt: { $exists: true } }] })
      .select('_id id code orderCode salesOrderCode customerCode customerId customerName debtAmount debt arBalance arDebtAmount remainingDebt debtCacheSyncedAt debtReadModelSource')
      .limit(limit)
      .lean(),
    Customer.find({ $or: [{ currentDebt: { $exists: true } }, { debtAmount: { $exists: true } }, { debt: { $exists: true } }, { balance: { $exists: true } }, { openingDebt: { $exists: true } }] })
      .select('_id id code customerCode name customerName currentDebt debtAmount debt balance openingDebt')
      .limit(limit)
      .lean(),
    ArLedger.find({})
      .select('_id id code type status reversed isDeleted refType orderId orderCode salesOrderId salesOrderCode refId refCode sourceId sourceCode customerCode customerId customerName debit credit amount')
      .limit(limit * 5)
      .lean()
  ]);
  return { salesOrders, customers, arLedgers };
}

function printHuman(summary) {
  const t = summary.totals || {};
  console.log('AR/SalesOrder debt cache audit (dry-run, không sửa dữ liệu)');
  console.log('='.repeat(72));
  console.log(`SSoT công nợ                         : ${summary.canonical.debtSsot}`);
  console.log(`SalesOrder debt cache                 : ${summary.canonical.salesOrderDebtCache}`);
  console.log(`SalesOrders checked                   : ${t.salesOrdersChecked}`);
  console.log(`Customers checked                     : ${t.customersChecked}`);
  console.log(`ArLedgers checked                     : ${t.arLedgersChecked}`);
  console.log(`SalesOrder cache mismatch             : ${t.salesOrderCacheMismatch}`);
  console.log(`Customer cache mismatch               : ${t.customerCacheMismatch}`);
  console.log(`Source cache-reader risks             : ${t.sourceRiskCount}`);
  console.log(`GET debt side-effect risks            : ${t.getDebtSideEffectRisk}`);
  console.log(`P0 cases                              : ${t.p0Cases}`);
  const examples = [
    ...(summary.p0Cases || []),
    ...(summary.salesOrderMismatches || []).slice(0, 10),
    ...(summary.customerMismatches || []).slice(0, 10),
    ...(summary.sourceRisks || []).slice(0, 10)
  ];
  if (examples.length) {
    console.log('\nVí dụ cảnh báo:');
    for (const item of examples.slice(0, 30)) {
      console.log(`- [${item.severity || 'P1'}] ${item.issue} ${item.file ? `| file=${item.file}` : ''} ${item.code ? `| code=${item.code}` : ''} ${item.diff !== undefined ? `| diff=${item.diff}` : ''}`);
    }
  }
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const sourceRisks = scanSourceForDebtCacheRisks(rootDir);
  await connectDB();
  const rows = await loadRows();
  const summary = summarizeArSalesOrderDebtCacheAudit({ ...rows, sourceRisks });
  summary.commands = {
    audit: 'node scripts/audit-ar-salesorder-debt-cache.js --dry-run',
    auditJson: 'node scripts/audit-ar-salesorder-debt-cache.js --json'
  };
  if (json) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);
  await mongoose.connection.close();
  if (strict && summary.totals?.p0Cases) process.exit(2);
}

main().catch(async (err) => {
  console.error('[audit-ar-salesorder-debt-cache] failed:', err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});
