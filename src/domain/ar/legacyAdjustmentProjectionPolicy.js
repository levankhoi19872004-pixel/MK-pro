'use strict';

const LEGACY_ADJUSTMENT_CATEGORY = 'AR-DEBT-ADJUSTMENT';
const BACKFILL_POLICY = 'PHASE260F_CANONICAL_SOURCE_V1';

const EXPLICIT_EXCLUSION_CLASSIFICATIONS = Object.freeze([
  'DUPLICATE_OPENING_ADJUSTMENT',
  'FINAL_STATE_RECONSTRUCTION',
  'CANONICAL_SOURCE_ALREADY_EXISTS',
  'ALREADY_BACKFILLED'
]);

function text(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function ledgerId(row = {}) {
  return text(row.ledgerId || row.id || row.code || row._id || row.idempotencyKey);
}

function metadata(row = {}) {
  return row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
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

function isLegacyAdjustment(row = {}) {
  return upper(row.category || row.ledgerType) === LEGACY_ADJUSTMENT_CATEGORY;
}

function signedEffect(row = {}) {
  return money(row.debit) - money(row.credit);
}

function explicitClassification(row = {}) {
  const meta = metadata(row);
  return upper(
    row.projectionClassification
    || row.classification
    || row.auditClassification
    || meta.projectionClassification
    || meta.classification
    || meta.auditClassification
    || meta.phase260fClassification
    || meta.phase260f?.classification
  );
}

function explicitReplacedByLedgerId(row = {}) {
  const meta = metadata(row);
  return firstText({ ...row, metadata: meta }, [
    'replacedByLedgerId',
    'canonicalReplacementLedgerId',
    'metadata.replacedByLedgerId',
    'metadata.canonicalReplacementLedgerId',
    'metadata.phase260f.replacedByLedgerId',
    'metadata.phase260f.canonicalReplacementLedgerId'
  ]);
}

function replacementSourceAdjustmentId(row = {}) {
  const meta = metadata(row);
  return firstText({ ...row, metadata: meta }, [
    'replacesLegacyAdjustmentLedgerId',
    'metadata.replacesLegacyAdjustmentLedgerId',
    'metadata.phase260f.replacesLegacyAdjustmentLedgerId'
  ]);
}

function hasVerifiedReplacementMetadata(row = {}) {
  const meta = metadata(row);
  return text(meta.backfillPolicy || meta.phase260f?.backfillPolicy) === BACKFILL_POLICY
    && (row.generatedFromConfirmedSource === true
      || meta.generatedFromConfirmedSource === true
      || meta.phase260f?.generatedFromConfirmedSource === true);
}

function replacementAmountMatches(adjustment = {}, replacement = {}) {
  const adjustmentEffect = signedEffect(adjustment);
  const replacementEffect = signedEffect(replacement);
  return adjustmentEffect !== 0 && adjustmentEffect === replacementEffect;
}

function buildReplacementIndex(rows = []) {
  const byAdjustment = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isLegacyAdjustment(row)) continue;
    if (!hasVerifiedReplacementMetadata(row)) continue;
    const adjustmentId = replacementSourceAdjustmentId(row);
    if (!adjustmentId) continue;
    byAdjustment.set(adjustmentId, row);
  }
  return byAdjustment;
}

function hasImmutableSourceEvidence(row = {}) {
  const meta = metadata(row);
  const explicitSource = firstText({ ...row, metadata: meta }, [
    'receiptId',
    'debtCollectionId',
    'allocationId',
    'orderPaymentAllocationId',
    'paymentAllocationId',
    'returnId',
    'returnOrderId',
    'correctionId',
    'correctionSourceId',
    'metadata.receiptId',
    'metadata.debtCollectionId',
    'metadata.allocationId',
    'metadata.returnId',
    'metadata.returnOrderId',
    'metadata.correctionId'
  ]);
  if (explicitSource) return true;
  const source = firstText({ ...row, metadata: meta }, [
    'sourceId',
    'refId',
    'metadata.sourceId'
  ]);
  if (!source) return false;
  const orderOnly = new Set([
    row.orderId,
    row.salesOrderId,
    row.canonicalOrderId,
    row.orderCode,
    row.salesOrderCode,
    row.canonicalOrderCode,
    meta.orderId,
    meta.salesOrderId,
    meta.orderCode,
    meta.salesOrderCode
  ].map(upper).filter(Boolean));
  return !orderOnly.has(upper(source));
}

function legacySourceEvidenceFields(row = {}) {
  const meta = metadata(row);
  return [
    'receiptId',
    'debtCollectionId',
    'allocationId',
    'orderPaymentAllocationId',
    'paymentAllocationId',
    'returnId',
    'returnOrderId',
    'correctionId',
    'correctionSourceId',
    'sourceId',
    'refId',
    'metadata.receiptId',
    'metadata.debtCollectionId',
    'metadata.allocationId',
    'metadata.returnId',
    'metadata.returnOrderId',
    'metadata.correctionId',
    'metadata.sourceId'
  ].filter((field) => {
    const value = text(nested({ ...row, metadata: meta }, field));
    if (!value) return false;
    if (!['sourceId', 'refId', 'metadata.sourceId'].includes(field)) return true;
    return hasImmutableSourceEvidence(row);
  });
}

function policyFields(decision = {}) {
  return {
    projectionIncluded: decision.projectionIncluded !== false,
    projectionStatus: decision.projectionStatus || (decision.projectionIncluded === false ? 'EXCLUDED' : 'INCLUDED'),
    exclusionReason: decision.exclusionReason || '',
    replacedByLedgerId: decision.replacedByLedgerId || '',
    legacyFallback: decision.legacyFallback === true,
    warningCode: decision.warningCode || '',
    adjustmentProjectionPolicy: 'PHASE260F_EVIDENCE_GATED'
  };
}

function classifyLegacyAdjustmentProjection(row = {}, context = {}) {
  if (!isLegacyAdjustment(row)) return policyFields({ projectionIncluded: true });

  const replacementIndex = context.replacementIndex || buildReplacementIndex(context.rows || []);
  const id = ledgerId(row);
  const explicitReplacementId = explicitReplacedByLedgerId(row);
  const replacement = replacementIndex.get(id) || (explicitReplacementId && (context.rowById || new Map()).get(explicitReplacementId));
  if (replacement && replacementAmountMatches(row, replacement)) {
    return policyFields({
      projectionIncluded: false,
      projectionStatus: 'REPLACED',
      exclusionReason: 'CANONICAL_REPLACEMENT_VERIFIED',
      replacedByLedgerId: ledgerId(replacement) || explicitReplacementId
    });
  }

  const shadow = context.shadowById?.get(id);
  if (shadow && ['DEDICATED_RETURN_SHADOWS_CORRECTION_RETURN_EFFECT', 'CANONICAL_DEBT_PAYMENT_SHADOWS_LEGACY_AR_RECEIPT'].includes(shadow.ownershipReasonCode)) {
    return policyFields({
      projectionIncluded: false,
      projectionStatus: 'REPLACED',
      exclusionReason: 'CANONICAL_SOURCE_ALREADY_EXISTS',
      replacedByLedgerId: shadow.replacedByLedgerId || ''
    });
  }

  const classification = explicitClassification(row);
  if (EXPLICIT_EXCLUSION_CLASSIFICATIONS.includes(classification)) {
    return policyFields({
      projectionIncluded: false,
      projectionStatus: 'EXCLUDED',
      exclusionReason: classification,
      replacedByLedgerId: explicitReplacementId
    });
  }

  if (hasImmutableSourceEvidence(row)) {
    return policyFields({
      projectionIncluded: true,
      projectionStatus: 'LEGACY_FALLBACK',
      legacyFallback: true,
      warningCode: 'LEGACY_ADJUSTMENT_INCLUDED_UNTIL_CANONICAL_BACKFILL'
    });
  }

  return policyFields({
    projectionIncluded: true,
    projectionStatus: 'UNRESOLVED',
    legacyFallback: true,
    warningCode: 'LEGACY_ADJUSTMENT_SOURCE_UNRESOLVED'
  });
}

function buildContext(rows = [], ownership = {}) {
  const rowById = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = ledgerId(row);
    if (id) rowById.set(id, row);
  }
  const shadowById = new Map();
  for (const row of ownership.shadowedEntries || []) {
    const id = ledgerId(row);
    if (!id) continue;
    const selected = (ownership.selectedEntries || []).find((candidate) => candidate.businessEventIdentity && candidate.businessEventIdentity === row.businessEventIdentity);
    shadowById.set(id, {
      ownershipReasonCode: row.ownershipReasonCode || '',
      replacedByLedgerId: selected ? ledgerId(selected) : ''
    });
  }
  return {
    rows,
    rowById,
    shadowById,
    replacementIndex: buildReplacementIndex(rows)
  };
}

function annotateLegacyAdjustmentProjection(rows = [], ownership = {}) {
  const context = buildContext(rows, ownership);
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    ...classifyLegacyAdjustmentProjection(row, context)
  }));
}

function selectLegacyAdjustmentProjectedRows(rows = [], ownership = {}) {
  return annotateLegacyAdjustmentProjection(rows, ownership).filter((row) => !isLegacyAdjustment(row) || row.projectionIncluded !== false);
}

module.exports = {
  LEGACY_ADJUSTMENT_CATEGORY,
  BACKFILL_POLICY,
  isLegacyAdjustment,
  ledgerId,
  signedEffect,
  classifyLegacyAdjustmentProjection,
  annotateLegacyAdjustmentProjection,
  selectLegacyAdjustmentProjectedRows,
  _private: {
    buildReplacementIndex,
    hasImmutableSourceEvidence,
    explicitClassification,
    replacementAmountMatches
  }
};
