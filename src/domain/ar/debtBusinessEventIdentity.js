'use strict';

const { SEMANTIC_ROLES, semanticRoleForLedger } = require('./debtLedgerSemanticRegistry');

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function firstText(source = {}, fields = []) {
  for (const field of fields) {
    const value = text(String(field).split('.').reduce((current, key) => current?.[key], source));
    if (value) return value;
  }
  return '';
}

function normalizePart(value = '') {
  return upper(value).replace(/\s+/g, '_');
}

function orderIdentity(ledger = {}) {
  return firstText(ledger, [
    'canonicalOrderId',
    'salesOrderId',
    'orderId',
    'sourceOrderId',
    'metadata.salesOrderId',
    'metadata.orderId',
    'canonicalOrderCode',
    'salesOrderCode',
    'orderCode',
    'sourceOrderCode',
    'metadata.salesOrderCode',
    'metadata.orderCode'
  ]);
}

function paymentIdentity(ledger = {}) {
  return firstText(ledger, [
    'receiptId',
    'debtCollectionId',
    'allocationId',
    'paymentAllocationId',
    'orderPaymentAllocationId',
    'metadata.receiptId',
    'metadata.debtCollectionId',
    'metadata.allocationId',
    'metadata.paymentAllocationId',
    'refId',
    'sourceId',
    'idempotencyKey'
  ]);
}

function returnIdentity(ledger = {}) {
  return firstText(ledger, [
    'returnId',
    'returnOrderId',
    'sourceReturnOrderId',
    'metadata.returnId',
    'metadata.returnOrderId',
    'metadata.sourceReturnOrderId',
    'refId',
    'sourceId'
  ]);
}

function correctionIdentity(ledger = {}) {
  return firstText(ledger, [
    'correctionId',
    'correctionSourceId',
    'metadata.correctionId',
    'metadata.correctionSourceId',
    'sourceId',
    'refId',
    'idempotencyKey'
  ]);
}

function originalLedgerIdentity(ledger = {}) {
  return firstText(ledger, [
    'originalLedgerId',
    'reversedLedgerId',
    'reversalOf',
    'metadata.originalLedgerId',
    'metadata.reversedLedgerId',
    'refId'
  ]);
}

function sourceVersion(ledger = {}) {
  return firstText(ledger, [
    'sourceVersion',
    'deliveryCloseoutVersion',
    'correctionVersion',
    'metadata.sourceVersion',
    'metadata.deliveryCloseoutVersion',
    'metadata.correctionVersion'
  ]);
}

function buildDebtBusinessEventIdentity(input = {}) {
  const semanticRole = input.semanticRole || semanticRoleForLedger(input);
  const order = orderIdentity(input);
  const version = sourceVersion(input);
  let source = '';
  let sourceKind = '';

  if (semanticRole === SEMANTIC_ROLES.OPENING_OBLIGATION) {
    source = order;
    sourceKind = 'order';
  } else if (semanticRole === SEMANTIC_ROLES.PAYMENT_REDUCTION) {
    source = paymentIdentity(input);
    sourceKind = 'payment';
  } else if (semanticRole === SEMANTIC_ROLES.RETURN_REDUCTION) {
    source = returnIdentity(input);
    sourceKind = 'return';
  } else if (semanticRole === SEMANTIC_ROLES.CORRECTION_DELTA || semanticRole === SEMANTIC_ROLES.MANUAL_ADJUSTMENT || semanticRole === SEMANTIC_ROLES.VOID) {
    source = returnIdentity(input) || correctionIdentity(input);
    sourceKind = returnIdentity(input) ? 'return' : 'correction';
  } else if (semanticRole === SEMANTIC_ROLES.REVERSAL) {
    source = originalLedgerIdentity(input);
    sourceKind = 'originalLedger';
  } else {
    source = firstText(input, ['sourceId', 'refId', 'idempotencyKey']);
    sourceKind = 'source';
  }

  if (!semanticRole || !source) {
    return {
      ok: false,
      code: 'MISSING_BUSINESS_EVENT_IDENTITY',
      semanticRole: semanticRole || SEMANTIC_ROLES.UNSUPPORTED,
      businessEventIdentity: '',
      sourceKind,
      evidenceFields: { order, source, version }
    };
  }

  const identityRole = semanticRole === SEMANTIC_ROLES.CORRECTION_DELTA && sourceKind === 'return'
    ? SEMANTIC_ROLES.RETURN_REDUCTION
    : semanticRole;
  const parts = [identityRole, sourceKind, source];
  if (semanticRole !== SEMANTIC_ROLES.OPENING_OBLIGATION && order) parts.push(`order:${order}`);
  if (version) parts.push(`v:${version}`);

  return {
    ok: true,
    code: 'OK',
    semanticRole,
    businessEventIdentity: parts.map(normalizePart).join('|'),
    sourceKind,
    evidenceFields: { order, source, version }
  };
}

module.exports = {
  firstText,
  orderIdentity,
  paymentIdentity,
  returnIdentity,
  correctionIdentity,
  originalLedgerIdentity,
  sourceVersion,
  buildDebtBusinessEventIdentity
};
