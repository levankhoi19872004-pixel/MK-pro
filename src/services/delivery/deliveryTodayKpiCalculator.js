'use strict';

const { toNumber } = require('../../utils/common.util');
const { calculateDeliveryDebtAmount, normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function text(value = '') {
  return String(value ?? '').trim();
}

function calculateDeliveryTodayKpi(input = {}) {
  const receivableAmount = money(input.receivableAmount ?? input.originalAmount ?? input.totalAmount);
  const cashAmount = money(input.cashAmount);
  const bankAmount = money(input.bankAmount ?? input.transferAmount);
  const rewardAmount = money(input.rewardAmount);
  const offsetAmount = money(input.offsetAmount);
  const returnAmount = money(input.returnAmount ?? input.returnedAmount);
  const returnHandling = text(input.returnHandling || 'subtractReturnInDebtFormula');
  const formulaRewardAmount = money(rewardAmount + offsetAmount);
  const formulaInput = {
    receivableAmount,
    cashAmount,
    bankAmount,
    rewardAmount: formulaRewardAmount,
    returnAmount: returnHandling === 'receivableAlreadyNetted' ? 0 : returnAmount
  };
  const computed = calculateDeliveryDebtAmount(formulaInput, input.tolerance || DEBT_ZERO_TOLERANCE);
  const computedDebtAmount = money(computed.debtAmount);
  const rawComputedDebtAmount = money(computed.rawDebtAmount);
  const preferredDebtProvided = input.preferredDebtAmount !== undefined && input.preferredDebtAmount !== null && String(input.preferredDebtAmount).trim() !== '';
  const preferredDebtAmount = preferredDebtProvided ? normalizeDebtAmount(money(input.preferredDebtAmount), input.tolerance || DEBT_ZERO_TOLERANCE) : computedDebtAmount;
  const preferredDebtSource = text(input.preferredDebtSource || 'computed-formula');
  const diff = money(preferredDebtAmount - computedDebtAmount);
  const warnings = Array.isArray(input.warnings) ? [...input.warnings] : [];
  const tolerance = Number(input.tolerance || DEBT_ZERO_TOLERANCE) || DEBT_ZERO_TOLERANCE;

  let debtAmount = computedDebtAmount;
  let debtSource = 'computed-formula';
  if (preferredDebtProvided && Math.abs(diff) <= tolerance) {
    debtAmount = preferredDebtAmount;
    debtSource = preferredDebtSource;
  } else if (preferredDebtProvided && Math.abs(diff) > tolerance) {
    warnings.push({
      code: 'DEBT_RECONCILE_MISMATCH',
      message: 'Preferred allocation/version debt differs from PT - TM - CK - TT - HT. Display uses computed debt to keep Delivery Today KPI horizontally reconciled.',
      preferredDebtSource,
      preferredDebtAmount,
      computedDebtAmount,
      diff,
      tolerance
    });
  }

  const sourceBreakdown = {
    kpiFormulaVersion: 'delivery-today-kpi-v3',
    debtFormula: returnHandling === 'receivableAlreadyNetted'
      ? 'CN = PT - TM - CK - TT'
      : 'CN = PT - TM - CK - TT - HT',
    returnHandling,
    receivableAmount,
    cashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    rewardFormulaAmount: formulaRewardAmount,
    returnAmount,
    computedDebtAmount,
    rawComputedDebtAmount,
    preferredDebtProvided,
    preferredDebtSource,
    preferredDebtAmount: preferredDebtProvided ? preferredDebtAmount : null,
    debtSource,
    debtReconcileDiff: preferredDebtProvided ? diff : 0,
    zeroTolerance: tolerance,
    warnings
  };

  return {
    receivableAmount,
    cashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    returnAmount,
    debtAmount,
    finalDebtAmount: debtAmount,
    computedDebtAmount,
    rawComputedDebtAmount,
    sourceBreakdown,
    warnings
  };
}

module.exports = {
  calculateDeliveryTodayKpi,
  money
};
