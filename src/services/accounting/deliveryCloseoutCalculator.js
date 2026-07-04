'use strict';

const { toNumber } = require('../../utils/common.util');
const { DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');

function normalizeMoney(value) {
  const n = Number(toNumber(value));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function applyDebtZeroTolerance(value, tolerance = DEBT_ZERO_TOLERANCE) {
  const n = normalizeMoney(value);
  return Math.abs(n) <= tolerance ? 0 : n;
}

function calculateDeliveryCloseoutDebt(input = {}, options = {}) {
  const tolerance = options.tolerance ?? DEBT_ZERO_TOLERANCE;
  const deliveredAmount = normalizeMoney(input.deliveredAmount);
  const cashAmount = normalizeMoney(input.cashAmount);
  const bankAmount = normalizeMoney(input.bankAmount);
  const offsetAmount = normalizeMoney(input.offsetAmount);
  const rewardAmount = normalizeMoney(input.rewardAmount);
  const collectedAmount = normalizeMoney(input.collectedAmount ?? (cashAmount + bankAmount));

  const rawFinalDebtAmount = normalizeMoney(
    deliveredAmount
    - cashAmount
    - bankAmount
    - offsetAmount
    - rewardAmount
  );
  const finalDebtAmount = applyDebtZeroTolerance(rawFinalDebtAmount, tolerance);

  return {
    deliveredAmount,
    cashAmount,
    bankAmount,
    collectedAmount,
    offsetAmount,
    rewardAmount,
    rawFinalDebtAmount,
    finalDebtAmount
  };
}

module.exports = {
  normalizeMoney,
  applyDebtZeroTolerance,
  calculateDeliveryCloseoutDebt
};
