'use strict';

const { buildDebtBusinessEventIdentity } = require('../../domain/ar/debtBusinessEventIdentity');
const { semanticRoleForLedger, SEMANTIC_ROLES } = require('../../domain/ar/debtLedgerSemanticRegistry');
const { canProjectDetailedAccountingCategoryBySource } = require('../../domain/ar/arDebtCategoryRegistry');
const TimelineService = require('./HistoricalCorrectionTimelineService');

const CATEGORY = 'AR-ADJUSTMENT';
const SOURCE_TYPE = 'DELIVERY_CLOSEOUT_CORRECTION';

function text(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return text(value).toUpperCase(); }
function money(value) { return TimelineService.money(value); }
function active(row = {}) {
  const status = text(row.status || row.accountingStatus).toLowerCase();
  return row.active !== false && row.reversed !== true && !['void', 'voided', 'deleted', 'cancelled', 'canceled', 'reversed'].includes(status);
}
function signedEffect(row = {}) { return money(row.debit) - money(row.credit); }
function stableLedgerIdentity(row = {}) { return text(row._id || row.id || row.code || row.idempotencyKey); }
function uniqueByIdentity(rows = []) {
  const seen = new Set(); const out = [];
  for (const row of rows || []) {
    const key = stableLedgerIdentity(row) || TimelineService.sha256(row);
    if (seen.has(key)) continue;
    seen.add(key); out.push(row);
  }
  return out;
}
function exactCorrectionAliases(transition = {}) {
  return new Set([transition.correctionId, transition.correctionCode].map(upper).filter(Boolean));
}
function exactOrderAliases(transition = {}) {
  return new Set([transition.orderId, transition.orderCode].map(upper).filter(Boolean));
}
function canonicalCorrectionMatch(row = {}, transition = {}) {
  if (!active(row)) return false;
  if (upper(row.account || 'AR') !== 'AR') return false;
  if (upper(row.category || row.ledgerType) !== CATEGORY) return false;
  if (upper(row.sourceType || row.refType) !== SOURCE_TYPE) return false;
  if (semanticRoleForLedger(row) !== SEMANTIC_ROLES.CORRECTION_DELTA) return false;
  if (!canProjectDetailedAccountingCategoryBySource(row)) return false;
  const correctionAliases = exactCorrectionAliases(transition);
  const rowCorrectionAliases = [row.correctionId, row.correctionCode, row.refId, row.refCode, row.metadata?.correctionId, row.metadata?.correctionCode]
    .map(upper).filter(Boolean);
  if (!rowCorrectionAliases.some((v) => correctionAliases.has(v))) return false;
  const orderAliases = exactOrderAliases(transition);
  const rowOrderAliases = [row.orderId, row.orderCode, row.salesOrderId, row.salesOrderCode, row.sourceId, row.sourceCode]
    .map(upper).filter(Boolean);
  if (!rowOrderAliases.some((v) => orderAliases.has(v))) return false;
  const identity = buildDebtBusinessEventIdentity(row);
  return identity.ok && identity.sourceKind === 'correction';
}

function detectMissingCanonicalEvent(transition = {}, arLedgers = []) {
  if (transition.classification === 'AMBIGUOUS_TIMELINE') return { classification: 'AMBIGUOUS_TIMELINE', safeToApply: false, matches: [] };
  if (transition.classification === 'AMBIGUOUS_LINEAGE') return { classification: 'AMBIGUOUS_LINEAGE', safeToApply: false, matches: [] };
  if (transition.classification === 'DATA_CONFLICT') return { classification: 'DATA_CONFLICT', safeToApply: false, matches: [] };
  if (transition.classification === 'RETURN_OWNED_EXTERNALLY') return { classification: 'RETURN_OWNED_EXTERNALLY', safeToApply: false, matches: [] };
  if (transition.classification === 'NO_EFFECT' || money(transition.correctionOwnedDebtDelta) === 0) return { classification: 'NO_EFFECT', safeToApply: false, matches: [] };

  const all = uniqueByIdentity(arLedgers || []);
  const byIdempotency = all.filter((row) => active(row) && text(row.idempotencyKey) === text(transition.eventIdentity));
  const exact = uniqueByIdentity([...byIdempotency, ...all.filter((row) => canonicalCorrectionMatch(row, transition))]);
  const expected = money(transition.correctionOwnedDebtDelta);

  if (exact.length === 0) {
    return { classification: 'MISSING_EVENT_SAFE_TO_PLAN', safeToApply: true, expectedEffect: expected, matches: [], eventIdentity: transition.eventIdentity };
  }
  if (exact.length > 1) {
    return {
      classification: 'DUPLICATE_EXISTING_EVENT', safeToApply: false, expectedEffect: expected,
      actualEffects: exact.map(signedEffect), matches: exact, eventIdentity: transition.eventIdentity
    };
  }
  const actual = signedEffect(exact[0]);
  if (actual !== expected) {
    return {
      classification: 'EVENT_AMOUNT_MISMATCH', safeToApply: false, expectedEffect: expected,
      actualEffect: actual, matches: exact, eventIdentity: transition.eventIdentity
    };
  }
  return {
    classification: 'ALREADY_POSTED', safeToApply: false, expectedEffect: expected,
    actualEffect: actual, matches: exact, eventIdentity: transition.eventIdentity
  };
}

module.exports = {
  CATEGORY,
  SOURCE_TYPE,
  signedEffect,
  stableLedgerIdentity,
  canonicalCorrectionMatch,
  detectMissingCanonicalEvent,
  _internal: { active, uniqueByIdentity, exactCorrectionAliases, exactOrderAliases }
};
