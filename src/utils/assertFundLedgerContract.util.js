'use strict';

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function validateFundLedgerContract(ledger = {}) {
  const errors = [];
  const warnings = [];
  const direction = lower(ledger.direction);
  const fundType = lower(ledger.fundType);
  if (!['cash', 'bank'].includes(fundType)) errors.push({ code: 'FUND_LEDGER_INVALID_FUND_TYPE', field: 'fundType', actual: ledger.fundType });
  if (!['in', 'out'].includes(direction)) errors.push({ code: 'FUND_LEDGER_INVALID_DIRECTION', field: 'direction', actual: ledger.direction });
  if (money(ledger.amount) <= 0) errors.push({ code: 'FUND_LEDGER_INVALID_AMOUNT', field: 'amount', actual: ledger.amount });
  for (const field of ['sourceType', 'sourceId', 'idempotencyKey']) {
    if (!clean(ledger[field])) errors.push({ code: 'FUND_LEDGER_MISSING_REQUIRED_FIELD', field });
  }
  if (ledger.accountingConfirmed !== true) errors.push({ code: 'FUND_LEDGER_NOT_CONFIRMED', field: 'accountingConfirmed', expected: true, actual: ledger.accountingConfirmed });
  if (clean(ledger.accountingStatus) && lower(ledger.accountingStatus) !== 'confirmed') {
    errors.push({ code: 'FUND_LEDGER_INVALID_ACCOUNTING_STATUS', field: 'accountingStatus', expected: 'confirmed', actual: ledger.accountingStatus });
  }
  if (ledger.isDeleted === true || clean(ledger.deletedAt)) errors.push({ code: 'FUND_LEDGER_DELETED_ROW', field: 'isDeleted/deletedAt' });
  if (!Array.isArray(ledger.auditTrail)) warnings.push({ code: 'FUND_LEDGER_AUDIT_TRAIL_NOT_ARRAY', field: 'auditTrail' });
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ledgerId: clean(ledger.id || ledger.code || ledger._id || '(unknown)')
  };
}

function assertFundLedgerContract(ledger = {}) {
  const result = validateFundLedgerContract(ledger);
  if (!result.ok) {
    const err = new Error(`Invalid fund ledger ${result.ledgerId}: ${result.errors.map((item) => item.code).join(', ')}`);
    err.code = 'INVALID_FUND_LEDGER_CONTRACT';
    err.severity = 'P0';
    err.validation = result;
    throw err;
  }
  return ledger;
}

module.exports = { validateFundLedgerContract, assertFundLedgerContract };
