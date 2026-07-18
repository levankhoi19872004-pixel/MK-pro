'use strict';

const COMPONENTS = Object.freeze({
  OPENING: 'OPENING',
  CASH: 'CASH',
  BANK: 'BANK',
  RECEIPT: 'RECEIPT',
  DEBT_PAYMENT: 'DEBT_PAYMENT',
  REWARD_ALLOWANCE: 'REWARD_ALLOWANCE',
  RETURN: 'RETURN',
  EXTERNAL_DEBT: 'EXTERNAL_DEBT',
  REVERSAL: 'REVERSAL',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  UNKNOWN: 'UNKNOWN'
});

const CATEGORY_COMPONENT = Object.freeze({
  'AR-DEBT-OPEN': COMPONENTS.OPENING,
  'AR-SALE': COMPONENTS.OPENING,
  'AR-RECEIPT-CASH': COMPONENTS.CASH,
  'AR-RECEIPT-BANK': COMPONENTS.BANK,
  'AR-RECEIPT': COMPONENTS.RECEIPT,
  'AR-DEBT-PAYMENT': COMPONENTS.DEBT_PAYMENT,
  'AR-REWARD-ALLOWANCE': COMPONENTS.REWARD_ALLOWANCE,
  'AR-BONUS': COMPONENTS.REWARD_ALLOWANCE,
  'AR-ALLOWANCE': COMPONENTS.REWARD_ALLOWANCE,
  'AR-BONUS-ALLOWANCE': COMPONENTS.REWARD_ALLOWANCE,
  'AR-RETURN': COMPONENTS.RETURN,
  'AR-EXTERNAL': COMPONENTS.EXTERNAL_DEBT,
  'AR-EXTERNAL-DEBT': COMPONENTS.EXTERNAL_DEBT,
  'AR-ADJUSTMENT': COMPONENTS.MANUAL_ADJUSTMENT,
  'AR-DEBT-ADJUSTMENT': COMPONENTS.MANUAL_ADJUSTMENT,
  'AR-DEBT-VOID': COMPONENTS.MANUAL_ADJUSTMENT
});

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function nested(source = {}, path = '') {
  return String(path).split('.').reduce((current, key) => current?.[key], source);
}

function firstText(source = {}, fields = []) {
  for (const field of fields) {
    const value = text(nested(source, field));
    if (value) return value;
  }
  return '';
}

function financialComponentForLedger(ledger = {}) {
  const explicit = upper(firstText(ledger, [
    'financialComponent',
    'component',
    'componentType',
    'metadata.financialComponent',
    'metadata.component',
    'metadata.componentType'
  ]));
  if (Object.prototype.hasOwnProperty.call(COMPONENTS, explicit)) return COMPONENTS[explicit];

  const category = upper(ledger.category || ledger.ledgerType);
  if (category === 'AR-DEBT-ADJUSTMENT' && firstText(ledger, [
    'returnId',
    'returnOrderId',
    'sourceReturnOrderId',
    'metadata.returnId',
    'metadata.returnOrderId',
    'metadata.sourceReturnOrderId'
  ])) return COMPONENTS.RETURN;
  if (category.endsWith('-REVERSAL')) {
    return upper(firstText(ledger, [
      'originalFinancialComponent',
      'metadata.originalFinancialComponent',
      'metadata.reversedFinancialComponent'
    ])) || COMPONENTS.REVERSAL;
  }
  return CATEGORY_COMPONENT[category] || COMPONENTS.UNKNOWN;
}

function componentSourceIdentity(ledger = {}) {
  const component = financialComponentForLedger(ledger);
  const explicit = firstText(ledger, [
    'componentId',
    'componentCode',
    'componentKey',
    'financialComponentId',
    'financialComponentCode',
    'metadata.componentId',
    'metadata.componentCode',
    'metadata.componentKey',
    'metadata.financialComponentId',
    'metadata.financialComponentCode',
    'metadata.financialComponentKey'
  ]);
  return explicit || component;
}

module.exports = {
  COMPONENTS,
  CATEGORY_COMPONENT,
  financialComponentForLedger,
  componentSourceIdentity
};
