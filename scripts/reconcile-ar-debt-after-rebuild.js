#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArDebtOrder = require('../src/models/ArDebtOrder');
const ArDebtCustomer = require('../src/models/ArDebtCustomer');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function clean(value = '') { return String(value ?? '').trim(); }
function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] || '' : '';
  };
  return { dryRun: args.has('--dry-run'), all: args.has('--all') || (!valueOf('--sourceId') && !valueOf('--customerCode')), sourceId: valueOf('--sourceId'), customerCode: valueOf('--customerCode'), json: args.has('--json') };
}

function compareByKey(expected = [], actual = [], keyField = 'id') {
  const mapExpected = new Map(expected.map((row) => [clean(row[keyField]), row]));
  const mapActual = new Map(actual.map((row) => [clean(row[keyField]), row]));
  const mismatches = [];
  for (const [key, exp] of mapExpected) {
    const act = mapActual.get(key);
    if (!act) { mismatches.push({ key, reason: 'missing in read model', expected: exp }); continue; }
    for (const field of ['debit', 'credit', 'remainingDebt', 'rawDebt', 'orderCount', 'ledgerCount']) {
      if (Math.round(Number(exp[field] || 0)) !== Math.round(Number(act[field] || 0))) {
        mismatches.push({ key, field, expected: exp[field] || 0, actual: act[field] || 0 });
      }
    }
  }
  for (const [key, act] of mapActual) if (!mapExpected.has(key)) mismatches.push({ key, reason: 'extra in read model', actual: act });
  return mismatches;
}

async function expectedFromCanonical(options = {}) {
  if (options.sourceId) return arDebtReadModel.rebuildDebtForSource(options.sourceId, { ...options, dryRun: true });
  if (options.customerCode) return arDebtReadModel.rebuildDebtForCustomer(options.customerCode, { ...options, dryRun: true });
  return arDebtReadModel.rebuildAllDebtReadModels({ ...options, dryRun: true });
}

async function actualReadModel(options = {}) {
  const filter = {};
  if (options.sourceId) filter.sourceId = options.sourceId;
  if (options.customerCode) filter.customerCode = options.customerCode;
  const customerFilter = options.customerCode ? { customerCode: options.customerCode } : {};
  const [debtOrders, debtCustomers] = await Promise.all([
    ArDebtOrder.find(filter).lean(),
    ArDebtCustomer.find(customerFilter).lean()
  ]);
  return { debtOrders, debtCustomers };
}

async function reconcile(options = {}) {
  const expected = await expectedFromCanonical(options);
  const actual = await actualReadModel(options);
  const orderMismatches = compareByKey(expected.debtOrders, actual.debtOrders, 'id');
  const customerMismatches = compareByKey(expected.debtCustomers, actual.debtCustomers, 'id');
  return {
    mode: 'reconcile-after-rebuild',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    scope: options.sourceId ? 'source' : (options.customerCode ? 'customer' : 'all'),
    sourceId: options.sourceId || '',
    customerCode: options.customerCode || '',
    counts: {
      expectedOrders: expected.debtOrders.length,
      actualOrders: actual.debtOrders.length,
      expectedCustomers: expected.debtCustomers.length,
      actualCustomers: actual.debtCustomers.length,
      rejectedCanonicalLedgers: expected.rejectedLedgers.length,
      orderMismatchCount: orderMismatches.length,
      customerMismatchCount: customerMismatches.length
    },
    orderMismatches,
    customerMismatches,
    ok: orderMismatches.length === 0 && customerMismatches.length === 0 && expected.rejectedLedgers.length === 0
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await reconcile(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('AR debt reconcile after rebuild (read-only)');
    console.log(JSON.stringify(result.counts, null, 2));
    console.log(result.ok ? 'OK: canonical arLedgers == debtOrders == debtCustomers' : 'FAIL: read model mismatch hoặc có ledger bị reject');
  }
  await mongoose.connection.close();
  if (!result.ok) process.exit(2);
}

if (require.main === module) main().catch(async (err) => { console.error('[reconcile-ar-debt-after-rebuild] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { reconcile, compareByKey };
