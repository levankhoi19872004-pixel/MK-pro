'use strict';

const { toNumber } = require('../../utils/common.util');

function money(value) {
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

function calculateCorrectionDebtDelta({
  receivableDelta = 0,
  cashDelta = 0,
  bankDelta = 0,
  rewardDelta = 0,
  returnDelta = 0
} = {}) {
  return money(
    money(receivableDelta)
      - money(cashDelta)
      - money(bankDelta)
      - money(rewardDelta)
      - money(returnDelta)
  );
}

function isReturnOnlyDelta(input = {}) {
  return money(input.returnDelta) !== 0
    && money(input.receivableDelta) === 0
    && money(input.cashDelta) === 0
    && money(input.bankDelta) === 0
    && money(input.rewardDelta) === 0;
}

function assertCorrectionDebtDeltaPolicy(input = {}, options = {}) {
  const debtDelta = money(options.debtDelta !== undefined
    ? options.debtDelta
    : calculateCorrectionDebtDelta(input));
  const returnDelta = money(input.returnDelta);

  if (returnDelta > 0 && debtDelta > 0) {
    const err = new Error('Post-closeout return tăng không được làm tăng công nợ.');
    err.code = 'POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT';
    err.status = 409;
    throw err;
  }

  if (isReturnOnlyDelta(input) && debtDelta !== -returnDelta) {
    const err = new Error('Return-only correction phải tạo debtDelta đúng bằng âm returnDelta.');
    err.code = 'POST_CLOSEOUT_RETURN_DEBT_DELTA_MISMATCH';
    err.status = 409;
    throw err;
  }

  if (isReturnOnlyDelta(input) && returnDelta > 0 && debtDelta > 0) {
    const err = new Error('Return correction không được dựng lại khoản nợ đã thanh toán.');
    err.code = 'DEBT_RECREATED_BY_RETURN_CORRECTION';
    err.status = 409;
    throw err;
  }

  return debtDelta;
}

function buildCorrectionDebtDeltaMetadata(input = {}, debtDelta = calculateCorrectionDebtDelta(input), extra = {}) {
  return {
    adjustmentPolicy: 'EVENT_DELTA_ONLY',
    receivableDelta: money(input.receivableDelta),
    cashDelta: money(input.cashDelta),
    bankDelta: money(input.bankDelta),
    rewardDelta: money(input.rewardDelta),
    returnDelta: money(input.returnDelta),
    debtDelta: money(debtDelta),
    excludesConfirmedDebtReceipts: true,
    excludesCurrentDebtBalanceRecalculation: true,
    ...extra
  };
}

module.exports = {
  money,
  calculateCorrectionDebtDelta,
  assertCorrectionDebtDeltaPolicy,
  buildCorrectionDebtDeltaMetadata,
  _internal: { isReturnOnlyDelta }
};
