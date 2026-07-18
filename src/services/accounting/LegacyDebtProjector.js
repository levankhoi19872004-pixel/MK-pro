'use strict';

const { DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function projectBalanceFromTotals(input = {}, options = {}) {
  const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : DEBT_ZERO_TOLERANCE;
  const debit = money(input.debit ?? input.totalDebit);
  const credit = money(input.credit ?? input.totalCredit);
  const rawBalance = money(input.rawBalance ?? input.balance ?? (debit - credit));
  const debtAmount = rawBalance > 0 ? rawBalance : 0;
  const creditBalance = rawBalance < 0 ? Math.abs(rawBalance) : 0;
  const withinTolerance = Math.abs(rawBalance) <= tolerance;
  const displayStatus = withinTolerance
    ? (rawBalance === 0 ? 'paid' : 'settled_by_tolerance')
    : (rawBalance > 0 ? 'open' : 'overpaid');

  return {
    debit,
    credit,
    rawBalance,
    balance: rawBalance,
    rawDebt: rawBalance,
    debtAmount,
    positiveDebt: debtAmount,
    creditBalance,
    creditBalanceAmount: creditBalance,
    displayStatus,
    status: displayStatus === 'settled_by_tolerance' ? 'paid' : displayStatus,
    hasOpenDebt: rawBalance > tolerance,
    isOverpaid: rawBalance < -tolerance,
    withinTolerance,
    tolerance
  };
}

function applyDebtProjection(target = {}, input = {}, options = {}) {
  const projection = projectBalanceFromTotals(input, options);
  target.rawBalance = projection.rawBalance;
  target.balance = projection.balance;
  target.rawDebt = projection.rawDebt;
  target.debtAmount = projection.debtAmount;
  target.positiveDebt = projection.positiveDebt;
  target.creditBalance = projection.creditBalance;
  target.creditBalanceAmount = projection.creditBalanceAmount;
  target.displayStatus = projection.displayStatus;
  target.debtZeroTolerance = projection.tolerance;
  return projection;
}

module.exports = {
  money,
  projectBalanceFromTotals,
  applyDebtProjection
};
