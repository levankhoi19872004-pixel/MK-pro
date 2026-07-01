'use strict';

const { toNumber } = require('../utils/common.util');

const DEBT_ZERO_TOLERANCE = 1000;

const CASH_AMOUNT_FIELDS = [
  'cashAmount',
  'cashCollectedAmount',
  'cashReceivedAmount',
  'paymentCashAmount',
  'paidCashAmount',
  'paidCash',
  'collectedCash',
  'deliveryCashAmount',
  'cashCollected',
  'cash'
];

const BANK_AMOUNT_FIELDS = [
  'bankAmount',
  'transferAmount',
  'bankTransferAmount',
  'paymentTransferAmount',
  'paymentBankAmount',
  'paidBankAmount',
  'paidTransferAmount',
  'collectedBankAmount',
  'deliveryBankAmount',
  'bankCollected',
  'bankCollectedAmount'
];

const REWARD_AMOUNT_FIELDS = [
  'rewardAmount',
  'bonusAmount',
  'allowanceAmount',
  'promotionRewardAmount',
  'displayRewardAmount',
  'bonusReturnAmount',
  'offsetAmount',
  'debtOffsetAmount',
  'deliveryOffsetAmount',
  'rewardOffsetAmount',
  'promotionOffsetAmount'
];

const RETURN_AMOUNT_FIELDS = [
  'returnAmount',
  'returnedAmount',
  'returnOrderAmount',
  'actualReturnAmount',
  'returnAmountFromReturnOrders',
  'syncedReturnAmountFromReturnOrders'
];

function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE) {
  const n = Number(toNumber(value));
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}

function hasOpenDebt(value, tolerance = DEBT_ZERO_TOLERANCE) {
  return normalizeDebtAmount(value, tolerance) > 0;
}

function isOverpaid(value, tolerance = DEBT_ZERO_TOLERANCE) {
  return normalizeDebtAmount(value, tolerance) < 0;
}

function money(value) {
  const n = Number(toNumber(value));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function hasExplicitMoneyValue(source = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, key)
    && source[key] !== undefined
    && source[key] !== null
    && String(source[key]).trim() !== '';
}

function pickExplicitMoneyValue(source = {}, keys = []) {
  for (const key of keys) {
    if (!hasExplicitMoneyValue(source, key)) continue;
    const value = money(source[key]);
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

function calculateDeliveryDebtAmount(input = {}, tolerance = DEBT_ZERO_TOLERANCE) {
  const receivableAmount = money(input.receivableAmount ?? input.originalAmount ?? input.totalAmount);
  const cashAmount = pickExplicitMoneyValue(input, CASH_AMOUNT_FIELDS) || money(input.cashAmount);
  const bankAmount = pickExplicitMoneyValue(input, BANK_AMOUNT_FIELDS) || money(input.bankAmount ?? input.transferAmount);
  const rewardAmount = pickExplicitMoneyValue(input, REWARD_AMOUNT_FIELDS) || money(input.rewardAmount);
  const returnAmount = pickExplicitMoneyValue(input, RETURN_AMOUNT_FIELDS) || money(input.returnAmount ?? input.returnedAmount);
  const rawDebtAmount = money(receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount);
  const debtAmount = normalizeDebtAmount(rawDebtAmount, tolerance);
  return {
    receivableAmount,
    cashAmount,
    bankAmount,
    rewardAmount,
    returnAmount,
    rawDebtAmount,
    debtAmount
  };
}

module.exports = {
  DEBT_ZERO_TOLERANCE,
  CASH_AMOUNT_FIELDS,
  BANK_AMOUNT_FIELDS,
  REWARD_AMOUNT_FIELDS,
  RETURN_AMOUNT_FIELDS,
  normalizeDebtAmount,
  calculateDeliveryDebtAmount,
  pickExplicitMoneyValue,
  hasExplicitMoneyValue,
  hasOpenDebt,
  isOverpaid,
  money
};
