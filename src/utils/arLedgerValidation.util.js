'use strict';

const { toNumber } = require('./common.util');
const { normalizeArCategory } = require('./arLedgerCategoryEffect.util');

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function categoryOf(entry = {}) {
  return normalizeArCategory(entry);
}

function directionOf(entry = {}) {
  return clean(entry.direction).toLowerCase();
}

function containsRevMarker(value = '') {
  return /(^|[-_\s])REV($|[-_\s])|REVERSAL/i.test(clean(value));
}

function isArReturn(entry = {}) {
  return categoryOf(entry) === 'AR-RETURN';
}

function isArReturnReversal(entry = {}) {
  return categoryOf(entry) === 'AR-RETURN-REVERSAL';
}

function ledgerIdentity(entry = {}) {
  return clean(entry.id || entry.code || entry._id || '(unknown)');
}

function validateArLedgerEntry(entry = {}, options = {}) {
  const amount = toNumber(entry.amount);
  const debit = toNumber(entry.debit);
  const credit = toNumber(entry.credit);
  const direction = directionOf(entry);
  const errors = [];

  if (amount < 0) errors.push({ code: 'NEGATIVE_AMOUNT', field: 'amount', value: amount });
  if (debit < 0) errors.push({ code: 'NEGATIVE_DEBIT', field: 'debit', value: debit });
  if (credit < 0) errors.push({ code: 'NEGATIVE_CREDIT', field: 'credit', value: credit });
  if (debit > 0 && credit > 0) errors.push({ code: 'DEBIT_AND_CREDIT_BOTH_POSITIVE', debit, credit });
  if (debit > 0 && direction === 'credit') errors.push({ code: 'DEBIT_DIRECTION_CONFLICT', debit, direction });
  if (credit > 0 && direction === 'debit') errors.push({ code: 'CREDIT_DIRECTION_CONFLICT', credit, direction });

  if (isArReturn(entry)) {
    if (debit > 0) errors.push({ code: 'AR_RETURN_DEBIT_POSITIVE', debit });
    if (containsRevMarker(entry.id) || containsRevMarker(entry.code)) {
      errors.push({ code: 'AR_RETURN_CODE_CONTAINS_REV', ledgerId: clean(entry.id), ledgerCode: clean(entry.code) });
    }
  }

  if (isArReturnReversal(entry)) {
    if (!(debit > 0 && credit === 0 && direction === 'debit')) {
      errors.push({ code: 'AR_RETURN_REVERSAL_MUST_BE_DEBIT_ONLY', debit, credit, direction });
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings: [],
    ledgerId: ledgerIdentity(entry),
    strict: options.strict !== false
  };
}

function assertValidArLedgerEntry(entry = {}, options = {}) {
  const result = validateArLedgerEntry(entry, options);
  if (!result.ok) {
    const err = new Error(`Invalid AR ledger ${result.ledgerId}: ${result.errors.map((item) => item.code).join(', ')}`);
    err.code = 'INVALID_AR_LEDGER';
    err.severity = 'P0';
    err.validation = result;
    throw err;
  }
  return entry;
}

module.exports = {
  validateArLedgerEntry,
  assertValidArLedgerEntry,
  categoryOf,
  containsRevMarker,
  isArReturn,
  isArReturnReversal
};
