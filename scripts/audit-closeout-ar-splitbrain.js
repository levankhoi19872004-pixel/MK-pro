#!/usr/bin/env node
'use strict';

/**
 * R1.1 historical closeout/AR audit.
 *
 * Contract:
 * - READ-ONLY / DRY-RUN only; no apply/repair path exists.
 * - Exact canonical business-event + order identity only; never substring-match.
 * - Canonical AR eligibility is delegated to the same AR read-model policy used
 *   by Debt New.
 * - Delivery snapshot is resolved through DeliveryPaymentStateReadService.
 * - A snapshot/current-AR difference is not automatically split-brain: known
 *   confirmed accounting events (currently canonical DebtCollection receipts)
 *   are replayed as timeline effects before classification.
 */

const fs = require('node:fs');
const path = require('node:path');
const { normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../src/constants/finance.constants');
const {
  AR_CATEGORIES,
  isDebtCollectionReceiptLedger,
  canProjectDetailedAccountingCategoryBySource
} = require('../src/domain/ar/arDebtCategoryRegistry');
const { buildDebtBusinessEventIdentity, returnIdentity } = require('../src/domain/ar/debtBusinessEventIdentity');
const { resolveCanonicalArOrderIdentity } = require('../src/domain/ar/arOrderIdentity');
const { semanticRoleForLedger, SEMANTIC_ROLES } = require('../src/domain/ar/debtLedgerSemanticRegistry');
const arLedgerReadService = require('../src/services/arLedgerRead.service');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');
const ReturnStateMachine = require('../src/domain/lifecycle/ReturnStateMachine');
const returnArPostingService = require('../src/services/accounting/returnArPostingService');
const DeliveryMoneyContract = require('../src/services/delivery/financial/deliveryMoneyContract');

const CANONICAL_EVENT_CATEGORY = AR_CATEGORIES.ADJUSTMENT;
const LEGACY_RETIRED_CATEGORY = AR_CATEGORIES.DEBT_ADJUSTMENT;
const SOURCE_TYPE = 'DELIVERY_CLOSEOUT_CORRECTION';
const INACTIVE = new Set(['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'superseded']);
const DEFAULT_LIMIT = 20000;
const DEFAULT_BATCH_SIZE = 250;

function text(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return text(value).toUpperCase(); }
function money(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : 0; }
function statusActive(row = {}) { return row.active !== false && row.reversed !== true && !INACTIVE.has(text(row.status).toLowerCase()); }
function correctionId(row = {}) { return text(row.correctionId || row.id || row._id || row.code || row.correctionCode); }
function correctionCode(row = {}) { return text(row.correctionCode || row.code || row.id || row.correctionId); }
function orderId(row = {}) { return text(row.salesOrderId || row.orderId || row.sourceOrderId); }
function orderCode(row = {}) { return text(row.salesOrderCode || row.orderCode || row.sourceOrderCode); }
function unique(values = []) { return Array.from(new Set(values.map(text).filter(Boolean))); }

function financialDeltas(correction = {}) {
  const meta = correction.metadata && typeof correction.metadata === 'object' ? correction.metadata : {};
  return {
    receivableDelta: money(correction.receivableDeltaAmount ?? correction.receivableDelta ?? meta.receivableDelta ?? 0),
    cashDelta: money(correction.cashDeltaAmount ?? correction.cashDelta ?? meta.cashDelta ?? 0),
    bankDelta: money(correction.bankDeltaAmount ?? correction.bankDelta ?? meta.bankDelta ?? 0),
    rewardDelta: money(correction.rewardDeltaAmount ?? correction.rewardDelta ?? meta.rewardDelta ?? 0),
    returnDelta: money(correction.returnAdjustmentAmount ?? correction.returnDeltaAmount ?? correction.returnDelta ?? meta.returnDelta ?? 0)
  };
}

function correctionOwnedEventDelta(correction = {}) {
  const d = financialDeltas(correction);
  return money(d.receivableDelta - d.cashDelta - d.bankDelta - d.rewardDelta);
}

function signedLedgerEffect(row = {}) {
  return money(money(row.debit) - money(row.credit));
}

function correctionAsBusinessEvent(correction = {}) {
  return {
    category: CANONICAL_EVENT_CATEGORY,
    ledgerType: CANONICAL_EVENT_CATEGORY,
    sourceType: SOURCE_TYPE,
    refType: SOURCE_TYPE,
    correctionId: correctionId(correction),
    correctionCode: correctionCode(correction),
    refId: correctionId(correction),
    refCode: correctionCode(correction),
    orderId: orderId(correction),
    orderCode: orderCode(correction),
    salesOrderId: orderId(correction),
    salesOrderCode: orderCode(correction),
    sourceVersion: correction.newCloseoutVersion ?? correction.sourceVersion ?? correction.version,
    metadata: {
      correctionId: correctionId(correction),
      correctionCode: correctionCode(correction),
      correctionVersion: correction.newCloseoutVersion ?? correction.sourceVersion ?? correction.version
    }
  };
}

/** Canonical R1 key format: CATEGORY:SOURCE_TYPE:ORDER:CORRECTION:vN. */
function parseCanonicalCorrectionKey(value = '') {
  const parts = text(value).split(':');
  if (parts.length !== 5) return null;
  if (upper(parts[0]) !== CANONICAL_EVENT_CATEGORY || upper(parts[1]) !== SOURCE_TYPE) return null;
  if (!parts[2] || !parts[3] || !/^v\d+$/i.test(parts[4])) return null;
  return { orderToken: parts[2], correctionToken: parts[3], versionToken: parts[4] };
}

function ledgerWithStructuredCorrectionIdentity(row = {}, correction = {}) {
  const direct = text(row.correctionId || row.correctionCode || row.refId || row.refCode || row.metadata?.correctionId || row.metadata?.correctionCode);
  const parsed = parseCanonicalCorrectionKey(row.idempotencyKey);
  if (!parsed) return row;

  // R1 runtime ledgers persist correction refs directly but keep the canonical
  // correction version in the structured idempotency key / closeout metadata.
  // Recover only missing identity fields; exact direct refs remain authoritative.
  return {
    ...row,
    correctionId: text(row.correctionId || row.metadata?.correctionId || direct || parsed.correctionToken),
    correctionCode: text(row.correctionCode || row.metadata?.correctionCode || direct || parsed.correctionToken),
    refId: text(row.refId || direct || parsed.correctionToken),
    refCode: text(row.refCode || direct || parsed.correctionToken),
    sourceVersion: row.sourceVersion
      || row.correctionVersion
      || row.metadata?.correctionVersion
      || row.metadata?.closeoutVersion
      || ((correction.newCloseoutVersion ?? correction.sourceVersion ?? correction.version) != null
        ? Number(parsed.versionToken.slice(1))
        : undefined)
  };
}

function canonicalCorrectionBusinessIdentity(value = {}) {
  const result = buildDebtBusinessEventIdentity(value);
  return result && result.ok ? text(result.businessEventIdentity) : '';
}

function correctionIdentityMatches(row = {}, correction = {}) {
  const normalizedRow = ledgerWithStructuredCorrectionIdentity(row, correction);
  const expected = canonicalCorrectionBusinessIdentity(correctionAsBusinessEvent(correction));
  const actual = canonicalCorrectionBusinessIdentity(normalizedRow);
  return Boolean(expected && actual && expected === actual);
}


function stableLedgerIdentity(row = {}) {
  const persisted = text(row._id || row.id || row.ledgerId || row.code);
  if (persisted) return `persisted:${persisted}`;
  const idempotency = text(row.idempotencyKey);
  if (idempotency) return `idempotency:${idempotency}`;
  const eventIdentity = canonicalCorrectionBusinessIdentity(row);
  if (eventIdentity) return `event:${eventIdentity}`;
  return '';
}

function dedupeLedgerRows(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = stableLedgerIdentity(row);
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    out.push(row);
  }
  return out;
}


function returnOrderIdentityValue(row = {}) {
  return text(row.returnOrderId || row.id || row._id || row.returnOrderCode || row.code || row.sourceId || row.sourceCode);
}

function returnOrderAliases(row = {}) {
  const values = unique([
    row.returnOrderId, row.returnOrderCode, row.id, row._id, row.code,
    row.sourceReturnOrderId, row.sourceReturnOrderCode, row.sourceId, row.sourceCode
  ]);
  try {
    const key = returnArPostingService._internal.buildIdempotencyKey(row);
    if (key) values.push(key);
  } catch (_) {}
  return new Set(unique(values).map(upper));
}

function arReturnAliases(row = {}) {
  const values = unique([
    returnIdentity(row), row.returnOrderId, row.returnOrderCode,
    row.refId, row.refCode, row.sourceId, row.sourceCode, row.idempotencyKey
  ]);
  return new Set(values.map(upper));
}

function exactSetOverlap(left = new Set(), right = new Set()) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function isEffectiveArReturn(row = {}) {
  return statusActive(row)
    && upper(row.account || 'AR') === 'AR'
    && upper(row.category || row.ledgerType) === AR_CATEGORIES.RETURN
    && semanticRoleForLedger(row) === SEMANTIC_ROLES.RETURN_REDUCTION;
}

function snapshotReturnIds(snapshot = {}) {
  return new Set(unique([
    ...(snapshot.returnState?.returnOrderIds || []),
    ...(snapshot.state?.returnOrderIds || [])
  ]).map(upper));
}

function returnIncludedInSnapshot(row = {}, snapshot = {}) {
  const ids = snapshotReturnIds(snapshot);
  if (ids.size) return exactSetOverlap(returnOrderAliases(row), ids);
  const state = ReturnStateMachine.getReturnState(row);
  return state !== ReturnStateMachine.RETURN_STATES.CANCELLED
    && !['reversed', 'reverse', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed']
      .includes(text(row.status || row.returnState || row.returnStatus).toLowerCase());
}

const RETURN_AMOUNT_EVIDENCE_FIELDS = Object.freeze([
  'totalReturnAmount', 'returnAmount', 'totalAmount', 'amount', 'debtReduction',
  'returnedAmount', 'totalValue'
]);

function returnAmountSourceFields(row = {}) {
  const out = {};
  for (const field of RETURN_AMOUNT_EVIDENCE_FIELDS) {
    if (!DeliveryMoneyContract.hasOwnValue(row, field)) continue;
    const parsed = DeliveryMoneyContract.parseMoney(row[field]);
    out[field] = parsed.valid ? parsed.value : row[field];
  }
  return out;
}

function returnAmountAnalysisForAudit(row = {}) {
  const deliveryDiagnostics = [];
  const returnReader = DeliveryPaymentStateReadService._private.ReturnStateReader;
  const deliveryCanonicalReturnAmount = money(returnReader.returnOrderAmount(row, deliveryDiagnostics));
  const postingAnalysis = returnArPostingService._internal.returnOrderAmountAnalysis(row);
  const postingCanonicalReturnAmount = money(postingAnalysis.amount);
  const sourceFieldMismatch = deliveryCanonicalReturnAmount !== postingCanonicalReturnAmount;
  return {
    deliveryCanonicalReturnAmount,
    postingCanonicalReturnAmount,
    postingAmountField: text(postingAnalysis.amountField),
    sourceFieldMismatch,
    returnAmountSourceFields: returnAmountSourceFields(row),
    deliveryDiagnostics,
    postingWarnings: Array.isArray(postingAnalysis.warnings) ? postingAnalysis.warnings : [],
    postingCandidates: Array.isArray(postingAnalysis.candidates) ? postingAnalysis.candidates : []
  };
}

function returnAmountForAudit(row = {}) {
  return returnAmountAnalysisForAudit(row).postingCanonicalReturnAmount;
}

function returnArRequired(row = {}) {
  const state = ReturnStateMachine.getReturnState(row);
  return state === ReturnStateMachine.RETURN_STATES.ACCOUNTING_CONFIRMED
    || state === ReturnStateMachine.RETURN_STATES.POSTED_TO_AR;
}

function reconcileReturnLifecycle(snapshot = {}, canonicalOrderRows = []) {
  const returnRows = Array.isArray(snapshot.returnRows) ? snapshot.returnRows : [];
  const effectiveRows = dedupeLedgerRows(canonicalOrderRows).filter(isEffectiveArReturn);
  const deliveryReturnAmount = money(snapshot.state?.returnAmount ?? snapshot.returnState?.returnAmount ?? 0);
  const matchedLedgerKeys = new Set();
  const details = [];
  const blockingIssues = [];
  const informationalIssues = [];
  const evidenceRefs = [];
  let pendingReturnRestoreAmount = 0;

  for (const row of returnRows) {
    const aliases = returnOrderAliases(row);
    const state = ReturnStateMachine.getReturnState(row);
    const amountAnalysis = returnAmountAnalysisForAudit(row);
    const deliveryAmount = amountAnalysis.deliveryCanonicalReturnAmount;
    const postingAmount = amountAnalysis.postingCanonicalReturnAmount;
    const included = returnIncludedInSnapshot(row, snapshot);
    const arRequired = returnArRequired(row);
    const matches = effectiveRows.filter((ledger) => exactSetOverlap(aliases, arReturnAliases(ledger)));
    const effectiveAmount = money(matches.reduce((sum, ledger) => sum + money(ledger.credit ?? ledger.amount), 0));
    matches.forEach((ledger) => matchedLedgerKeys.add(stableLedgerIdentity(ledger) || text(ledger.id || ledger.code || ledger.idempotencyKey)));
    const rowIssues = [];

    if (included && !arRequired) pendingReturnRestoreAmount += deliveryAmount;

    if (amountAnalysis.sourceFieldMismatch) rowIssues.push('RETURN_SOURCE_AMOUNT_FIELD_MISMATCH');

    if (arRequired) {
      if (matches.length === 0) rowIssues.push('RETURN_AR_MISSING');
      if (matches.length > 1) rowIssues.push('RETURN_AR_DUPLICATE');
      if (matches.length > 0 && effectiveAmount !== deliveryAmount) rowIssues.push('RETURN_AR_AMOUNT_MISMATCH');
      if (matches.length > 0 && effectiveAmount !== postingAmount) rowIssues.push('RETURN_AR_POSTING_AMOUNT_MISMATCH');
      if (matches.length === 1
          && effectiveAmount === deliveryAmount
          && effectiveAmount === postingAmount
          && !amountAnalysis.sourceFieldMismatch) rowIssues.push('RETURN_AR_ALIGNED');
    } else if (included) {
      if (matches.length === 0) rowIssues.push('RETURN_AR_NOT_YET_REQUIRED');
      else rowIssues.push('RETURN_AR_UNEXPECTED_BEFORE_REQUIRED');
    } else {
      if (matches.length === 0) rowIssues.push('RETURN_AR_INACTIVE_ALIGNED');
      else rowIssues.push('RETURN_AR_UNEXPECTED_FOR_INACTIVE');
    }

    for (const code of rowIssues) {
      if (['RETURN_AR_ALIGNED', 'RETURN_AR_NOT_YET_REQUIRED', 'RETURN_AR_INACTIVE_ALIGNED'].includes(code)) informationalIssues.push(code);
      else blockingIssues.push(code);
    }
    const refs = matches.map((ledger) => text(ledger.id || ledger.code || ledger._id || ledger.idempotencyKey)).filter(Boolean);
    evidenceRefs.push(...refs);
    details.push({
      returnOrder: returnOrderIdentityValue(row),
      returnStatus: state,
      includedInDeliverySnapshot: included,
      arReturnExpected: arRequired,
      expectedAmount: deliveryAmount,
      deliveryCanonicalReturnAmount: deliveryAmount,
      postingCanonicalReturnAmount: postingAmount,
      sourceFieldMismatch: amountAnalysis.sourceFieldMismatch,
      returnAmountSourceFields: amountAnalysis.returnAmountSourceFields,
      postingAmountField: amountAnalysis.postingAmountField,
      postingWarnings: amountAnalysis.postingWarnings,
      arReturnPosted: matches.length > 0,
      effectiveArReturnAmount: effectiveAmount,
      effectiveArReturnCount: matches.length,
      issues: rowIssues,
      arEvidenceRefs: refs
    });
  }

  const orphanRows = returnRows.length
    ? effectiveRows.filter((ledger) => {
      const key = stableLedgerIdentity(ledger) || text(ledger.id || ledger.code || ledger.idempotencyKey);
      return !matchedLedgerKeys.has(key);
    })
    : [];
  if (orphanRows.length) blockingIssues.push('RETURN_AR_ORPHAN');
  evidenceRefs.push(...orphanRows.map((ledger) => text(ledger.id || ledger.code || ledger._id || ledger.idempotencyKey)).filter(Boolean));

  if (!returnRows.length && deliveryReturnAmount > 0) blockingIssues.push('RETURN_LIFECYCLE_EVIDENCE_MISSING');

  return {
    deliveryReturnAmount,
    effectiveArReturnAmount: money(effectiveRows.reduce((sum, row) => sum + money(row.credit ?? row.amount), 0)),
    pendingReturnRestoreAmount: money(pendingReturnRestoreAmount),
    returnLifecycleStatus: unique(details.map((row) => row.returnStatus)).join('|'),
    returnRows,
    effectiveRows,
    details,
    deliveryCanonicalReturnAmount: money(details.reduce((sum, row) => sum + money(row.deliveryCanonicalReturnAmount), 0)),
    postingCanonicalReturnAmount: money(details.reduce((sum, row) => sum + money(row.postingCanonicalReturnAmount), 0)),
    sourceFieldMismatch: details.some((row) => row.sourceFieldMismatch === true),
    returnAmountSourceFields: details.map((row) => ({ returnOrder: row.returnOrder, fields: row.returnAmountSourceFields })),
    blockingIssues: unique(blockingIssues),
    informationalIssues: unique(informationalIssues),
    returnIssues: unique([...blockingIssues, ...informationalIssues]),
    returnEvidenceRefs: unique(evidenceRefs),
    orphanArReturnCount: orphanRows.length,
    legacyReturnFallback: returnRows.length === 0 && deliveryReturnAmount === 0 && effectiveRows.length > 0
  };
}

function canonicalOrderIdentity(value = {}) {
  return resolveCanonicalArOrderIdentity({
    identity: {
      salesOrderId: value.salesOrderId,
      orderId: value.orderId,
      salesOrderCode: value.salesOrderCode,
      orderCode: value.orderCode
    },
    order: value
  });
}

function orderIdentityMatches(row = {}, correction = {}) {
  const expected = canonicalOrderIdentity(correction);
  const actual = canonicalOrderIdentity(row);
  const expectedKeys = new Set(expected.lookupKeys.map(upper).filter(Boolean));
  if (actual.lookupKeys.some((value) => expectedKeys.has(upper(value)))) return true;

  // Historical ledgers may predate dedicated orderId/orderCode fields and keep
  // the business order only in sourceId/sourceCode. Use those as an exact
  // legacy alias fallback only when they equal a canonical expected order key;
  // never substring-match and never promote arbitrary correction refs.
  const legacyExactAliases = unique([row.sourceId, row.sourceCode, row.sourceOrderId, row.sourceOrderCode]);
  return legacyExactAliases.some((value) => expectedKeys.has(upper(value)));
}

function isCanonicalCorrectionEvent(row = {}, correction = {}) {
  return statusActive(row)
    && upper(row.account || 'AR') === 'AR'
    && upper(row.category || row.ledgerType) === CANONICAL_EVENT_CATEGORY
    && upper(row.sourceType || row.refType) === SOURCE_TYPE
    && semanticRoleForLedger(row) === SEMANTIC_ROLES.CORRECTION_DELTA
    && canProjectDetailedAccountingCategoryBySource(row)
    && correctionIdentityMatches(row, correction)
    && orderIdentityMatches(row, correction);
}

function exactDirectCorrectionMatch(row = {}, correction = {}) {
  const wanted = new Set(unique([correctionId(correction), correctionCode(correction)]).map(upper));
  if (!wanted.size) return false;
  const refs = unique([
    row.correctionId, row.correctionCode, row.refId, row.refCode,
    row.metadata?.correctionId, row.metadata?.correctionCode
  ]).map(upper);
  return refs.some((value) => wanted.has(value));
}

function isLegacyCorrectionAdjustment(row = {}, correction = {}) {
  if (!statusActive(row) || upper(row.account || 'AR') !== 'AR') return false;
  if (upper(row.category || row.ledgerType) !== LEGACY_RETIRED_CATEGORY) return false;
  const provenance = upper(row.sourceType) === SOURCE_TYPE || text(row.sourceModel).toLowerCase() === 'deliverycloseoutcorrections';
  return provenance && exactDirectCorrectionMatch(row, correction) && orderIdentityMatches(row, correction);
}

function canonicalRowsFromFixture(rows = []) {
  return arLedgerReadService._internal.normalizeAndValidateActiveDebtRows(rows, { status: 'all' }).canonicalLedgers || [];
}

function rowsForCorrectionOrder(rows = [], correction = {}) {
  return rows.filter((row) => orderIdentityMatches(row, correction));
}

function resolveFixtureDeliverySnapshot(correction = {}, closeoutVersions = [], allocations = [], returnOrders = []) {
  const order = {
    id: orderId(correction), orderId: orderId(correction), salesOrderId: orderId(correction),
    code: orderCode(correction), orderCode: orderCode(correction), salesOrderCode: orderCode(correction),
    customerCode: text(correction.customerCode), customerName: text(correction.customerName),
    receivableAmount: correction.receivableAmount ?? correction.receivable,
    deliveryCloseout: correction.deliveryCloseout && typeof correction.deliveryCloseout === 'object' ? correction.deliveryCloseout : undefined,
    accountingConfirmed: true
  };
  const versionsByKey = DeliveryPaymentStateReadService._private.populateCompatibilityMap(closeoutVersions || []);
  const allocationsByKey = DeliveryPaymentStateReadService._private.populateCompatibilityMap(allocations || [], ['sourceVersion', 'version']);
  const returnResult = DeliveryPaymentStateReadService._private.ReturnStateReader.buildReturnStatesForOrders([order], returnOrders || []);
  try {
    const state = DeliveryPaymentStateReadService.resolvePaymentStateForOrder(order, versionsByKey, allocationsByKey, returnResult.statesByIdentity, {});
    return {
      ok: true,
      state,
      debtRaw: money(state?.debtRaw ?? state?.rawDebtAmount ?? state?.debtAmount ?? state?.debt ?? 0),
      returnState: DeliveryPaymentStateReadService._private.ReturnStateReader.returnStateForOrder(order, returnResult.statesByIdentity),
      returnRows: DeliveryPaymentStateReadService.returnRowsForOrder(order, returnResult),
      allocationRef: text(state?.allocation?.id || state?.allocation?.allocationCode || state?.allocation?._id),
      closeoutVersionRef: text(state?.latestVersion?.id || state?.latestVersion?.code || state?.latestVersion?._id),
      source: text(state?.paymentStateSource || state?.paymentSource || '')
    };
  } catch (error) {
    return { ok: false, error: error.code || error.message || 'SNAPSHOT_RESOLUTION_FAILED', debtRaw: 0, returnRows: [], allocationRef: '', closeoutVersionRef: '' };
  }
}

function independentSubsequentEvents(orderRows = [], correctionRows = [], options = {}) {
  const correctionKeys = new Set(correctionRows.map((row) => text(row.id || row.code || row._id || row.idempotencyKey)).filter(Boolean));
  return orderRows.filter((row) => {
    const key = text(row.id || row.code || row._id || row.idempotencyKey);
    if (correctionKeys.has(key)) return false;
    if (isDebtCollectionReceiptLedger(row)) return true;
    return options.includeLegacyReturnFallback === true && semanticRoleForLedger(row) === SEMANTIC_ROLES.RETURN_REDUCTION;
  });
}

function classifyTimeline({ correction, canonicalOrderRows, allArRows, snapshot }) {
  canonicalOrderRows = dedupeLedgerRows(canonicalOrderRows);
  allArRows = dedupeLedgerRows(allArRows);
  const expectedEventDelta = correctionOwnedEventDelta(correction);
  const canonicalCorrectionRows = allArRows.filter((row) => isCanonicalCorrectionEvent(row, correction));
  const legacyRows = allArRows.filter((row) => isLegacyCorrectionAdjustment(row, correction));
  const canonicalEventEffect = money(canonicalCorrectionRows.reduce((sum, row) => sum + signedLedgerEffect(row), 0));
  const canonicalArDebt = money(arLedgerReadService._internal.sumCanonicalBalanceRows(canonicalOrderRows));
  const deliverySnapshotDebt = snapshot.ok ? snapshot.debtRaw : 0;
  const returnReconciliation = reconcileReturnLifecycle(snapshot, canonicalOrderRows);
  const timelineBase = money(deliverySnapshotDebt + returnReconciliation.pendingReturnRestoreAmount);
  const subsequentRows = independentSubsequentEvents(canonicalOrderRows, canonicalCorrectionRows, {
    includeLegacyReturnFallback: returnReconciliation.legacyReturnFallback
  });
  const subsequentEffect = money(subsequentRows.reduce((sum, row) => sum + signedLedgerEffect(row), 0));
  const confirmedReceiptEffect = money(subsequentRows.filter(isDebtCollectionReceiptLedger).reduce((sum, row) => sum + signedLedgerEffect(row), 0));
  const expectedArFromEventTimeline = money(timelineBase + subsequentEffect);
  const deviation = money(canonicalArDebt - expectedArFromEventTimeline);
  const normalizedDeviation = normalizeDebtAmount(deviation);

  const issues = [];
  if (expectedEventDelta !== 0 && canonicalCorrectionRows.length === 0) issues.push('MISSING_CANONICAL_CORRECTION_EVENT');
  if (expectedEventDelta === 0 && canonicalCorrectionRows.length > 0 && canonicalEventEffect !== 0) issues.push('UNEXPECTED_CANONICAL_EVENT_FOR_ZERO_OWNED_DELTA');
  if (canonicalCorrectionRows.length > 1) issues.push('DUPLICATE_CANONICAL_CORRECTION_EVENTS');
  if (canonicalCorrectionRows.length > 0 && canonicalEventEffect !== expectedEventDelta) issues.push('CANONICAL_CORRECTION_EVENT_DELTA_MISMATCH');
  if (legacyRows.length > 0) issues.push('LEGACY_AR_DEBT_ADJUSTMENT_REQUIRES_REVIEW');
  issues.push(...returnReconciliation.blockingIssues);

  let classification = 'ambiguous';
  let proposedAction = issues.length ? 'REVIEW_EVENT_HISTORY_ONLY_NO_AUTO_REPAIR' : 'REVIEW_TIMELINE_NO_AUTO_REPAIR';
  const returnCorruption = returnReconciliation.blockingIssues.some((code) => [
    'RETURN_AR_DUPLICATE', 'RETURN_AR_AMOUNT_MISMATCH', 'RETURN_AR_POSTING_AMOUNT_MISMATCH',
    'RETURN_SOURCE_AMOUNT_FIELD_MISMATCH', 'RETURN_AR_UNEXPECTED_BEFORE_REQUIRED',
    'RETURN_AR_UNEXPECTED_FOR_INACTIVE', 'RETURN_AR_ORPHAN'
  ].includes(code));
  const returnMissing = returnReconciliation.blockingIssues.includes('RETURN_AR_MISSING');
  const returnEvidenceMissing = returnReconciliation.blockingIssues.includes('RETURN_LIFECYCLE_EVIDENCE_MISSING');
  const corruption = legacyRows.length > 0
    || canonicalCorrectionRows.length > 1
    || (canonicalCorrectionRows.length > 0 && canonicalEventEffect !== expectedEventDelta)
    || returnCorruption;

  if (corruption) {
    classification = 'data_corruption';
    proposedAction = 'REVIEW_DUPLICATE_OR_LEGACY_EVENT_NO_AUTO_REPAIR';
  } else if (!snapshot.ok || returnEvidenceMissing) {
    classification = 'ambiguous';
    proposedAction = !snapshot.ok ? 'RESOLVE_CANONICAL_DELIVERY_SNAPSHOT_FIRST' : 'RESOLVE_CANONICAL_RETURN_LIFECYCLE_FIRST';
  } else if (normalizedDeviation === 0) {
    classification = subsequentRows.length > 0 && money(canonicalArDebt - timelineBase) !== 0
      ? 'explained_by_subsequent_events'
      : 'no_mismatch';
    proposedAction = 'NONE';
  } else if (returnMissing) {
    classification = 'true_splitbrain';
    proposedAction = 'REVIEW_MISSING_AR_RETURN_NO_AUTO_REPAIR';
  } else if (expectedEventDelta !== 0 && canonicalCorrectionRows.length === 0 && subsequentRows.length === 0) {
    classification = 'true_splitbrain';
    proposedAction = 'REVIEW_MISSING_CORRECTION_EVENT_NO_AUTO_REPAIR';
  }

  if (issues.length > 0 && classification !== 'data_corruption' && classification !== 'true_splitbrain' && proposedAction === 'NONE') {
    proposedAction = 'REVIEW_EVENT_HISTORY_ONLY_NO_AUTO_REPAIR';
  }

  return {
    orderCode: orderCode(correction),
    customerCode: text(correction.customerCode),
    deliverySnapshotDebt,
    canonicalArDebt,
    deliveryReturnAmount: returnReconciliation.deliveryReturnAmount,
    deliveryCanonicalReturnAmount: returnReconciliation.deliveryCanonicalReturnAmount,
    postingCanonicalReturnAmount: returnReconciliation.postingCanonicalReturnAmount,
    effectiveArReturnAmount: returnReconciliation.effectiveArReturnAmount,
    sourceFieldMismatch: returnReconciliation.sourceFieldMismatch,
    returnAmountSourceFields: returnReconciliation.returnAmountSourceFields,
    returnLifecycleStatus: returnReconciliation.returnLifecycleStatus,
    confirmedReceiptEffect,
    arBeforeOrTimelineBase: timelineBase,
    subsequentAccountingEvents: subsequentRows.map((row) => ({
      ref: text(row.id || row.code || row._id || row.idempotencyKey),
      category: upper(row.category || row.ledgerType),
      sourceType: text(row.sourceType),
      effect: signedLedgerEffect(row)
    })),
    expectedArFromEventTimeline,
    deviation,
    deviationNormalized: normalizedDeviation,
    classification,
    allocationRef: snapshot.allocationRef || '',
    closeoutVersionRef: snapshot.closeoutVersionRef || '',
    arEvidenceRefs: canonicalOrderRows.map((row) => text(row.id || row.code || row._id || row.idempotencyKey)).filter(Boolean),
    returnEvidenceRefs: returnReconciliation.returnEvidenceRefs,
    proposedAction,
    correctionId: correctionId(correction),
    correctionCode: correctionCode(correction),
    expectedCorrectionEventDelta: expectedEventDelta,
    expectedEventDelta,
    returnDeltaExcluded: true,
    returnArOwner: 'returnOrders/returnArPostingService/AR-RETURN',
    issues: unique(issues).join('|'),
    returnIssues: returnReconciliation.returnIssues.join('|'),
    returnReconciliation: returnReconciliation.details,
    pendingReturnRestoreAmount: returnReconciliation.pendingReturnRestoreAmount,
    canonicalCorrectionEventCount: canonicalCorrectionRows.length,
    canonicalCorrectionEventEffect: canonicalEventEffect,
    legacyDebtAdjustmentCount: legacyRows.length,
    debtZeroTolerance: DEBT_ZERO_TOLERANCE
  };
}

function auditRows({ corrections = [], arLedgers = [], allocations = [], closeoutVersions = [], returnOrders = [] } = {}) {
  const canonicalRows = canonicalRowsFromFixture(arLedgers || []);
  const findings = (corrections || []).filter(Boolean).map((correction) => {
    const snapshot = resolveFixtureDeliverySnapshot(correction, closeoutVersions, allocations, returnOrders);
    return classifyTimeline({
      correction,
      canonicalOrderRows: rowsForCorrectionOrder(canonicalRows, correction),
      allArRows: rowsForCorrectionOrder(arLedgers || [], correction),
      snapshot
    });
  });
  return {
    readOnly: true,
    dryRun: true,
    auditPolicy: 'R1P3A_THREE_WAY_RETURN_AMOUNT_RECONCILIATION_V4',
    snapshotFinalStateComparisonUsed: false,
    exactIdentity: true,
    substringIdentityMatching: false,
    canonicalDebtPolicyReused: true,
    canonicalPaymentStateResolverReused: true,
    checkedCorrections: (corrections || []).length,
    findingCount: findings.filter((row) => text(row.issues)).length,
    findings
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const fixtureArg = argv.find((arg) => arg.startsWith('--fixture='));
  const outArg = argv.find((arg) => arg.startsWith('--out='));
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const batchArg = argv.find((arg) => arg.startsWith('--batch-size='));
  const result = {
    fixture: fixtureArg ? fixtureArg.slice('--fixture='.length) : '',
    out: outArg ? outArg.slice('--out='.length) : '',
    json: argv.includes('--json'),
    limit: Math.max(1, Math.min(DEFAULT_LIMIT, Number(limitArg?.split('=')[1] || DEFAULT_LIMIT)))
  };
  if (batchArg) result.batchSize = Math.max(1, Math.min(1000, Number(batchArg.split('=')[1] || DEFAULT_BATCH_SIZE)));
  return result;
}

function csvEscape(value) {
  const raw = Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : String(value ?? '');
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(result = {}) {
  const columns = [
    'orderCode','customerCode','deliverySnapshotDebt','canonicalArDebt','deliveryReturnAmount',
    'deliveryCanonicalReturnAmount','postingCanonicalReturnAmount','effectiveArReturnAmount','returnAmountSourceFields',
    'returnLifecycleStatus','confirmedReceiptEffect','expectedArFromEventTimeline','deviation','deviationNormalized','classification','issues',
    'returnEvidenceRefs','arEvidenceRefs','proposedAction','arBeforeOrTimelineBase','subsequentAccountingEvents',
    'allocationRef','closeoutVersionRef'
  ];
  return [columns.join(','), ...(result.findings || []).map((row) => columns.map((key) => csvEscape(row[key])).join(','))].join('\n') + '\n';
}

function buildOrderScope(correction = {}) {
  const identity = canonicalOrderIdentity(correction);
  return {
    orderKey: identity.orderId || identity.orderCode,
    customerCode: text(correction.customerCode),
    customerName: text(correction.customerName),
    aliases: identity.lookupKeys
  };
}

async function auditDatabase({ limit = DEFAULT_LIMIT, batchSize = DEFAULT_BATCH_SIZE } = {}) {
  try { require('dotenv').config(); } catch (_) {}
  const mongoose = require('mongoose');
  const connectDB = require('../src/config/db');
  const DeliveryCloseoutCorrection = require('../src/models/DeliveryCloseoutCorrection');
  const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
  const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
  const ReturnOrder = require('../src/models/ReturnOrder');
  const ArLedger = require('../src/models/ArLedger');
  await connectDB();
  try {
    const corrections = await DeliveryCloseoutCorrection.find({
      status: { $nin: ['cancelled', 'void', 'voided', 'deleted'] }
    }).sort({ _id: 1 }).limit(limit).lean();
    const output = [];
    for (let start = 0; start < corrections.length; start += batchSize) {
      const batch = corrections.slice(start, start + batchSize);
      const orders = batch.map((correction) => ({
        id: orderId(correction), orderId: orderId(correction), salesOrderId: orderId(correction),
        code: orderCode(correction), orderCode: orderCode(correction), salesOrderCode: orderCode(correction),
        customerCode: text(correction.customerCode), customerName: text(correction.customerName), accountingConfirmed: true
      }));
      const states = await DeliveryPaymentStateReadService.resolvePaymentStatesForOrders(orders, {
        models: { DeliveryCloseoutVersion, OrderPaymentAllocation, ReturnOrder },
        maxOrders: batchSize,
        includeReturnState: true
      });
      const scopes = batch.map(buildOrderScope).filter((scope) => scope.orderKey && scope.aliases.length);
      const activeRows = await arLedgerReadService.getActiveDebtReadModelLedgersForOrderScopes(scopes, {}, { scopeKeyBatchSize: batchSize });
      const correctionIds = unique(batch.flatMap((row) => [correctionId(row), correctionCode(row)]));
      const orderKeys = unique(scopes.flatMap((scope) => scope.aliases));
      const eventRows = await ArLedger.find({
        account: /^AR$/i,
        category: { $in: [CANONICAL_EVENT_CATEGORY, LEGACY_RETIRED_CATEGORY, AR_CATEGORIES.RETURN, AR_CATEGORIES.RETURN_REVERSAL] },
        $or: [
          { correctionId: { $in: correctionIds } }, { correctionCode: { $in: correctionIds } },
          { refId: { $in: correctionIds } }, { refCode: { $in: correctionIds } },
          { orderId: { $in: orderKeys } }, { orderCode: { $in: orderKeys } },
          { salesOrderId: { $in: orderKeys } }, { salesOrderCode: { $in: orderKeys } }
        ]
      }).lean();
      batch.forEach((correction, index) => {
        const state = states[index];
        const snapshot = state ? {
          ok: true,
          state,
          debtRaw: money(state.debtRaw ?? state.rawDebtAmount ?? state.debtAmount ?? state.debt ?? 0),
          allocationRef: text(state.allocation?.id || state.allocation?.allocationCode || state.allocation?._id),
          closeoutVersionRef: text(state.latestVersion?.id || state.latestVersion?.code || state.latestVersion?._id),
          returnState: DeliveryPaymentStateReadService._private.ReturnStateReader.returnStateForOrder(orders[index], states.returnStatesByIdentity),
          returnRows: DeliveryPaymentStateReadService.returnRowsForOrder(orders[index], states.returnResult)
        } : { ok: false, error: 'SNAPSHOT_NOT_RESOLVED', debtRaw: 0 };
        output.push(classifyTimeline({
          correction,
          canonicalOrderRows: rowsForCorrectionOrder(activeRows.ledgers || [], correction),
          allArRows: rowsForCorrectionOrder([...(activeRows.ledgers || []), ...(eventRows || [])], correction),
          snapshot
        }));
      });
    }
    return {
      readOnly: true, dryRun: true, auditPolicy: 'R1P3A_THREE_WAY_RETURN_AMOUNT_RECONCILIATION_V4',
      exactIdentity: true, substringIdentityMatching: false,
      bounded: true, limit, batchSize, checkedCorrections: corrections.length, findings: output
    };
  } finally {
    await mongoose.connection.close();
  }
}

async function main() {
  const args = parseArgs();
  const result = args.fixture
    ? auditRows(JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8')))
    : await auditDatabase({ limit: args.limit, batchSize: args.batchSize || DEFAULT_BATCH_SIZE });
  if (args.out) fs.writeFileSync(path.resolve(args.out), toCsv(result));
  if (args.json || !args.out) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  console.error('[audit-closeout-ar-splitbrain:R1.3a] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

module.exports = {
  CANONICAL_EVENT_CATEGORY,
  LEGACY_RETIRED_CATEGORY,
  SOURCE_TYPE,
  financialDeltas,
  correctionOwnedEventDelta,
  signedLedgerEffect,
  parseCanonicalCorrectionKey,
  correctionIdentityMatches,
  stableLedgerIdentity,
  dedupeLedgerRows,
  orderIdentityMatches,
  isCanonicalCorrectionEvent,
  isLegacyCorrectionAdjustment,
  canonicalRowsFromFixture,
  resolveFixtureDeliverySnapshot,
  reconcileReturnLifecycle,
  returnArRequired,
  returnIncludedInSnapshot,
  returnAmountAnalysisForAudit,
  returnAmountSourceFields,
  classifyTimeline,
  auditRows,
  auditDatabase,
  toCsv,
  parseArgs
};
