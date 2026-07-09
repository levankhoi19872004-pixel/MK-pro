'use strict';

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function isCloseoutCorrectionKey(value) {
  return /^(DCO|DTC|DCOV|DCOA|DCOC)[-_]/i.test(text(value));
}

function extractSalesOrderIdFromCloseoutCorrectionKey(value = '') {
  const raw = text(value);
  if (!isCloseoutCorrectionKey(raw)) return '';
  const match = raw.match(/(?:^|[-_:])(SO\d{8,})(?=$|[-_:])/i);
  return match ? upper(match[1]) : '';
}

function firstText(values = [], predicate = null) {
  for (const value of values || []) {
    const candidate = text(value);
    if (!candidate) continue;
    if (predicate && !predicate(candidate)) continue;
    return candidate;
  }
  return '';
}

function firstNonCorrection(values = []) {
  return firstText(values, (value) => !isCloseoutCorrectionKey(value));
}

function firstCorrection(values = []) {
  return firstText(values, isCloseoutCorrectionKey);
}

function canonicalDebtOrderIdentity(row = {}) {
  const correctionSourceCode = firstCorrection([
    row.correctionSourceCode,
    row.correctionCode,
    row.sourceCode,
    row.refCode,
    row.sourceId,
    row.refId,
    row.id,
    row.code
  ]);
  const correctionSourceId = firstCorrection([
    row.correctionSourceId,
    row.correctionId,
    row.sourceId,
    row.refId,
    row.sourceCode,
    row.refCode,
    row.id,
    row.code
  ]);
  const parsedSalesOrderId = extractSalesOrderIdFromCloseoutCorrectionKey(correctionSourceCode || correctionSourceId);

  const salesOrderId = firstNonCorrection([
    row.salesOrderId,
    row.orderId,
    row.sourceOrderId,
    row.refId,
    row.canonicalOrderId,
    row.canonicalOrderKey,
    row.orderKey,
    row.sourceId
  ]) || parsedSalesOrderId;

  const salesOrderCode = firstNonCorrection([
    row.salesOrderCode,
    row.orderCode,
    row.sourceOrderCode,
    row.refCode,
    row.canonicalOrderCode,
    row.orderKey,
    row.sourceCode
  ]) || parsedSalesOrderId || salesOrderId;

  const canonicalOrderId = salesOrderId || parsedSalesOrderId || firstNonCorrection([row.orderId, row.salesOrderId, row.sourceId, row.refId]);
  const canonicalOrderCode = salesOrderCode || canonicalOrderId;
  const canonicalOrderKey = canonicalOrderId || canonicalOrderCode;
  const hasCorrectionSource = Boolean(correctionSourceCode || correctionSourceId);
  const hasCanonicalSalesOrder = Boolean(canonicalOrderKey && !isCloseoutCorrectionKey(canonicalOrderKey));

  return {
    salesOrderId: canonicalOrderId,
    orderId: canonicalOrderId,
    canonicalOrderId,
    salesOrderCode: canonicalOrderCode,
    orderCode: canonicalOrderCode,
    canonicalOrderCode,
    canonicalOrderKey,
    correctionSourceId,
    correctionSourceCode,
    hasCorrectionSource,
    hasCanonicalSalesOrder,
    warning: hasCorrectionSource && !hasCanonicalSalesOrder ? 'CLOSEOUT_CORRECTION_WITHOUT_CANONICAL_ORDER' : ''
  };
}

function debtOrderAliasKeys(row = {}) {
  const identity = canonicalDebtOrderIdentity(row);
  return unique([
    identity.canonicalOrderKey,
    identity.canonicalOrderId,
    identity.canonicalOrderCode,
    identity.salesOrderId,
    identity.salesOrderCode,
    row.salesOrderCode,
    row.orderCode,
    row.sourceOrderCode,
    row.refCode,
    row.orderId,
    row.salesOrderId,
    row.sourceOrderId,
    row.refId,
    row.sourceCode,
    row.sourceId,
    row.returnOrderCode,
    row.returnOrderId,
    row.idempotencyKey,
    row.code,
    row.id,
    row.orderKey,
    identity.correctionSourceCode,
    identity.correctionSourceId,
    extractSalesOrderIdFromCloseoutCorrectionKey(identity.correctionSourceCode || identity.correctionSourceId)
  ]);
}

module.exports = {
  text,
  upper,
  isCloseoutCorrectionKey,
  extractSalesOrderIdFromCloseoutCorrectionKey,
  canonicalDebtOrderIdentity,
  debtOrderAliasKeys
};
