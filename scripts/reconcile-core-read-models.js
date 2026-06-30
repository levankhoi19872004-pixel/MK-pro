#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

let deps = null;
function getDeps() {
  if (deps) return deps;
  deps = {
    mongoose: require('mongoose'),
    connectDB: require('../src/config/db'),
    arDebtReadModel: require('../src/services/arDebtReadModel.service'),
    ArDebtOrder: require('../src/models/ArDebtOrder'),
    ArDebtCustomer: require('../src/models/ArDebtCustomer'),
    inventoryStockService: require('../src/services/inventoryStock.service'),
    FundLedger: require('../src/models/FundLedger'),
    validateFundLedgerContract: require('../src/utils/assertFundLedgerContract.util').validateFundLedgerContract
  };
  return deps;
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  return {
    json: args.has('--json'),
    dryRun: !args.has('--apply'),
    skipDb: args.has('--skip-db')
  };
}

function compareTotals(expected = [], actual = [], amountField = 'remainingDebt') {
  const expectedTotal = expected.reduce((sum, row) => sum + money(row[amountField]), 0);
  const actualTotal = actual.reduce((sum, row) => sum + money(row[amountField]), 0);
  return { expectedTotal, actualTotal, diff: actualTotal - expectedTotal };
}

async function reconcileAr() {
  const { arDebtReadModel, ArDebtOrder, ArDebtCustomer } = getDeps();
  const expected = await arDebtReadModel.rebuildAllDebtReadModels({ dryRun: true });
  const [actualOrders, actualCustomers] = await Promise.all([
    ArDebtOrder.find({}).lean(),
    ArDebtCustomer.find({}).lean()
  ]);
  return {
    source: 'canonical arLedgers -> arDebtOrders/arDebtCustomers',
    expectedOrders: expected.debtOrders.length,
    actualOrders: actualOrders.length,
    expectedCustomers: expected.debtCustomers.length,
    actualCustomers: actualCustomers.length,
    orderDebt: compareTotals(expected.debtOrders, actualOrders),
    customerDebt: compareTotals(expected.debtCustomers, actualCustomers),
    rejectedCanonicalLedgers: expected.rejectedLedgers.length,
    ok: expected.debtOrders.length === actualOrders.length
      && expected.debtCustomers.length === actualCustomers.length
      && compareTotals(expected.debtOrders, actualOrders).diff === 0
      && compareTotals(expected.debtCustomers, actualCustomers).diff === 0
      && expected.rejectedLedgers.length === 0
  };
}

async function reconcileInventory() {
  const { inventoryStockService } = getDeps();
  const rows = await inventoryStockService.getCurrentStock({});
  const stockRows = Array.isArray(rows) ? rows : [];
  const totalAvailableQty = stockRows.reduce((sum, row) => sum + Number(row.availableQty ?? row.quantity ?? row.qty ?? 0), 0);
  const negativeRows = stockRows.filter((row) => Number(row.availableQty ?? row.quantity ?? row.qty ?? 0) < 0);
  return {
    source: 'stockTransactions -> inventories current model',
    rowCount: stockRows.length,
    totalAvailableQty,
    negativeStockCount: negativeRows.length,
    ok: negativeRows.length === 0
  };
}

async function reconcileFund() {
  const { FundLedger, validateFundLedgerContract } = getDeps();
  const rows = await FundLedger.find({ isDeleted: { $ne: true }, deletedAt: { $in: [null, ''] } }).limit(20000).lean();
  const invalid = [];
  for (const row of rows) {
    const validation = validateFundLedgerContract(row);
    if (!validation.ok) invalid.push({ ledgerId: validation.ledgerId, errors: validation.errors });
  }
  const totalIn = rows.filter((row) => String(row.direction || '').toLowerCase() === 'in').reduce((sum, row) => sum + money(row.amount), 0);
  const totalOut = rows.filter((row) => String(row.direction || '').toLowerCase() === 'out').reduce((sum, row) => sum + money(row.amount), 0);
  return {
    source: 'fundLedgers canonical contract',
    rowCount: rows.length,
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
    invalidCount: invalid.length,
    invalid: invalid.slice(0, 100),
    ok: invalid.length === 0
  };
}

async function reconcile(options = {}) {
  const [ar, inventory, fund] = await Promise.all([reconcileAr(), reconcileInventory(), reconcileFund()]);
  return {
    mode: 'core-read-models-read-only',
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun !== false,
    ar,
    inventory,
    fund,
    ok: ar.ok && inventory.ok && fund.ok
  };
}

async function main() {
  const options = parseArgs();
  if (options.skipDb) {
    const result = { mode: 'core-read-models-read-only', skipped: true, reason: '--skip-db', generatedAt: new Date().toISOString() };
    console.log(options.json ? JSON.stringify(result, null, 2) : 'Skipped DB reconcile (--skip-db).');
    return;
  }
  const { connectDB, mongoose } = getDeps();
  await connectDB();
  const result = await reconcile(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('Core read model reconcile (read-only)');
    console.log(JSON.stringify({ ok: result.ok, ar: result.ar, inventory: result.inventory, fund: { ...result.fund, invalid: undefined } }, null, 2));
  }
  await mongoose.connection.close();
  if (!result.ok) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[reconcile-core-read-models] failed:', err);
  try { if (deps?.mongoose?.connection) await deps.mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { reconcile, reconcileAr, reconcileInventory, reconcileFund };
