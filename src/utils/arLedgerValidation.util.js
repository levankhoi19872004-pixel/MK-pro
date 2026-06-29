'use strict';

const { toNumber } = require('./common.util');

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function categoryOf(entry = {}) {
  const explicit = upper(entry.category || entry.ledgerType || '');
  if (explicit) return explicit;
  const type = clean(entry.type).toLowerCase();
  if (type === 'ar_return') return 'AR-RETURN';
  if (type === 'ar_return_reversal') return 'AR-RETURN-REVERSAL';
  if (type === 'ar_sale') return 'AR-SALE';
  if (type === 'ar_receipt') return 'AR-RECEIPT';
  return upper(entry.type || '');
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
  return categoryOf(entry) === 'AR-RETURN-REVERSAL'
    || upper(entry.ledgerType) === 'AR-RETURN-REVERSAL'
    || upper(entry.type) === 'AR_RETURN_REVERSAL'
    || clean(entry.type).toLowerCase() === 'ar_return_reversal';
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
