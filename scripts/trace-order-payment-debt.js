#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const ArLedger = require('../src/models/ArLedger');
const debtNewService = require('../src/services/v2/debtNew.service');
const dateUtil = require('../src/utils/date.util');
const { normalizeAccountingAmount } = require('../src/domain/ar/arLedgerValidator');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');
const OrderPaymentDebtReconcileService = require('../src/services/accounting/OrderPaymentDebtReconcileService');

const ACTIVE_EXCLUDED_STATUSES = ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'superseded'];

function clean(value = '') { return String(value ?? '').trim(); }
function money(value) { const n = Number(value || 0); return Number.isFinite(n) ? Math.round(n) : 0; }
function uniq(values = []) { return Array.from(new Set((values || []).map(clean).filter(Boolean))); }
function parseArgs(argv = process.argv.slice(2)) {
  const out = { json: false, zeroTolerance: 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--order') out.orderCode = argv[++i];
    else if (arg.startsWith('--order=')) out.orderCode = arg.slice('--order='.length);
    else if (arg === '--customer') out.customerCode = argv[++i];
    else if (arg.startsWith('--customer=')) out.customerCode = arg.slice('--customer='.length);
    else if (arg === '--zero-tolerance') out.zeroTolerance = Number(argv[++i] || 1000);
    else if (arg.startsWith('--zero-tolerance=')) out.zeroTolerance = Number(arg.slice('--zero-tolerance='.length) || 1000);
  }
  return out;
}
function maskMongoUri(uri = '') {
  const s = clean(uri);
  if (!s) return '';
  return s.replace(/(mongodb(?:\+srv)?:\/\/)([^:@/]+)(?::([^@/]*))?@/i, (_, proto, user) => `${proto}${user}:***@`);
}
function activeFilter(extra = {}) {
  return { ...extra, reversed: { $ne: true }, isDeleted: { $ne: true }, deleted: { $ne: true }, status: { $nin: ACTIVE_EXCLUDED_STATUSES } };
}
function orderCodeOf(order = {}) { return clean(order.orderCode || order.code || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id); }
function orderIdOf(order = {}) { return clean(order.orderId || order.id || order._id || order.salesOrderId || orderCodeOf(order)); }
function orderKeys(row = {}) {
  return uniq([row.orderCode, row.code, row.salesOrderCode, row.documentCode, row.invoiceCode, row.orderId, row.id, row._id, row.salesOrderId, row.sourceId, row.sourceCode, row.closeoutCode, row.originalCloseoutId, row.originalCloseoutCode, row.allocationCode, row.idempotencyKey]);
}
function arOrderMatch(keys = [], customerCode = '') {
  const or = [
    { orderCode: { $in: keys } }, { salesOrderCode: { $in: keys } }, { sourceCode: { $in: keys } }, { refCode: { $in: keys } }, { referenceCode: { $in: keys } },
    { orderId: { $in: keys } }, { salesOrderId: { $in: keys } }, { sourceId: { $in: keys } }, { refId: { $in: keys } }, { referenceId: { $in: keys } }
  ];
  const match = activeFilter({ $or: or });
  if (clean(customerCode)) match.customerCode = clean(customerCode);
  return match;
}
async function loadOrder(orderCode = '') {
  const value = clean(orderCode);
  if (!value) return null;
  return SalesOrder.findOne({
    $and: [
      { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }, { deletedAt: '' }] },
      { isDeleted: { $ne: true } },
      { deleted: { $ne: true } },
      { status: { $nin: ACTIVE_EXCLUDED_STATUSES } },
      { $or: [{ code: value }, { orderCode: value }, { salesOrderCode: value }, { documentCode: value }, { invoiceCode: value }, { id: value }] }
    ]
  }).sort({ deliveryDate: -1, orderDate: -1, createdAt: -1 }).lean();
}
async function loadCloseout(order = {}) {
  const keys = orderKeys(order);
  const version = await DeliveryCloseoutVersion.findOne({
    $or: [
      { salesOrderId: { $in: keys } }, { salesOrderCode: { $in: keys } }, { orderId: { $in: keys } }, { orderCode: { $in: keys } },
      { originalCloseoutId: { $in: keys } }, { originalCloseoutCode: { $in: keys } }, { closeoutCode: { $in: keys } }
    ],
    status: { $nin: ACTIVE_EXCLUDED_STATUSES }
  }).sort({ closeoutVersion: -1, sourceVersion: -1, updatedAt: -1, createdAt: -1 }).lean();
  if (version) {
    return {
      found: true,
      sourceLabel: 'deliveryCloseoutVersions/latest',
      sourceType: 'delivery_closeout_version',
      sourceId: clean(version.id || version._id || version.closeoutId || version.originalCloseoutId || version.closeoutCode),
      sourceCode: clean(version.code || version.closeoutCode || version.orderCode),
      sourceVersion: Number(version.sourceVersion || version.closeoutVersion || version.version || 1) || 1,
      closeout: version
    };
  }
  const closeout = order.deliveryCloseout || order.closeout || null;
  if (closeout && typeof closeout === 'object') {
    return {
      found: true,
      sourceLabel: 'salesOrders.deliveryCloseout',
      sourceType: 'delivery_closeout',
      sourceId: clean(closeout.id || closeout.closeoutId || order.id || order._id || order.orderId || orderCodeOf(order)),
      sourceCode: clean(closeout.code || closeout.closeoutCode || orderCodeOf(order)),
      sourceVersion: Number(closeout.sourceVersion || closeout.closeoutVersion || closeout.version || 1) || 1,
      closeout
    };
  }
  return { found: false, closeout: {} };
}
async function loadAllocation(order = {}, closeoutInfo = {}) {
  const keys = uniq([...orderKeys(order), ...orderKeys(closeoutInfo.closeout || {}), closeoutInfo.sourceId, closeoutInfo.sourceCode]);
  return OrderPaymentAllocation.findOne(activeFilter({
    $or: [
      { orderId: { $in: keys } }, { orderCode: { $in: keys } }, { sourceId: { $in: keys } }, { sourceCode: { $in: keys } }, { allocationCode: { $in: keys } }
    ]
  })).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1, createdAt: -1 }).lean();
}
function closeoutMoney(closeout = {}, keys = []) {
  for (const key of keys) if (closeout[key] !== undefined && closeout[key] !== null && clean(closeout[key]) !== '') return money(closeout[key]);
  return 0;
}
async function loadArLedgers(order = {}, allocation = {}, closeoutInfo = {}) {
  const keys = uniq([...orderKeys(order), ...orderKeys(allocation || {}), closeoutInfo.sourceId, closeoutInfo.sourceCode]);
  const rows = await ArLedger.find(arOrderMatch(keys, clean((allocation || {}).customerCode || order.customerCode))).sort({ createdAt: 1 }).limit(2000).lean();
  let debitTotal = 0;
  let creditTotal = 0;
  const ledgers = (rows || []).map((row) => {
    const amounts = normalizeAccountingAmount(row);
    debitTotal = money(debitTotal + money(amounts.debit));
    creditTotal = money(creditTotal + money(amounts.credit));
    return {
      category: clean(row.category || row.ledgerType),
      ledgerType: clean(row.ledgerType || row.category),
      debitAmount: money(amounts.debit),
      creditAmount: money(amounts.credit),
      amount: money(amounts.amount),
      orderCode: clean(row.orderCode || row.salesOrderCode || row.sourceCode || row.refCode),
      customerCode: clean(row.customerCode),
      sourceType: clean(row.sourceType || row.refType),
      sourceId: clean(row.sourceId || row.salesOrderId || row.orderId || row.refId),
      idempotencyKey: clean(row.idempotencyKey),
      createdAt: clean(row.createdAt)
    };
  });
  return { currentArBalance: money(debitTotal - creditTotal), debitTotal, creditTotal, ledgerCount: ledgers.length, ledgers };
}
async function loadDebtNew(order = {}, allocation = {}) {
  const orderCode = clean((allocation || {}).orderCode || orderCodeOf(order));
  const customerCode = clean((allocation || {}).customerCode || order.customerCode);
  if (!orderCode && !customerCode) return { customerBalance: 0, orderBalance: 0, source: 'debtNewService.skip-no-key', diffDebtNewVsArLedger: 0 };
  try {
    const result = await debtNewService.listCustomers({ orderCode, customerCode, status: 'all', ledgerLimit: 5000 }, {});
    const orderRow = (result.orders || []).find((row) => orderKeys(row).includes(orderCode)) || (result.orders || [])[0] || null;
    const customerRow = (result.customers || []).find((row) => clean(row.customerCode) === customerCode) || (result.customers || [])[0] || null;
    return {
      customerBalance: money(customerRow && (customerRow.debt ?? customerRow.remainingDebt)),
      orderBalance: money(orderRow && (orderRow.debt ?? orderRow.remainingDebt)),
      source: clean(result.diagnostics && result.diagnostics.source) || 'DebtNewService.listCustomers',
      orderCount: (result.orders || []).length,
      customerCount: (result.customers || []).length
    };
  } catch (err) {
    return { customerBalance: 0, orderBalance: 0, source: 'DebtNewService.error', error: err.message || String(err) };
  }
}
async function buildTrace(options = {}) {
  const order = await loadOrder(options.orderCode);
  const closeoutInfo = order ? await loadCloseout(order) : { found: false, closeout: {} };
  let allocation = order ? await loadAllocation(order, closeoutInfo) : null;
  let builtAllocation = null;
  if (!allocation && order && closeoutInfo.found) {
    try {
      builtAllocation = OrderPaymentAllocationService.buildAllocationFromCloseout(order, closeoutInfo.closeout, {
        sourceType: closeoutInfo.sourceType,
        sourceId: closeoutInfo.sourceId,
        sourceCode: closeoutInfo.sourceCode,
        sourceVersion: closeoutInfo.sourceVersion,
        zeroTolerance: options.zeroTolerance,
        actor: 'trace-order-payment-debt',
        metadata: { traceBuilt: true, source: closeoutInfo.sourceLabel }
      });
    } catch (err) {
      builtAllocation = { buildError: err.message || String(err) };
    }
  }
  const allocationForCalc = allocation || (builtAllocation && !builtAllocation.buildError ? builtAllocation : {});
  const ar = order ? await loadArLedgers(order, allocationForCalc, closeoutInfo) : { currentArBalance: 0, debitTotal: 0, creditTotal: 0, ledgerCount: 0, ledgers: [] };
  const expected = allocationForCalc && Object.keys(allocationForCalc).length
    ? OrderPaymentDebtReconcileService.computeExpectedDebtFromAllocation(allocationForCalc, { zeroTolerance: options.zeroTolerance })
    : { expectedDebtAmount: 0, rawDebtAmount: 0, zeroTolerance: options.zeroTolerance };
  const idempotencyKeyToCreate = allocationForCalc && Object.keys(allocationForCalc).length
    ? OrderPaymentDebtReconcileService.debtAdjustmentIdempotencyKey(allocationForCalc, expected.expectedDebtAmount)
    : '';
  const existing = idempotencyKeyToCreate ? await OrderPaymentDebtReconcileService.findActiveDebtAdjustmentByKey(idempotencyKeyToCreate) : null;
  const diff = money(ar.currentArBalance - money(expected.expectedDebtAmount));
  const debtNew = order ? await loadDebtNew(order, allocationForCalc) : { customerBalance: 0, orderBalance: 0, source: 'not-run' };
  debtNew.diffDebtNewVsArLedger = money(money(debtNew.orderBalance) - ar.currentArBalance);
  let action = 'skip';
  let skipReason = '';
  if (!order) skipReason = 'missingOrder';
  else if (!closeoutInfo.found && !allocation) skipReason = 'missingCloseoutAndAllocation';
  else if (existing && diff === 0) skipReason = 'idempotencyKeyExistsAndBalanceOk';
  else if (existing && diff !== 0) { action = 'manual-review'; skipReason = 'idempotencyKeyExistsButBalanceStillDiff'; }
  else if (diff > 0) action = 'create-credit';
  else if (diff < 0) action = 'create-debit';
  else skipReason = 'currentArBalanceAlreadyExpected';
  return {
    db: { databaseName: mongoose.connection.name || '', mongoUriMasked: maskMongoUri(process.env.MONGODB_URI || process.env.MONGO_URI || ''), nodeEnv: process.env.NODE_ENV || '' },
    order: order ? { found: true, orderCode: orderCodeOf(order), orderId: orderIdOf(order), customerCode: clean(order.customerCode), customerName: clean(order.customerName), status: clean(order.status), deliveryStaffCode: clean(order.deliveryStaffCode || order.deliveryCode), salesStaffCode: clean(order.salesStaffCode || order.salesmanCode) } : { found: false, orderCode: clean(options.orderCode) },
    closeout: { found: Boolean(closeoutInfo.found), sourceType: clean(closeoutInfo.sourceType), sourceId: clean(closeoutInfo.sourceId), sourceVersion: Number(closeoutInfo.sourceVersion || 0), receivableAmount: closeoutMoney(closeoutInfo.closeout, ['receivableAmount', 'originalAmount', 'saleAmount', 'deliveredAmount', 'totalAmount', 'amount']), cashAmount: closeoutMoney(closeoutInfo.closeout, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paidCashAmount']), bankAmount: closeoutMoney(closeoutInfo.closeout, ['bankAmount', 'bankTransferAmount', 'transferAmount', 'paidBankAmount']), rewardAmount: closeoutMoney(closeoutInfo.closeout, ['rewardAmount', 'offsetAmount', 'bonusAmount', 'allowanceAmount', 'rewardOffsetAmount']), returnAmount: closeoutMoney(closeoutInfo.closeout, ['returnAmount', 'returnedAmount', 'actualReturnAmount', 'returnAmountFromReturnOrders']), finalDebtAmount: closeoutMoney(closeoutInfo.closeout, ['finalDebtAmount', 'debtAmount', 'remainingDebt', 'arBalance']) },
    allocation: allocation ? { found: true, allocationCode: clean(allocation.allocationCode), idempotencyKey: clean(allocation.idempotencyKey), receivableAmount: money(allocation.receivableAmount), cashAmount: money(allocation.cashAmount), bankAmount: money(allocation.bankAmount), rewardAmount: money(allocation.rewardAmount), returnAmount: money(allocation.returnAmount), rawDebtAmount: money(allocation.rawDebtAmount), normalizedDebtAmount: money(allocation.normalizedDebtAmount), debtAmount: money(allocation.debtAmount), zeroToleranceApplied: Boolean(allocation.zeroToleranceApplied), zeroToleranceAdjustmentAmount: money(allocation.zeroToleranceAdjustmentAmount) } : { found: false, builtFromCloseout: builtAllocation || null },
    arLedgerBalance: ar,
    reconcile: { expectedDebtAmount: money(expected.expectedDebtAmount), diff, action, idempotencyKeyToCreate, existingDebtAdjustmentByKey: Boolean(existing), canCreateDebtAdjustment: Boolean(!existing && diff !== 0), skipReason },
    debtNew
  };
}
function printText(trace = {}) {
  console.log('ORDER_PAYMENT_DEBT_TRACE');
  console.log(`DB: ${(trace.db || {}).databaseName || '<unknown>'}`);
  console.log(`Order: ${JSON.stringify(trace.order || {})}`);
  console.log(`Closeout: ${JSON.stringify(trace.closeout || {})}`);
  console.log(`Allocation: ${JSON.stringify(trace.allocation || {})}`);
  console.log(`AR balance: ${JSON.stringify(trace.arLedgerBalance || {})}`);
  console.log(`Reconcile: ${JSON.stringify(trace.reconcile || {})}`);
  console.log(`DebtNew: ${JSON.stringify(trace.debtNew || {})}`);
}
async function main() {
  const options = parseArgs();
  await connectDB();
  try {
    const trace = await buildTrace(options);
    if (options.json) console.log(JSON.stringify(trace, null, 2));
    else printText(trace);
  } finally {
    await mongoose.connection.close();
  }
}
if (require.main === module) main().catch((err) => { console.error(err && err.stack ? err.stack : err); process.exitCode = 1; });
module.exports = { buildTrace, parseArgs };
