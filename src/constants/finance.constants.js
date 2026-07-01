'use strict';

const DEBT_ZERO_TOLERANCE = 1000;

function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE) {
  const n = Number(value || 0);
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
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function calculateDeliveryDebtAmount(input = {}, tolerance = DEBT_ZERO_TOLERANCE) {
  const receivableAmount = money(input.receivableAmount ?? input.originalAmount ?? input.totalAmount);
  const cashAmount = money(input.cashAmount);
  const bankAmount = money(input.bankAmount ?? input.transferAmount);
  const rewardAmount = money(input.rewardAmount);
  const returnAmount = money(input.returnAmount ?? input.returnedAmount);
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
  normalizeDebtAmount,
  calculateDeliveryDebtAmount,
  hasOpenDebt,
  isOverpaid
};
