#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const {
  calculateDeliveryCloseoutDebt,
  normalizeMoney,
  applyDebtZeroTolerance
} = require('../src/services/accounting/deliveryCloseoutCalculator');

const TITLE = 'DELIVERY_CLOSEOUT_REWARD_DEBT_MISMATCH_AUDIT';
const DEFAULT_LIMIT = 50000;

function clean(value = '') {
  return String(value ?? '').trim();
}

function hasValue(source = {}, field = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, field)
    && source[field] !== undefined
    && source[field] !== null
    && clean(source[field]) !== '';
}

function pickMoney(source = {}, fields = []) {
  for (const field of fields) {
    if (!hasValue(source, field)) continue;
    return normalizeMoney(source[field]);
  }
  return 0;
}

function uniq(values = []) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function orderId(order = {}) {
  return clean(order.id || order._id);
}

function orderCode(order = {}) {
  return clean(order.code || order.orderCode || order.documentCode || order.invoiceCode || order.salesOrderCode);
}

function displayOrderId(order = {}) {
  return orderId(order) || orderCode(order);
}

function orderIdentity(order = {}) {
  const ids = uniq([order.id, order._id, order.salesOrderId, order.sourceId]);
  const codes = uniq([order.code, order.orderCode, order.salesOrderCode, order.documentCode, order.invoiceCode]);
  const all = uniq([...ids, ...codes]);
  const idempotencyKeys = uniq(all.flatMap((key) => [key, `AR-DEBT-OPEN:${key}`]));
  return { ids, codes, all, idempotencyKeys };
}

function ledgerIdentityValues(row = {}) {
  return uniq([
    row.sourceId,
    row.orderId,
    row.salesOrderId,
    row.sourceCode,
    row.orderCode,
    row.salesOrderCode,
    row.idempotencyKey
  ]);
}

function debtOrderIdentityValues(row = {}) {
  return uniq([
    row.sourceId,
    row.orderId,
    row.salesOrderId,
    row.sourceCode,
    row.orderCode,
    row.salesOrderCode,
    row.idempotencyKey,
    row.id
  ]);
}

function buildExactLookup(orders = []) {
  const lookup = new Map();
  for (const order of orders) {
    const identity = orderIdentity(order);
    for (const key of [...identity.all, ...identity.idempotencyKeys]) {
      if (!lookup.has(key)) lookup.set(key, order);
    }
  }
  return lookup;
}

function groupRowsByOrder(rows = [], lookup = new Map(), identityFn = ledgerIdentityValues) {
  const map = new Map();
  for (const row of rows) {
    const order = identityFn(row).map((key) => lookup.get(key)).find(Boolean);
    if (!order) continue;
    const key = displayOrderId(order);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function buildExactOrderMatchQuery(orders = [], options = {}) {
  const ids = [];
  const codes = [];
  const all = [];
  const idempotencyKeys = [];
  for (const order of orders) {
    const identity = orderIdentity(order);
    ids.push(...identity.ids);
    codes.push(...identity.codes);
    all.push(...identity.all);
    idempotencyKeys.push(...identity.idempotencyKeys);
  }
  const idSet = uniq(ids);
  const codeSet = uniq(codes);
  const allSet = uniq(all);
  const idemSet = uniq(idempotencyKeys);
  const or = [];
  if (idSet.length) {
    or.push({ sourceId: { $in: idSet } }, { orderId: { $in: idSet } }, { salesOrderId: { $in: idSet } });
  }
  if (codeSet.length) {
    or.push({ sourceCode: { $in: codeSet } }, { orderCode: { $in: codeSet } }, { salesOrderCode: { $in: codeSet } });
  }
  if (allSet.length) {
    // Compatibility for legacy rows where a code was stored in an id field or the reverse.
    // Still exact equality only; no regex/contains/prefix matching.
    or.push({ sourceId: { $in: allSet } }, { orderId: { $in: allSet } }, { salesOrderId: { $in: allSet } });
  }
  if (idemSet.length) or.push({ idempotencyKey: { $in: idemSet } });
  return or.length ? { $or: or, ...options } : { _id: { $exists: false }, ...options };
}

function buildOrderFilter(options = {}) {
  const filter = {
    $and: [
      { rewardAmount: { $gt: 0 } },
      { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }, { deletedAt: '' }] },
      { isDeleted: { $ne: true } },
      { deleted: { $ne: true } }
    ]
  };
  if (options.customerCode) filter.$and.push({ customerCode: clean(options.customerCode) });
  if (options.orderCode) {
    const code = clean(options.orderCode);
    filter.$and.push({
      $or: [
        { code },
        { orderCode: code },
        { salesOrderCode: code },
        { documentCode: code },
        { invoiceCode: code }
      ]
    });
  }
  return filter;
}

function closeoutOf(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

function buildCloseoutExpectation(order = {}) {
  const closeout = closeoutOf(order);
  const returnedAmount = pickMoney(closeout, ['returnedAmount', 'returnAmount']);
  const totalAmount = pickMoney(order, ['totalAmount', 'finalAmount', 'amount', 'total']);
  const deliveredAmount = pickMoney(closeout, ['deliveredAmount']) || normalizeMoney(totalAmount - returnedAmount);
  const cashAmount = pickMoney(closeout, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount'])
    || pickMoney(order, ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidAmount']);
  const bankAmount = pickMoney(closeout, ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentBankAmount'])
    || pickMoney(order, ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentBankAmount']);
  const offsetAmount = pickMoney(closeout, ['offsetAmount', 'debtOffsetAmount', 'deliveryOffsetAmount'])
    || pickMoney(order, ['offsetAmount', 'debtOffsetAmount', 'deliveryOffsetAmount']);
  const orderRewardAmount = pickMoney(order, ['rewardAmount']);
  const closeoutRewardAmount = pickMoney(closeout, ['rewardAmount']);
  const rewardAmount = normalizeMoney(
    orderRewardAmount
    || closeoutRewardAmount
    || pickMoney(order, ['bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount'])
    || pickMoney(closeout, ['bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount'])
  );
  const expected = calculateDeliveryCloseoutDebt({
    deliveredAmount,
    cashAmount,
    bankAmount,
    offsetAmount,
    rewardAmount
  });
  const actualRawFinalDebtAmount = hasValue(closeout, 'rawFinalDebtAmount')
    ? normalizeMoney(closeout.rawFinalDebtAmount)
    : normalizeMoney(deliveredAmount - cashAmount - bankAmount - offsetAmount - closeoutRewardAmount);
  const actualFinalDebtAmount = hasValue(closeout, 'finalDebtAmount')
    ? normalizeMoney(closeout.finalDebtAmount)
    : applyDebtZeroTolerance(actualRawFinalDebtAmount);

  return {
    totalAmount,
    deliveredAmount,
    cashAmount,
    bankAmount,
    offsetAmount,
    orderRewardAmount,
    closeoutRewardAmount,
    actualRawFinalDebtAmount,
    actualFinalDebtAmount,
    expectedRawFinalDebtAmount: expected.rawFinalDebtAmount,
    expectedFinalDebtAmount: expected.finalDebtAmount
  };
}

function sumActiveDebtOpen(ledgers = []) {
  return ledgers.reduce((sum, row) => sum + Math.max(0, normalizeMoney(row.debit ?? row.amount)), 0);
}

function activeLedgerIds(ledgers = []) {
  return ledgers.map((row) => clean(row.id || row.code || row._id)).filter(Boolean);
}

function sumOpenDebtReadModel(rows = []) {
  return rows.reduce((sum, row) => sum + Math.max(0, normalizeMoney(row.remainingDebt ?? row.rawDebt ?? row.debit)), 0);
}

function suggestedRepairCommand(customerCode, orderCodeValue) {
  const base = `node scripts\\repair-ar-debt-open-reward-closeout.js ${clean(customerCode)} ${clean(orderCodeValue)}`;
  return `${base}\n${base} --apply`;
}

function detectReasons({ order = {}, calc = {}, ledgers = [], debtOrders = [] } = {}) {
  const reasons = [];
  const missingCloseoutReward = calc.orderRewardAmount > 0 && calc.closeoutRewardAmount <= 0;
  const actualLooksLikeRewardWasIgnored = calc.orderRewardAmount > 0
    && calc.expectedFinalDebtAmount !== calc.actualFinalDebtAmount
    && calc.actualRawFinalDebtAmount === normalizeMoney(calc.deliveredAmount - calc.cashAmount - calc.bankAmount - calc.offsetAmount);
  const closeoutFinalMismatch = calc.expectedFinalDebtAmount !== calc.actualFinalDebtAmount
    || calc.expectedRawFinalDebtAmount !== calc.actualRawFinalDebtAmount;

  if (missingCloseoutReward || actualLooksLikeRewardWasIgnored || closeoutFinalMismatch) {
    reasons.push('REWARD_NOT_DEDUCTED');
  }

  const activeArDebtOpenAmount = sumActiveDebtOpen(ledgers);
  if (calc.expectedFinalDebtAmount <= 0 && activeArDebtOpenAmount > 0) {
    reasons.push('SHOULD_NOT_HAVE_ACTIVE_AR_DEBT_OPEN');
  }

  const arDebtOrderRemainingDebt = sumOpenDebtReadModel(debtOrders);
  if (calc.expectedFinalDebtAmount <= 0 && arDebtOrderRemainingDebt > 0) {
    reasons.push('SHOULD_NOT_HAVE_OPEN_DEBT_READ_MODEL');
  }

  return uniq(reasons);
}

function buildMismatch(order = {}, calc = {}, ledgers = [], debtOrders = [], reasons = []) {
  return {
    customerCode: clean(order.customerCode),
    customerName: clean(order.customerName),
    orderId: displayOrderId(order),
    orderCode: orderCode(order),
    totalAmount: calc.totalAmount,
    deliveredAmount: calc.deliveredAmount,
    cashAmount: calc.cashAmount,
    bankAmount: calc.bankAmount,
    offsetAmount: calc.offsetAmount,
    orderRewardAmount: calc.orderRewardAmount,
    closeoutRewardAmount: calc.closeoutRewardAmount,
    actualRawFinalDebtAmount: calc.actualRawFinalDebtAmount,
    actualFinalDebtAmount: calc.actualFinalDebtAmount,
    expectedRawFinalDebtAmount: calc.expectedRawFinalDebtAmount,
    expectedFinalDebtAmount: calc.expectedFinalDebtAmount,
    activeArDebtOpenAmount: sumActiveDebtOpen(ledgers),
    activeArDebtOpenIds: activeLedgerIds(ledgers),
    arDebtOrderRemainingDebt: sumOpenDebtReadModel(debtOrders),
    reason: reasons[0] || 'DELIVERY_CLOSEOUT_REWARD_DEBT_MISMATCH',
    reasons,
    suggestedRepairCommand: suggestedRepairCommand(order.customerCode, orderCode(order) || displayOrderId(order))
  };
}

function buildAuditReport({ database = '', orders = [], ledgers = [], debtOrders = [] } = {}) {
  const lookup = buildExactLookup(orders);
  const ledgersByOrder = groupRowsByOrder(ledgers, lookup, ledgerIdentityValues);
  const debtOrdersByOrder = groupRowsByOrder(debtOrders, lookup, debtOrderIdentityValues);
  const mismatches = [];
  let mismatchLedgerCount = 0;
  let mismatchReadModelCount = 0;

  for (const order of orders) {
    const key = displayOrderId(order);
    const orderLedgers = ledgersByOrder.get(key) || [];
    const orderDebtRows = debtOrdersByOrder.get(key) || [];
    const calc = buildCloseoutExpectation(order);
    const reasons = detectReasons({ order, calc, ledgers: orderLedgers, debtOrders: orderDebtRows });
    if (!reasons.length) continue;
    if (reasons.includes('SHOULD_NOT_HAVE_ACTIVE_AR_DEBT_OPEN')) mismatchLedgerCount += orderLedgers.filter((row) => Math.max(0, normalizeMoney(row.debit ?? row.amount)) > 0).length;
    if (reasons.includes('SHOULD_NOT_HAVE_OPEN_DEBT_READ_MODEL')) mismatchReadModelCount += orderDebtRows.filter((row) => Math.max(0, normalizeMoney(row.remainingDebt ?? row.rawDebt ?? row.debit)) > 0).length;
    mismatches.push(buildMismatch(order, calc, orderLedgers, orderDebtRows, reasons));
  }

  return {
    title: TITLE,
    database,
    dryRun: true,
    checkedOrders: orders.length,
    checkedLedgers: ledgers.length,
    mismatchOrderCount: mismatches.length,
    mismatchLedgerCount,
    mismatchReadModelCount,
    mismatches,
    note: 'Read-only audit. It does not mutate or repair production data.'
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const valueOf = (name, fallback = '') => {
    const found = argv.find((value) => value.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1) : fallback;
  };
  return {
    strict: argv.includes('--strict'),
    json: argv.includes('--json'),
    limit: Math.max(1, Number(valueOf('--limit', String(DEFAULT_LIMIT))) || DEFAULT_LIMIT),
    customerCode: clean(valueOf('--customerCode', '')),
    orderCode: clean(valueOf('--orderCode', ''))
  };
}

async function audit(options = {}) {
  const mongoose = require('mongoose');
  const SalesOrder = require('../src/models/SalesOrder');
  const ArLedger = require('../src/models/ArLedger');
  const ArDebtOrder = require('../src/models/ArDebtOrder');
  const limit = Math.max(1, Number(options.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT);
  const orderFilter = buildOrderFilter(options);
  const orders = await SalesOrder.find(orderFilter).limit(limit).lean();
  const ledgerQuery = buildExactOrderMatchQuery(orders, {
    category: 'AR-DEBT-OPEN',
    active: { $ne: false },
    reversed: { $ne: true },
    debit: { $gt: 0 }
  });
  const debtOrderQuery = buildExactOrderMatchQuery(orders, {
    status: 'open',
    remainingDebt: { $gt: 0 }
  });

  const [ledgers, debtOrders] = orders.length
    ? await Promise.all([
      ArLedger.find(ledgerQuery).limit(limit).lean(),
      ArDebtOrder.find(debtOrderQuery).limit(limit).lean()
    ])
    : [[], []];

  return buildAuditReport({
    database: options.database || mongoose.connection.name || '',
    orders,
    ledgers,
    debtOrders
  });
}

function printText(result) {
  console.log(result.title);
  console.log(`Database: ${result.database || '<unknown>'}`);
  console.log(`Dry-run: ${result.dryRun === true}`);
  console.log(`Checked orders: ${result.checkedOrders}`);
  console.log(`Checked ledgers: ${result.checkedLedgers}`);
  console.log(`Mismatch orders: ${result.mismatchOrderCount}`);
  console.log(`Mismatch ledgers: ${result.mismatchLedgerCount}`);
  console.log(`Mismatch read-models: ${result.mismatchReadModelCount}`);
  console.log(result.mismatchOrderCount || result.mismatchLedgerCount || result.mismatchReadModelCount ? 'AUDIT_FAIL' : 'AUDIT_PASS');
  if (result.mismatches.length) console.log(JSON.stringify(result.mismatches, null, 2));
}

async function main() {
  const mongoose = require('mongoose');
  const connectDB = require('../src/config/db');
  const options = parseArgs();
  await connectDB();
  const result = await audit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  await mongoose.connection.close();
  if (options.strict && (result.mismatchOrderCount || result.mismatchLedgerCount || result.mismatchReadModelCount)) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[audit-delivery-closeout-reward-debt-mismatch] failed:', err && err.stack ? err.stack : err);
  try {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});

module.exports = {
  TITLE,
  parseArgs,
  audit,
  buildAuditReport,
  buildCloseoutExpectation,
  buildExactOrderMatchQuery,
  buildOrderFilter,
  detectReasons,
  _internal: {
    clean,
    normalizeMoney,
    applyDebtZeroTolerance,
    calculateDeliveryCloseoutDebt,
    orderIdentity,
    ledgerIdentityValues,
    debtOrderIdentityValues,
    suggestedRepairCommand
  }
};
