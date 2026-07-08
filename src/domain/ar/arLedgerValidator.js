'use strict';

const { toNumber } = require('../../utils/common.util');

const PHASE87_READ_MODEL_CATEGORIES = Object.freeze([
  'AR-DEBT-OPEN',
  'AR-DEBT-PAYMENT',
  'AR-DEBT-ADJUSTMENT',
  'AR-DEBT-VOID',
  // Phase191: orderPaymentAllocations post detailed allocation rows.
  'AR-SALE',
  'AR-RECEIPT-CASH',
  'AR-RECEIPT-BANK',
  'AR-REWARD-ALLOWANCE',
  'AR-RETURN'
]);

// Legacy categories are retained only so legacy audit/migration and old repair tests
// can validate their existing rows. They are never canonical for the Phase88 debt
// read model because isCanonicalArDebtLedger() below allows only AR-DEBT-* enums.
const DEBT_CATEGORIES = Object.freeze([
  ...PHASE87_READ_MODEL_CATEGORIES,
  'AR-SALE',
  'AR-SALE-REVERSAL',
  'AR-RETURN',
  'AR-RETURN-REVERSAL',
  'AR-RECEIPT',
  'AR-RECEIPT-CASH',
  'AR-RECEIPT-BANK',
  'AR-REWARD-ALLOWANCE',
  'AR-BONUS',
  'AR-ALLOWANCE',
  'AR-ADJUSTMENT'
]);

const CATEGORY_EFFECT = Object.freeze({
  'AR-DEBT-OPEN': 'debit',
  'AR-DEBT-PAYMENT': 'credit',
  'AR-DEBT-ADJUSTMENT': 'either',
  'AR-DEBT-VOID': 'either',
  'AR-SALE': 'debit',
  'AR-SALE-REVERSAL': 'credit',
  'AR-RETURN': 'credit',
  'AR-RETURN-REVERSAL': 'debit',
  'AR-RECEIPT': 'credit',
  'AR-RECEIPT-CASH': 'credit',
  'AR-RECEIPT-BANK': 'credit',
  'AR-REWARD-ALLOWANCE': 'credit',
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

function hasOwnValue(source = {}, field) {
  return Object.prototype.hasOwnProperty.call(source, field)
    && source[field] !== undefined
    && source[field] !== null
    && clean(source[field]) !== '';
}

function ledgerIdentity(ledger = {}) {
  return clean(ledger.id || ledger.code || ledger._id || '(unknown)');
}

function moneyField(ledger = {}, field, errors = []) {
  if (!hasOwnValue(ledger, field)) {
    errors.push({ code: 'DIRTY_LEDGER_MISSING_AMOUNT_FIELD', field });
    return 0;
  }
  const raw = Number(toNumber(ledger[field]));
  if (!Number.isFinite(raw)) {
    errors.push({ code: 'DIRTY_LEDGER_INVALID_AMOUNT_FIELD', field, value: ledger[field] });
    return 0;
  }
  const amount = Math.round(raw);
  if (amount < 0) errors.push({ code: 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', field, reason: 'negative amount', value: amount });
  return amount;
}

function normalizeAccountingAmount(ledger = {}) {
  const errors = [];
  const debit = moneyField(ledger, 'debit', errors);
  const credit = moneyField(ledger, 'credit', errors);
  const amount = moneyField(ledger, 'amount', errors);
  const direction = lower(hasOwnValue(ledger, 'direction') ? ledger.direction : '');
  const amountField = lower(hasOwnValue(ledger, 'amountField') ? ledger.amountField : '');
  return { debit, credit, amount, direction, amountField, errors };
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
  const amounts = normalizeAccountingAmount(ledger);
  const { debit, credit, amount, direction, amountField } = amounts;
  for (const error of amounts.errors || []) errors.push(error);

  if (!hasOwnValue(ledger, 'direction')) errors.push({ code: 'DIRTY_LEDGER_MISSING_DIRECTION', field: 'direction' });
  if (!hasOwnValue(ledger, 'amountField')) errors.push({ code: 'DIRTY_LEDGER_MISSING_AMOUNT_FIELD', field: 'amountField' });
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
  } else {
    errors.push({ code: 'DIRTY_LEDGER_UNSUPPORTED_READ_MODEL_CATEGORY', category });
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
    errors.push({ code: 'DIRTY_LEDGER_UNSUPPORTED_READ_MODEL_CATEGORY', field: 'category', value: ledger.category });
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

  if (category === 'AR-DEBT-OPEN') {
    if (entryType !== 'normal') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'entryType', expected: 'normal', actual: ledger.entryType });
    if (clean(ledger.sourceType) !== 'SALES_ORDER_DELIVERY_CLOSEOUT') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'sourceType', expected: 'SALES_ORDER_DELIVERY_CLOSEOUT', actual: ledger.sourceType });
    if (!/^AR-DEBT-OPEN:[^\s:]+$/.test(clean(ledger.idempotencyKey))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'idempotencyKey', expected: 'AR-DEBT-OPEN:<orderId>' });
    }
  }

  if (category === 'AR-DEBT-PAYMENT') {
    if (entryType !== 'normal') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'entryType', expected: 'normal', actual: ledger.entryType });
    if (!/^AR-DEBT-PAYMENT:[^\s:]+/.test(clean(ledger.idempotencyKey))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'idempotencyKey', expected: 'AR-DEBT-PAYMENT:<paymentId>...' });
    }
  }

  if (category === 'AR-DEBT-ADJUSTMENT') {
    if (entryType !== 'normal') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'entryType', expected: 'normal', actual: ledger.entryType });
    if (!/^AR-DEBT-ADJUSTMENT:[^\s:]+/.test(clean(ledger.idempotencyKey))) {
      errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'idempotencyKey', expected: 'AR-DEBT-ADJUSTMENT:<orderId>...' });
    }
  }

  if (category === 'AR-DEBT-VOID') {
    if (entryType !== 'normal') errors.push({ code: 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', field: 'entryType', expected: 'normal', actual: ledger.entryType });
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

function isEligibleActiveConfirmedArLedger(ledger = {}) {
  if (ledger.accountingConfirmed !== true) return false;
  if (clean(ledger.accountingStatus) !== 'confirmed') return false;
  if (ledger.active !== true) return false;
  if (ledger.reversed === true || ledger.isDeleted === true || ledger.deleted === true) return false;
  if (clean(ledger.deletedAt)) return false;
  return true;
}

function isCanonicalArDebtLedger(ledger = {}) {
  const category = upper(ledger.category);
  if (!DEBT_CATEGORIES.includes(category)) return false;
  if (!isEligibleActiveConfirmedArLedger(ledger)) return false;
  return validateArLedgerContract(ledger).ok;
}

function isPhase87ReadModelArDebtLedger(ledger = {}) {
  const category = upper(ledger.category);
  if (!PHASE87_READ_MODEL_CATEGORIES.includes(category)) return false;
  if (!isEligibleActiveConfirmedArLedger(ledger)) return false;
  return validateArLedgerContract(ledger).ok;
}

module.exports = {
  DEBT_CATEGORIES,
  PHASE87_READ_MODEL_CATEGORIES,
  CATEGORY_EFFECT,
  normalizeAccountingAmount,
  validateArLedgerContract,
  assertValidArLedgerContract,
  isCanonicalArDebtLedger,
  isPhase87ReadModelArDebtLedger,
  hasAccRevMismatch
};
