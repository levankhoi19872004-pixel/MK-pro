#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

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

async function run(options = {}) {
  if (options.sourceId) return arDebtReadModel.rebuildDebtForSource(options.sourceId, options);
  if (options.customerCode) return arDebtReadModel.rebuildDebtForCustomer(options.customerCode, options);
  return arDebtReadModel.rebuildAllDebtReadModels(options);
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await run(options);
  const summary = {
    mode: options.dryRun ? 'dry-run' : 'apply-read-model-only',
    scope: result.scope,
    sourceId: result.sourceId || '',
    customerCode: result.customerCode || '',
    canonicalLedgerCount: result.canonicalLedgers.length,
    rejectedLedgerCount: result.rejectedLedgers.length,
    debtOrderCount: result.debtOrders.length,
    debtCustomerCount: result.debtCustomers.length,
    persist: result.persist
  };
  if (options.json) console.log(JSON.stringify({ summary, result }, null, 2));
  else console.log(JSON.stringify(summary, null, 2));
  await mongoose.connection.close();
  if (result.rejectedLedgers.length) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => { console.error('[rebuild-ar-debt-read-model] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { run };
