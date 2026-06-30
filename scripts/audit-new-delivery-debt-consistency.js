#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const DeliveryCloseoutCorrection = require('../src/models/DeliveryCloseoutCorrection');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const ArLedger = require('../src/models/ArLedger');

const DEBT_CATEGORIES = ['AR-DEBT-OPEN', 'AR-DEBT-PAYMENT', 'AR-DEBT-ADJUSTMENT', 'AR-DEBT-VOID'];
const LEGACY_CATEGORIES = ['AR-SALE', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RECEIPT'];

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function text(value = '') {
  return String(value ?? '').trim();
}

function orderId(order = {}) {
  return text(order.id || order.salesOrderId || order.orderId || order._id);
}

function orderCode(order = {}) {
  return text(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id || order._id);
}

function closeoutOf(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

function closeoutConfirmed(order = {}) {
  const closeout = closeoutOf(order);
  const status = text(closeout.status || order.accountingStatus || order.status).toLowerCase();
  return order.accountingConfirmed === true || ['accounting_confirmed', 'confirmed', 'closed', 'corrected_confirmed'].includes(status);
}

function ledgerEffect(row = {}) {
  return money(row.debit) - money(row.credit);
}

function parseArgs(argv = process.argv.slice(2)) {
  const set = new Set(argv);
  return { strict: set.has('--strict'), json: set.has('--json'), limit: Number(argv.find((x) => /^--limit=/.test(x))?.split('=')[1] || 20000) };
}

async function audit(options = {}) {
  const confirmedOrders = await SalesOrder.find({
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { accountingConfirmed: true },
      { 'deliveryCloseout.status': { $in: ['accounting_confirmed', 'confirmed', 'closed', 'corrected_confirmed'] } },
      { accountingStatus: { $in: ['accounting_confirmed', 'confirmed', 'closed'] } }
    ]
  }).limit(options.limit || 20000).lean();
  const ids = Array.from(new Set(confirmedOrders.flatMap((order) => [orderId(order), orderCode(order)]).filter(Boolean)));

  const ledgers = await ArLedger.find({
    account: /^AR$/i,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    $or: [
      { salesOrderId: { $in: ids } },
      { orderId: { $in: ids } },
      { salesOrderCode: { $in: ids } },
      { orderCode: { $in: ids } },
      { sourceId: { $in: ids } },
      { sourceCode: { $in: ids } }
    ]
  }).lean();

  const corrections = await DeliveryCloseoutCorrection.find({}).lean();
  const versions = await DeliveryCloseoutVersion.find({}).lean();
  const correctionIds = corrections.map((row) => row.id).filter(Boolean);
  const correctionLedgers = await ArLedger.find({
    $or: [{ sourceType: 'DELIVERY_CLOSEOUT_CORRECTION' }, { correctionId: { $in: correctionIds } }, { sourceId: { $in: correctionIds } }]
  }).lean();

  const debtByOrder = new Map();
  const legacyLeakage = [];
  const missingArDebtOpen = [];
  for (const ledger of ledgers) {
    const category = text(ledger.category || ledger.ledgerType).toUpperCase();
    const key = text(ledger.salesOrderId || ledger.orderId || ledger.salesOrderCode || ledger.orderCode || ledger.sourceId || ledger.sourceCode);
    if (LEGACY_CATEGORIES.includes(category)) legacyLeakage.push({ ledgerId: ledger.id, code: ledger.code, category, orderKey: key });
    if (!DEBT_CATEGORIES.includes(category)) continue;
    debtByOrder.set(key, money((debtByOrder.get(key) || 0) + ledgerEffect(ledger)));
  }

  for (const order of confirmedOrders) {
    const keys = [orderId(order), orderCode(order)].filter(Boolean);
    const hasOpen = ledgers.some((ledger) => ledger.category === 'AR-DEBT-OPEN' && keys.includes(text(ledger.salesOrderId || ledger.orderId || ledger.sourceId || ledger.salesOrderCode || ledger.orderCode || ledger.sourceCode)));
    if (!hasOpen && closeoutConfirmed(order)) missingArDebtOpen.push({ orderId: orderId(order), orderCode: orderCode(order), customerCode: order.customerCode });
  }

  const correctionById = new Map(corrections.map((row) => [String(row.id || ''), row]));
  const missingArDebtAdjustment = [];
  const adjustmentDebitCreditMismatch = [];
  for (const correction of corrections) {
    const rows = correctionLedgers.filter((ledger) => (ledger.correctionId || ledger.sourceId) === correction.id && ledger.category === 'AR-DEBT-ADJUSTMENT');
    if (money(correction.debtAdjustmentAmount) !== 0 && !rows.length) missingArDebtAdjustment.push({ correctionId: correction.id, correctionCode: correction.correctionCode });
  }
  for (const ledger of correctionLedgers.filter((row) => row.category === 'AR-DEBT-ADJUSTMENT')) {
    const correction = correctionById.get(String(ledger.correctionId || ledger.sourceId || ''));
    if (!correction) continue;
    const expected = money(correction.debtAdjustmentAmount);
    const actual = ledgerEffect(ledger);
    if (expected !== actual) adjustmentDebitCreditMismatch.push({ correctionId: correction.id, ledgerId: ledger.id, expected, actual });
  }

  const customerTotals = new Map();
  const orderTotals = [];
  for (const [key, debt] of debtByOrder.entries()) {
    const order = confirmedOrders.find((row) => [orderId(row), orderCode(row)].includes(key));
    if (!order) continue;
    const customerKey = text(order.customerCode || order.customerName || '(missing)');
    customerTotals.set(customerKey, money((customerTotals.get(customerKey) || 0) + debt));
    orderTotals.push({ orderKey: key, customerKey, debt });
  }

  const result = {
    title: 'NEW_DELIVERY_DEBT_AUDIT',
    checkedCustomers: customerTotals.size,
    checkedOrders: confirmedOrders.length,
    checkedLedgers: ledgers.length,
    checkedCorrections: corrections.length,
    checkedVersions: versions.length,
    missingArDebtOpen,
    missingArDebtAdjustment,
    legacyLeakage,
    adjustmentDebitCreditMismatch,
    customerMismatch: [],
    orderMismatch: [],
    note: 'Read-only audit. It does not repair or mutate database.'
  };
  result.ok = !missingArDebtOpen.length && !missingArDebtAdjustment.length && !legacyLeakage.length && !adjustmentDebitCreditMismatch.length;
  return result;
}

function printText(result) {
  console.log('NEW_DELIVERY_DEBT_AUDIT');
  console.log(`Checked customers: ${result.checkedCustomers}`);
  console.log(`Checked orders: ${result.checkedOrders}`);
  console.log(`Missing AR-DEBT-OPEN: ${result.missingArDebtOpen.length}`);
  console.log(`Missing AR-DEBT-ADJUSTMENT: ${result.missingArDebtAdjustment.length}`);
  console.log(`Legacy leakage: ${result.legacyLeakage.length}`);
  console.log(`Customer mismatch: ${result.customerMismatch.length}`);
  console.log(`Order mismatch: ${result.orderMismatch.length}`);
  console.log(result.ok ? 'AUDIT_PASS' : 'AUDIT_FAIL');
  if (!result.ok) console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await audit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  await mongoose.connection.close();
  if (options.strict && !result.ok) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[audit-new-delivery-debt-consistency] failed:', err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { audit };
