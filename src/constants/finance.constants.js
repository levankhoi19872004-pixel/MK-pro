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

module.exports = {
  DEBT_ZERO_TOLERANCE,
  normalizeDebtAmount,
  hasOpenDebt,
  isOverpaid
};
