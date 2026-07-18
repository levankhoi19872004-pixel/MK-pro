'use strict';

const { AR_CATEGORIES, normalizeCategory } = require('./arDebtCategoryRegistry');

const SEMANTIC_ROLES = Object.freeze({
  OPENING_OBLIGATION: 'OPENING_OBLIGATION',
  PAYMENT_REDUCTION: 'PAYMENT_REDUCTION',
  RETURN_REDUCTION: 'RETURN_REDUCTION',
  CORRECTION_DELTA: 'CORRECTION_DELTA',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  REVERSAL: 'REVERSAL',
  VOID: 'VOID',
  CUSTOMER_SCOPE_OBLIGATION: 'CUSTOMER_SCOPE_OBLIGATION',
  DIAGNOSTIC_ONLY: 'DIAGNOSTIC_ONLY',
  UNSUPPORTED: 'UNSUPPORTED'
});

const LEDGER_FAMILIES = Object.freeze({
  LEGACY_SALES_AR: 'LEGACY_SALES_AR',
  LEGACY_RECEIPT_AR: 'LEGACY_RECEIPT_AR',
  CANONICAL_DEBT: 'CANONICAL_DEBT',
  CORRECTION_DEBT: 'CORRECTION_DEBT',
  RETURN_DEBT: 'RETURN_DEBT',
  REVERSAL_DEBT: 'REVERSAL_DEBT',
  CUSTOMER_SCOPE_DEBT: 'CUSTOMER_SCOPE_DEBT',
  UNKNOWN: 'UNKNOWN'
});

function entry(category, ledgerFamily, semanticRole, options = {}) {
  return Object.freeze({
    category,
    ledgerFamily,
    semanticRole,
    balanceImpacting: options.balanceImpacting !== false,
    expectedSourceType: Object.freeze(options.expectedSourceType || []),
    directionPolicy: options.directionPolicy || 'DOCUMENT_DEBIT_CREDIT',
    mayCoexistWith: Object.freeze(options.mayCoexistWith || []),
    cannotCoexistWith: Object.freeze(options.cannotCoexistWith || []),
    replacementFamily: options.replacementFamily || '',
    projectionPolicy: options.projectionPolicy || 'SELECT_BY_OWNERSHIP_RESOLVER'
  });
}

const CATEGORY_SEMANTIC_REGISTRY = Object.freeze({
  [AR_CATEGORIES.DEBT_OPEN]: entry(AR_CATEGORIES.DEBT_OPEN, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.OPENING_OBLIGATION, {
    expectedSourceType: ['SALES_ORDER_DELIVERY_CLOSEOUT'],
    cannotCoexistWith: [AR_CATEGORIES.SALE],
    directionPolicy: 'DEBIT_ONLY'
  }),
  [AR_CATEGORIES.SALE]: entry(AR_CATEGORIES.SALE, LEDGER_FAMILIES.LEGACY_SALES_AR, SEMANTIC_ROLES.OPENING_OBLIGATION, {
    expectedSourceType: ['ORDER_PAYMENT_ALLOCATION', 'SALES_ORDER', 'SALES_ORDER_DELIVERY_CLOSEOUT'],
    cannotCoexistWith: [AR_CATEGORIES.DEBT_OPEN],
    replacementFamily: LEDGER_FAMILIES.CANONICAL_DEBT,
    directionPolicy: 'DEBIT_ONLY'
  }),
  [AR_CATEGORIES.DEBT_PAYMENT]: entry(AR_CATEGORIES.DEBT_PAYMENT, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['ORDER_PAYMENT_ALLOCATION', 'DEBT_RECEIPT', 'DEBTCOLLECTION'],
    cannotCoexistWith: [AR_CATEGORIES.RECEIPT, AR_CATEGORIES.RECEIPT_CASH, AR_CATEGORIES.RECEIPT_BANK],
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.RECEIPT]: entry(AR_CATEGORIES.RECEIPT, LEDGER_FAMILIES.LEGACY_RECEIPT_AR, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['DEBTCOLLECTION', 'ORDER_PAYMENT_ALLOCATION'],
    cannotCoexistWith: [AR_CATEGORIES.DEBT_PAYMENT],
    replacementFamily: LEDGER_FAMILIES.CANONICAL_DEBT,
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.RECEIPT_CASH]: entry(AR_CATEGORIES.RECEIPT_CASH, LEDGER_FAMILIES.LEGACY_RECEIPT_AR, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['DEBTCOLLECTION', 'ORDER_PAYMENT_ALLOCATION'],
    cannotCoexistWith: [AR_CATEGORIES.DEBT_PAYMENT],
    replacementFamily: LEDGER_FAMILIES.CANONICAL_DEBT,
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.RECEIPT_BANK]: entry(AR_CATEGORIES.RECEIPT_BANK, LEDGER_FAMILIES.LEGACY_RECEIPT_AR, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['DEBTCOLLECTION', 'ORDER_PAYMENT_ALLOCATION'],
    cannotCoexistWith: [AR_CATEGORIES.DEBT_PAYMENT],
    replacementFamily: LEDGER_FAMILIES.CANONICAL_DEBT,
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.RETURN]: entry(AR_CATEGORIES.RETURN, LEDGER_FAMILIES.RETURN_DEBT, SEMANTIC_ROLES.RETURN_REDUCTION, {
    expectedSourceType: ['RETURN_ORDER', 'ORDER_PAYMENT_ALLOCATION'],
    cannotCoexistWith: [AR_CATEGORIES.DEBT_ADJUSTMENT],
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.DEBT_ADJUSTMENT]: entry(AR_CATEGORIES.DEBT_ADJUSTMENT, LEDGER_FAMILIES.CORRECTION_DEBT, SEMANTIC_ROLES.CORRECTION_DELTA, {
    expectedSourceType: ['DELIVERY_CLOSEOUT_CORRECTION', 'MANUAL_ADJUSTMENT', 'REPAIR'],
    mayCoexistWith: [AR_CATEGORIES.DEBT_OPEN, AR_CATEGORIES.DEBT_PAYMENT],
    directionPolicy: 'DOCUMENT_DEBIT_CREDIT',
    projectionPolicy: 'EVIDENCE_GATED_LEGACY_ADJUSTMENT'
  }),
  [AR_CATEGORIES.DEBT_VOID]: entry(AR_CATEGORIES.DEBT_VOID, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.VOID, {
    directionPolicy: 'EITHER_SIDE'
  }),
  [AR_CATEGORIES.SALE_REVERSAL]: entry(AR_CATEGORIES.SALE_REVERSAL, LEDGER_FAMILIES.REVERSAL_DEBT, SEMANTIC_ROLES.REVERSAL, {
    balanceImpacting: false,
    directionPolicy: 'CREDIT_ONLY',
    projectionPolicy: 'DIAGNOSTIC_ONLY'
  }),
  [AR_CATEGORIES.RETURN_REVERSAL]: entry(AR_CATEGORIES.RETURN_REVERSAL, LEDGER_FAMILIES.REVERSAL_DEBT, SEMANTIC_ROLES.REVERSAL, {
    balanceImpacting: false,
    directionPolicy: 'DEBIT_ONLY',
    projectionPolicy: 'DIAGNOSTIC_ONLY'
  }),
  [AR_CATEGORIES.RECEIPT_REVERSAL]: entry(AR_CATEGORIES.RECEIPT_REVERSAL, LEDGER_FAMILIES.REVERSAL_DEBT, SEMANTIC_ROLES.REVERSAL, {
    balanceImpacting: false,
    directionPolicy: 'DEBIT_ONLY',
    projectionPolicy: 'DIAGNOSTIC_ONLY'
  }),
  [AR_CATEGORIES.REWARD_ALLOWANCE]: entry(AR_CATEGORIES.REWARD_ALLOWANCE, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['ORDER_PAYMENT_ALLOCATION'],
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.BONUS]: entry(AR_CATEGORIES.BONUS, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['ORDER_PAYMENT_ALLOCATION'],
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.ALLOWANCE]: entry(AR_CATEGORIES.ALLOWANCE, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['ORDER_PAYMENT_ALLOCATION'],
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.BONUS_ALLOWANCE]: entry(AR_CATEGORIES.BONUS_ALLOWANCE, LEDGER_FAMILIES.CANONICAL_DEBT, SEMANTIC_ROLES.PAYMENT_REDUCTION, {
    expectedSourceType: ['ORDER_PAYMENT_ALLOCATION'],
    directionPolicy: 'CREDIT_ONLY'
  }),
  [AR_CATEGORIES.EXTERNAL]: entry(AR_CATEGORIES.EXTERNAL, LEDGER_FAMILIES.CUSTOMER_SCOPE_DEBT, SEMANTIC_ROLES.CUSTOMER_SCOPE_OBLIGATION, {
    expectedSourceType: ['externalDebt', 'EXTERNAL_DEBT_ORDER'],
    directionPolicy: 'DEBIT_ONLY'
  }),
  [AR_CATEGORIES.EXTERNAL_DEBT]: entry(AR_CATEGORIES.EXTERNAL_DEBT, LEDGER_FAMILIES.CUSTOMER_SCOPE_DEBT, SEMANTIC_ROLES.CUSTOMER_SCOPE_OBLIGATION, {
    expectedSourceType: ['externalDebt', 'EXTERNAL_DEBT_ORDER'],
    directionPolicy: 'DEBIT_ONLY'
  }),
  [AR_CATEGORIES.ADJUSTMENT]: entry(AR_CATEGORIES.ADJUSTMENT, LEDGER_FAMILIES.CORRECTION_DEBT, SEMANTIC_ROLES.MANUAL_ADJUSTMENT, {
    directionPolicy: 'EITHER_SIDE'
  })
});

function upper(value = '') {
  return String(value ?? '').trim().toUpperCase();
}

function semanticRoleForLedger(ledger = {}) {
  const category = normalizeCategory(ledger.category || ledger.ledgerType);
  if (category === AR_CATEGORIES.DEBT_ADJUSTMENT) {
    const sourceType = upper(ledger.sourceType || ledger.refType);
    if (sourceType && sourceType !== 'DELIVERY_CLOSEOUT_CORRECTION') return SEMANTIC_ROLES.MANUAL_ADJUSTMENT;
  }
  return (CATEGORY_SEMANTIC_REGISTRY[category] || {}).semanticRole || SEMANTIC_ROLES.UNSUPPORTED;
}

function registryEntryForLedger(ledger = {}) {
  const category = normalizeCategory(ledger.category || ledger.ledgerType);
  const base = CATEGORY_SEMANTIC_REGISTRY[category];
  if (!base) {
    return entry(category || 'UNKNOWN', LEDGER_FAMILIES.UNKNOWN, SEMANTIC_ROLES.UNSUPPORTED, { balanceImpacting: false });
  }
  if (category === AR_CATEGORIES.DEBT_ADJUSTMENT && semanticRoleForLedger(ledger) === SEMANTIC_ROLES.MANUAL_ADJUSTMENT) {
    return { ...base, semanticRole: SEMANTIC_ROLES.MANUAL_ADJUSTMENT };
  }
  return base;
}

function ledgerFamilyForLedger(ledger = {}) {
  return registryEntryForLedger(ledger).ledgerFamily;
}

module.exports = {
  SEMANTIC_ROLES,
  LEDGER_FAMILIES,
  CATEGORY_SEMANTIC_REGISTRY,
  registryEntryForLedger,
  semanticRoleForLedger,
  ledgerFamilyForLedger
};
