'use strict';

const { toNumber } = require('../../utils/common.util');

const DEBT_CATEGORIES = Object.freeze([
  'AR-SALE',
  'AR-SALE-REVERSAL',
  'AR-RETURN',
  'AR-RETURN-REVERSAL',
  'AR-RECEIPT',
  'AR-BONUS',
  'AR-ALLOWANCE',
  'AR-ADJUSTMENT'
]);

const CATEGORY_EFFECT = Object.freeze({
  'AR-SALE': 'debit',
  'AR-SALE-REVERSAL': 'credit',
  'AR-RETURN': 'credit',
  'AR-RETURN-REVERSAL': 'debit',
  'AR-RECEIPT': 'credit',
  'AR-BONUS': 'credit',
  'AR-ALLOWANCE': 'credit',
  'AR-ADJUSTMENT': 'either'
});

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function ledgerIdentity(ledger = {}) {
  return clean(ledger.id || ledger.code || ledger._id || '(unknown)');
}

function normalizeAccountingAmount(ledger = {}) {
  const debit = Math.max(0, Math.round(toNumber(ledger.debit)));
  const credit = Math.max(0, Math.round(toNumber(ledger.credit)));
  const amount = Math.max(0, Math.round(toNumber(ledger.amount || Math.max(debit, credit))));
  const direction = lower(ledger.direction || (debit > 0 ? 'debit' : (credit > 0 ? 'credit' : '')));
  const amountField = lower(ledger.amountField || direction);
  return { debit, credit, amount, direction, amountField };
}

function pushRequired(errors, ledger, field, code) {
  if (!clean(ledger[field])) errors.push({ code, field });
}

function pushBoolRequired(errors, ledger, field, expected, code) {
  if (ledger[field] !== expected) errors.push({ code, field, expected, actual: ledger[field] });
}

function hasAccRevMismatch(ledger = {}) {
  const id = clean(ledger.id || ledger.code);
  const batch = clean(ledger.accountingBatchId);
  return /ACC-/i.test(id) && /^REV-/i.test(batch);
}

function validateDebitCreditShape(ledger = {}, errors = []) {
  const category = upper(ledger.category);
  const effect = CATEGORY_EFFECT[category];
  const { debit, credit, amount, direction, amountField } = normalizeAccountingAmount(ledger);

  if (toNumber(ledger.debit) < 0) errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', field: 'debit', reason: 'negative debit' });
  if (toNumber(ledger.credit) < 0) errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', field: 'credit', reason: 'negative credit' });
  if (toNumber(ledger.amount) < 0) errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', field: 'amount', reason: 'negative amount' });
  if (debit > 0 && credit > 0) errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', reason: 'debit and credit both positive', debit, credit });
  if (debit === 0 && credit === 0 && amount > 0) errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', reason: 'amount positive but debit/credit zero', amount });

  if (effect === 'debit') {
    if (!(debit > 0 && credit === 0 && direction === 'debit' && amountField === 'debit')) {
      errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', category, expected: 'debit only', debit, credit, direction, amountField });
    }
  } else if (effect === 'credit') {
    if (!(credit > 0 && debit === 0 && direction === 'credit' && amountField === 'credit')) {
      errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', category, expected: 'credit only', debit, credit, direction, amountField });
    }
  } else if (effect === 'either') {
    if (!((debit > 0 && credit === 0 && direction === 'debit' && amountField === 'debit')
      || (credit > 0 && debit === 0 && direction === 'credit' && amountField === 'credit'))) {
      errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', category, expected: 'single sided adjustment', debit, credit, direction, amountField });
    }
  }

  if (amount !== Math.max(debit, credit)) {
    errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', reason: 'amount must equal max(debit, credit)', amount, debit, credit });
  }
  return errors;
}

function validateArLedgerContract(ledger = {}) {
  const errors = [];
  const warnings = [];
  const category = upper(ledger.category);
  const ledgerType = upper(ledger.ledgerType);
  const entryType = lower(ledger.entryType);

  if (upper(ledger.account || 'AR') !== 'AR') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'account', expected: 'AR' });
  pushRequired(errors, ledger, 'category', 'DIRTY_LEDGER_MISSING_CATEGORY');
  pushRequired(errors, ledger, 'ledgerType', 'DIRTY_LEDGER_MISSING_LEDGER_TYPE');
  pushRequired(errors, ledger, 'entryType', 'DIRTY_LEDGER_MISSING_ENTRY_TYPE');
  pushRequired(errors, ledger, 'sourceType', 'DIRTY_LEDGER_MISSING_SOURCE_TYPE');
  pushRequired(errors, ledger, 'sourceId', 'DIRTY_LEDGER_MISSING_SOURCE_ID');
  pushRequired(errors, ledger, 'sourceCode', 'DIRTY_LEDGER_MISSING_SOURCE_CODE');
  pushRequired(errors, ledger, 'customerCode', 'DIRTY_LEDGER_MISSING_CUSTOMER_CODE');
  pushRequired(errors, ledger, 'idempotencyKey', 'DIRTY_LEDGER_MISSING_IDEMPOTENCY_KEY');
  pushRequired(errors, ledger, 'accountingStatus', 'DIRTY_LEDGER_MISSING_ACCOUNTING_STATUS');
  pushBoolRequired(errors, ledger, 'accountingConfirmed', true, 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT');

  if (category && !DEBT_CATEGORIES.includes(category)) {
    errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'category', value: ledger.category });
  }
  if (category && ledgerType && ledgerType !== category) {
    errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'ledgerType', expected: category, actual: ledger.ledgerType });
  }
  if (clean(ledger.accountingStatus) !== 'confirmed') {
    errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'accountingStatus', expected: 'confirmed', actual: ledger.accountingStatus });
  }
  if (ledger.active !== true) {
    errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'active', expected: true, actual: ledger.active });
  }
  if (ledger.reversed === true) {
    errors.push({ code: 'DIRTY_LEDGER_REVERSED_BUT_ACTIVE', field: 'reversed', expected: false, actual: true });
  }
  if (hasAccRevMismatch(ledger)) {
    errors.push({ code: 'DIRTY_LEDGER_ACC_ID_REV_BATCH_MISMATCH', field: 'accountingBatchId', id: ledger.id, accountingBatchId: ledger.accountingBatchId });
  }

  validateDebitCreditShape(ledger, errors);

  if (category === 'AR-SALE') {
    if (entryType !== 'normal') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'entryType', expected: 'normal', actual: ledger.entryType });
    if (clean(ledger.sourceType) !== 'salesOrder') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'sourceType', expected: 'salesOrder', actual: ledger.sourceType });
    if (!/^AR-SALE:salesOrder:[^\s]+$/.test(clean(ledger.idempotencyKey))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'idempotencyKey', expected: 'AR-SALE:salesOrder:<sourceId>' });
    }
    if (!/^ACC-/.test(clean(ledger.accountingBatchId))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'accountingBatchId', expected: 'ACC-*', actual: ledger.accountingBatchId });
    }
  }

  if (category === 'AR-SALE-REVERSAL') {
    if (entryType !== 'reversal') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'entryType', expected: 'reversal', actual: ledger.entryType });
    if (clean(ledger.sourceType) !== 'salesOrder') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'sourceType', expected: 'salesOrder', actual: ledger.sourceType });
    pushRequired(errors, ledger, 'reversedLedgerId', 'DIRTY_LEDGER_MISSING_REVERSED_LEDGER_ID');
    if (!/^AR-SALE-REVERSAL:salesOrder:[^:]+:.+/.test(clean(ledger.idempotencyKey))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'idempotencyKey', expected: 'AR-SALE-REVERSAL:salesOrder:<sourceId>:<originalLedgerId>' });
    }
    if (!/^REV-/.test(clean(ledger.accountingBatchId))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'accountingBatchId', expected: 'REV-*', actual: ledger.accountingBatchId });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ledgerId: ledgerIdentity(ledger),
    category
  };
}

function assertValidArLedgerContract(ledger = {}) {
  const result = validateArLedgerContract(ledger);
  if (!result.ok) {
    const err = new Error(`Invalid canonical AR ledger ${result.ledgerId}: ${result.errors.map((item) => item.code).join(', ')}`);
    err.code = 'INVALID_AR_LEDGER_CONTRACT';
    err.severity = 'P0';
    err.validation = result;
    throw err;
  }
  return ledger;
}

function isCanonicalArDebtLedger(ledger = {}) {
  const category = upper(ledger.category);
  if (!DEBT_CATEGORIES.includes(category)) return false;
  if (ledger.accountingConfirmed !== true) return false;
  if (clean(ledger.accountingStatus) !== 'confirmed') return false;
  if (ledger.active !== true) return false;
  if (ledger.reversed === true || ledger.isDeleted === true || ledger.deleted === true) return false;
  if (clean(ledger.deletedAt)) return false;
  return validateArLedgerContract(ledger).ok;
}

module.exports = {
  DEBT_CATEGORIES,
  CATEGORY_EFFECT,
  normalizeAccountingAmount,
  validateArLedgerContract,
  assertValidArLedgerContract,
  isCanonicalArDebtLedger,
  hasAccRevMismatch
};
