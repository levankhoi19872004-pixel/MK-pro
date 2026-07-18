'use strict';

/**
 * Canonical AR category registry for the active debt read model.
 *
 * Accounting documents may contain additional audit/reversal categories, but
 * only ACTIVE_DEBT_READ_MODEL_CATEGORIES are eligible to participate in the
 * official customer/order debt balance. Source/provenance checks are applied
 * separately to detailed accounting categories to prevent legacy closeout
 * rows from leaking into the active debt balance.
 */
const AR_CATEGORIES = Object.freeze({
  DEBT_OPEN: 'AR-DEBT-OPEN',
  DEBT_PAYMENT: 'AR-DEBT-PAYMENT',
  DEBT_ADJUSTMENT: 'AR-DEBT-ADJUSTMENT',
  DEBT_VOID: 'AR-DEBT-VOID',
  SALE: 'AR-SALE',
  SALE_REVERSAL: 'AR-SALE-REVERSAL',
  RETURN: 'AR-RETURN',
  RETURN_REVERSAL: 'AR-RETURN-REVERSAL',
  RECEIPT: 'AR-RECEIPT',
  RECEIPT_CASH: 'AR-RECEIPT-CASH',
  RECEIPT_BANK: 'AR-RECEIPT-BANK',
  RECEIPT_REVERSAL: 'AR-RECEIPT-REVERSAL',
  REWARD_ALLOWANCE: 'AR-REWARD-ALLOWANCE',
  BONUS: 'AR-BONUS',
  ALLOWANCE: 'AR-ALLOWANCE',
  BONUS_ALLOWANCE: 'AR-BONUS-ALLOWANCE',
  EXTERNAL: 'AR-EXTERNAL',
  EXTERNAL_DEBT: 'AR-EXTERNAL-DEBT',
  ADJUSTMENT: 'AR-ADJUSTMENT'
});

const PHASE87_READ_MODEL_CATEGORIES = Object.freeze([
  AR_CATEGORIES.DEBT_OPEN,
  AR_CATEGORIES.DEBT_PAYMENT,
  AR_CATEGORIES.DEBT_ADJUSTMENT,
  AR_CATEGORIES.DEBT_VOID
]);

const ACTIVE_DEBT_INCREASE_CATEGORIES = Object.freeze([
  AR_CATEGORIES.DEBT_OPEN,
  AR_CATEGORIES.SALE,
  AR_CATEGORIES.EXTERNAL,
  AR_CATEGORIES.EXTERNAL_DEBT
]);

const ACTIVE_DEBT_DECREASE_CATEGORIES = Object.freeze([
  AR_CATEGORIES.DEBT_PAYMENT,
  AR_CATEGORIES.RECEIPT,
  AR_CATEGORIES.RECEIPT_CASH,
  AR_CATEGORIES.RECEIPT_BANK,
  AR_CATEGORIES.RETURN,
  AR_CATEGORIES.REWARD_ALLOWANCE,
  AR_CATEGORIES.BONUS,
  AR_CATEGORIES.ALLOWANCE,
  AR_CATEGORIES.BONUS_ALLOWANCE
]);

const ACTIVE_DEBT_ADJUSTMENT_CATEGORIES = Object.freeze([
  AR_CATEGORIES.DEBT_ADJUSTMENT
]);

const ACTIVE_DEBT_READ_MODEL_CATEGORIES = Object.freeze(Array.from(new Set([
  ...ACTIVE_DEBT_INCREASE_CATEGORIES,
  ...ACTIVE_DEBT_DECREASE_CATEGORIES,
  ...ACTIVE_DEBT_ADJUSTMENT_CATEGORIES
])));

const EXCLUDED_DEBT_READ_MODEL_CATEGORIES = Object.freeze([
  AR_CATEGORIES.SALE_REVERSAL,
  AR_CATEGORIES.RETURN_REVERSAL,
  AR_CATEGORIES.RECEIPT_REVERSAL
]);

const DETAILED_ACCOUNTING_CATEGORIES = Object.freeze([
  AR_CATEGORIES.SALE,
  AR_CATEGORIES.SALE_REVERSAL,
  AR_CATEGORIES.RETURN,
  AR_CATEGORIES.RETURN_REVERSAL,
  AR_CATEGORIES.RECEIPT,
  AR_CATEGORIES.RECEIPT_CASH,
  AR_CATEGORIES.RECEIPT_BANK,
  AR_CATEGORIES.RECEIPT_REVERSAL,
  AR_CATEGORIES.REWARD_ALLOWANCE,
  AR_CATEGORIES.BONUS,
  AR_CATEGORIES.ALLOWANCE,
  AR_CATEGORIES.BONUS_ALLOWANCE,
  AR_CATEGORIES.EXTERNAL,
  AR_CATEGORIES.EXTERNAL_DEBT,
  AR_CATEGORIES.ADJUSTMENT
]);

const ALL_SUPPORTED_AR_CATEGORIES = Object.freeze(Array.from(new Set([
  ...PHASE87_READ_MODEL_CATEGORIES,
  ...DETAILED_ACCOUNTING_CATEGORIES
])));

const ACCOUNTING_READ_MODEL_PROJECTABLE_CATEGORIES = Object.freeze([
  ...ACTIVE_DEBT_READ_MODEL_CATEGORIES,
  AR_CATEGORIES.BONUS,
  AR_CATEGORIES.ALLOWANCE,
  AR_CATEGORIES.ADJUSTMENT
]);

const CATEGORY_EFFECT = Object.freeze({
  [AR_CATEGORIES.DEBT_OPEN]: 'debit',
  [AR_CATEGORIES.DEBT_PAYMENT]: 'credit',
  [AR_CATEGORIES.DEBT_ADJUSTMENT]: 'either',
  [AR_CATEGORIES.DEBT_VOID]: 'either',
  [AR_CATEGORIES.SALE]: 'debit',
  [AR_CATEGORIES.SALE_REVERSAL]: 'credit',
  [AR_CATEGORIES.RETURN]: 'credit',
  [AR_CATEGORIES.RETURN_REVERSAL]: 'debit',
  [AR_CATEGORIES.RECEIPT]: 'credit',
  [AR_CATEGORIES.RECEIPT_CASH]: 'credit',
  [AR_CATEGORIES.RECEIPT_BANK]: 'credit',
  [AR_CATEGORIES.RECEIPT_REVERSAL]: 'debit',
  [AR_CATEGORIES.REWARD_ALLOWANCE]: 'credit',
  [AR_CATEGORIES.BONUS]: 'credit',
  [AR_CATEGORIES.ALLOWANCE]: 'credit',
  [AR_CATEGORIES.BONUS_ALLOWANCE]: 'credit',
  [AR_CATEGORIES.EXTERNAL]: 'debit',
  [AR_CATEGORIES.EXTERNAL_DEBT]: 'debit',
  [AR_CATEGORIES.ADJUSTMENT]: 'either'
});

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function normalizeCategory(value = '') {
  return upper(value);
}

function isActiveDebtReadModelCategory(value = '') {
  return ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(normalizeCategory(value));
}

function isExcludedDebtReadModelCategory(value = '') {
  return EXCLUDED_DEBT_READ_MODEL_CATEGORIES.includes(normalizeCategory(value));
}

function isDebtCollectionReceiptLedger(ledger = {}) {
  const category = normalizeCategory(ledger.category || ledger.ledgerType);
  if (![AR_CATEGORIES.RECEIPT, AR_CATEGORIES.RECEIPT_CASH, AR_CATEGORIES.RECEIPT_BANK].includes(category)) return false;

  const sourceType = upper(ledger.sourceType);
  const refType = upper(ledger.refType);
  const source = upper(ledger.source);
  const idempotencyKey = upper(ledger.idempotencyKey);

  return sourceType === 'DEBTCOLLECTION'
    || refType === 'DEBTCOLLECTION'
    || source === 'DEBTCOLLECTIONPOSTINGSERVICE'
    || /^AR-RECEIPT:DC[A-Z0-9_-]*:/i.test(idempotencyKey);
}

function canProjectDetailedAccountingCategoryBySource(ledger = {}) {
  const category = normalizeCategory(ledger.category || ledger.ledgerType);
  if (!ACCOUNTING_READ_MODEL_PROJECTABLE_CATEGORIES.includes(category)) return false;
  if (PHASE87_READ_MODEL_CATEGORIES.includes(category)) return true;

  const sourceType = upper(ledger.sourceType);
  if (category === AR_CATEGORIES.RETURN && ['RETURN_ORDER', 'ORDER_RETURN', 'RETURNORDERS'].includes(sourceType)) return true;
  if ([AR_CATEGORIES.EXTERNAL, AR_CATEGORIES.EXTERNAL_DEBT].includes(category) && ['EXTERNALDEBT', 'EXTERNALDEBTORDER', 'EXTERNAL_DEBT', 'EXTERNAL_DEBT_ORDER'].includes(sourceType)) return true;
  if (sourceType === 'ORDER_PAYMENT_ALLOCATION') return true;
  return isDebtCollectionReceiptLedger(ledger);
}

function categoryEffect(value = '') {
  return CATEGORY_EFFECT[normalizeCategory(value)] || '';
}

module.exports = {
  AR_CATEGORIES,
  PHASE87_READ_MODEL_CATEGORIES,
  ACTIVE_DEBT_INCREASE_CATEGORIES,
  ACTIVE_DEBT_DECREASE_CATEGORIES,
  ACTIVE_DEBT_ADJUSTMENT_CATEGORIES,
  ACTIVE_DEBT_READ_MODEL_CATEGORIES,
  EXCLUDED_DEBT_READ_MODEL_CATEGORIES,
  DETAILED_ACCOUNTING_CATEGORIES,
  ALL_SUPPORTED_AR_CATEGORIES,
  ACCOUNTING_READ_MODEL_PROJECTABLE_CATEGORIES,
  CATEGORY_EFFECT,
  normalizeCategory,
  isActiveDebtReadModelCategory,
  isExcludedDebtReadModelCategory,
  isDebtCollectionReceiptLedger,
  canProjectDetailedAccountingCategoryBySource,
  categoryEffect
};
