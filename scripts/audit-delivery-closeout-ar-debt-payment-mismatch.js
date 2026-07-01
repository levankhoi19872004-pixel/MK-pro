#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const ArLedger = require('../src/models/ArLedger');
const { calculateDeliveryDebtAmount, normalizeDebtAmount } = require('../src/constants/finance.constants');

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function text(value = '') {
  return String(value ?? '').trim();
}

function firstMoney(source = {}, keys = []) {
  for (const key of keys) {
    if (source[key] === undefined || source[key] === null || source[key] === '') continue;
    const value = money(source[key]);
    if (value !== 0) return value;
  }
  return 0;
}

const CASH_FIELDS = ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash', 'collectedCash', 'deliveryCashAmount', 'cashCollected', 'cash', 'paidAmount'];
const BANK_FIELDS = ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount', 'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount', 'deliveryBankAmount', 'bankCollected', 'bankCollectedAmount'];
const REWARD_FIELDS = ['rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'offsetAmount', 'debtOffsetAmount'];
const RETURN_FIELDS = ['returnedAmount', 'returnAmount', 'returnOrderAmount', 'actualReturnAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders'];

function orderKey(order = {}) {
  return text(order.id || order.code || order.orderCode || order.salesOrderCode || order._id);
}

function ledgerOrderKeys(row = {}) {
  return [row.sourceOrderId, row.salesOrderId, row.orderId, row.sourceId, row.sourceCode, row.salesOrderCode, row.orderCode, row.code]
    .map(text)
    .filter(Boolean);
}

function amountFromCloseoutOrOrder(order = {}, keys = []) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  return firstMoney(closeout, keys) || firstMoney(order, keys);
}

function expectedDebt(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  const receivableAmount = firstMoney(closeout, ['originalAmount', 'totalAmount']) || firstMoney(order, ['totalAmount', 'finalAmount', 'payableAmount', 'amount']);
  const cashAmount = amountFromCloseoutOrOrder(order, CASH_FIELDS);
  const bankAmount = amountFromCloseoutOrOrder(order, BANK_FIELDS);
  const rewardAmount = amountFromCloseoutOrOrder(order, REWARD_FIELDS);
  const returnAmount = amountFromCloseoutOrOrder(order, RETURN_FIELDS);
  return calculateDeliveryDebtAmount({ receivableAmount, cashAmount, bankAmount, rewardAmount, returnAmount });
}

function parseArgs(argv = process.argv.slice(2)) {
  const get = (name, fallback = '') => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
  return {
    strict: argv.includes('--strict'),
    json: argv.includes('--json'),
    limit: Math.max(1, Number(get('--limit', '20000')) || 20000)
  };
}

async function audit(options = {}) {
  const ledgers = await ArLedger.find({
    account: /^AR$/i,
    category: 'AR-DEBT-OPEN',
    ledgerType: 'AR-DEBT-OPEN',
    sourceType: { $in: ['delivery_closeout', 'SALES_ORDER_DELIVERY_CLOSEOUT'] },
    active: { $ne: false },
    reversed: { $ne: true }
  }).limit(options.limit || 20000).lean();
  const keys = Array.from(new Set(ledgers.flatMap(ledgerOrderKeys)));
  const orders = keys.length ? await SalesOrder.find({
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { documentCode: { $in: keys } },
      { invoiceCode: { $in: keys } }
    ]
  }).lean() : [];
  const orderByKey = new Map();
  for (const order of orders) {
    for (const key of [order.id, order.code, order.orderCode, order.salesOrderCode, order.documentCode, order.invoiceCode, order._id].map(text).filter(Boolean)) {
      orderByKey.set(key, order);
    }
  }

  const mismatches = [];
  const missingOrders = [];
  for (const ledger of ledgers) {
    const order = ledgerOrderKeys(ledger).map((key) => orderByKey.get(key)).find(Boolean);
    if (!order) {
      missingOrders.push({ ledgerId: ledger.id || ledger._id, ledgerCode: ledger.code, sourceId: ledger.sourceId, orderCode: ledger.orderCode });
      continue;
    }
    const expected = expectedDebt(order);
    const actual = normalizeDebtAmount(money(ledger.debit || ledger.amount));
    if (actual !== expected.debtAmount) {
      mismatches.push({
        ledgerId: ledger.id || ledger._id,
        ledgerCode: ledger.code,
        orderKey: orderKey(order),
        customerCode: order.customerCode,
        actualLedgerAmount: actual,
        expectedDebtAmount: expected.debtAmount,
        rawDebtAmount: expected.rawDebtAmount,
        receivableAmount: expected.receivableAmount,
        cashAmount: expected.cashAmount,
        bankAmount: expected.bankAmount,
        rewardAmount: expected.rewardAmount,
        returnAmount: expected.returnAmount,
        delta: actual - expected.debtAmount
      });
    }
  }
  return {
    title: 'DELIVERY_CLOSEOUT_AR_DEBT_PAYMENT_MISMATCH_AUDIT',
    dryRun: true,
    checkedLedgers: ledgers.length,
    checkedOrders: orders.length,
    mismatchCount: mismatches.length,
    missingOrderCount: missingOrders.length,
    mismatches,
    missingOrders,
    note: 'Read-only audit. It does not mutate or repair production data.'
  };
}

function printText(result) {
  console.log(result.title);
  console.log(`Checked ledgers: ${result.checkedLedgers}`);
  console.log(`Checked orders: ${result.checkedOrders}`);
  console.log(`Mismatches: ${result.mismatchCount}`);
  console.log(`Missing orders: ${result.missingOrderCount}`);
  console.log(result.mismatchCount || result.missingOrderCount ? 'AUDIT_FAIL' : 'AUDIT_PASS');
  if (result.mismatchCount || result.missingOrderCount) console.log(JSON.stringify({ mismatches: result.mismatches, missingOrders: result.missingOrders }, null, 2));
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await audit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  await mongoose.connection.close();
  if (options.strict && (result.mismatchCount || result.missingOrderCount)) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[audit-delivery-closeout-ar-debt-payment-mismatch] failed:', err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { audit, expectedDebt };
