'use strict';

const crypto = require('node:crypto');
const TimelineService = require('./HistoricalCorrectionTimelineService');
const Detector = require('./HistoricalCorrectionMissingEventDetector');
const EventDeltaService = require('./CloseoutCorrectionArEventDeltaPostingService');
const { normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');

function text(value = '') { return String(value ?? '').trim(); }
function money(value) { return TimelineService.money(value); }
function stableJson(value) { return TimelineService.stableJson(value); }
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
function signedSummary(rows = []) {
  return (rows || []).map((row) => ({
    ledgerId: text(row.id || row.code || row._id),
    category: text(row.category || row.ledgerType),
    sourceType: text(row.sourceType || row.refType),
    debit: money(row.debit), credit: money(row.credit), effect: money(row.debit) - money(row.credit),
    createdAt: text(row.createdAt || row.date)
  }));
}

function buildPlanItem(transition = {}, detection = {}, context = {}) {
  const ledger = EventDeltaService.buildEventDeltaLedger({
    order: transition.syntheticOrder,
    correction: transition.syntheticCorrection,
    version: transition.version
  }, { actor: 'historical-correction-repair-planner', now: context.generatedAt || new Date().toISOString(), zeroTolerance: 1000 });
  if (!ledger) return null;
  const currentArBeforeObserved = money(context.currentArBeforeObserved);
  const expectedMissingEventDelta = money(transition.correctionOwnedDebtDelta);
  const item = {
    planVersion: 'R1P4A_HISTORICAL_CORRECTION_REPAIR_V2',
    generatedAt: context.generatedAt || new Date().toISOString(),
    orderCode: transition.orderCode,
    orderId: transition.orderId,
    customerCode: transition.customerCode,
    correctionId: transition.correctionId,
    correctionCode: transition.correctionCode,
    sourceOriginalVersion: transition.sourceOriginalVersion,
    fromVersion: transition.fromVersion,
    predecessorVersionId: transition.predecessorVersionId,
    toVersion: transition.toVersion,
    correctedVersionId: transition.correctedVersionId,
    lineageResolutionMethod: transition.lineageResolutionMethod,
    lineageEvidenceRefs: transition.lineageEvidenceRefs || [],
    lineageHash: transition.lineageHash,
    expectedMissingEventDelta,
    expectedDebit: expectedMissingEventDelta > 0 ? expectedMissingEventDelta : 0,
    expectedCredit: expectedMissingEventDelta < 0 ? Math.abs(expectedMissingEventDelta) : 0,
    canonicalCategory: ledger.category,
    sourceType: ledger.sourceType,
    sourceId: ledger.sourceId,
    sourceCode: ledger.sourceCode,
    refType: ledger.refType,
    refId: ledger.refId,
    refCode: ledger.refCode,
    idempotencyIdentity: ledger.idempotencyKey,
    currentArBeforeObserved,
    expectedCurrentArAfterIfAppliedNow: money(currentArBeforeObserved + expectedMissingEventDelta),
    subsequentEventSummary: signedSummary(context.subsequentEvents || []),
    classification: detection.classification,
    safeToApply: detection.safeToApply === true,
    evidenceRefs: transition.evidenceRefs || [],
    timelineEvidenceHash: transition.evidenceHash,
    previousFinancialState: transition.previousFinancialState,
    correctedFinancialState: transition.correctedFinancialState,
    componentDeltas: {
      receivableDelta: transition.receivableDelta,
      cashDelta: transition.cashDelta,
      bankDelta: transition.bankDelta,
      rewardDelta: transition.rewardDelta,
      returnDeltaObserved: transition.returnDeltaObserved
    },
    canonicalLedgerPreview: {
      category: ledger.category, ledgerType: ledger.ledgerType, type: ledger.type,
      debit: ledger.debit, credit: ledger.credit, amount: ledger.amount, direction: ledger.direction,
      sourceType: ledger.sourceType, sourceId: ledger.sourceId, sourceCode: ledger.sourceCode,
      refType: ledger.refType, refId: ledger.refId, refCode: ledger.refCode,
      idempotencyKey: ledger.idempotencyKey, correctionId: ledger.correctionId, correctionCode: ledger.correctionCode
    }
  };
  item.planItemHash = sha256({ ...item, planItemHash: undefined });
  return item;
}

function canonicalSortItems(items = []) {
  return [...(items || [])].sort((a, b) => Number(a.toVersion || 0) - Number(b.toVersion || 0)
    || Number(a.fromVersion || 0) - Number(b.fromVersion || 0)
    || text(a.correctionId).localeCompare(text(b.correctionId)));
}

function createRepairPlan({ order = {}, corrections = [], versions = [], arLedgers = [], currentArBeforeObserved = 0, subsequentEvents = [], generatedAt } = {}) {
  const at = generatedAt || new Date().toISOString();
  const transitions = TimelineService.reconstructHistoricalTransitions({ order, corrections, versions });
  const reconciliations = transitions.map((transition) => ({
    transition,
    detection: Detector.detectMissingCanonicalEvent(transition, arLedgers)
  }));
  const items = canonicalSortItems(reconciliations
    .filter(({ detection }) => detection.classification === 'MISSING_EVENT_SAFE_TO_PLAN' && detection.safeToApply)
    .map(({ transition, detection }) => buildPlanItem(transition, detection, { generatedAt: at, currentArBeforeObserved, subsequentEvents }))
    .filter(Boolean));

  let sequentialAr = money(currentArBeforeObserved);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    item.sequenceIndex = index + 1;
    item.expectedArBeforeSequentialApply = sequentialAr;
    sequentialAr = money(sequentialAr + money(item.expectedMissingEventDelta));
    item.expectedArAfterSequentialApply = sequentialAr;
    item.planItemHash = sha256({ ...item, planItemHash: undefined });
  }

  const plan = {
    planVersion: 'R1P4A_HISTORICAL_CORRECTION_REPAIR_V2',
    generatedAt: at,
    readOnly: true,
    mutation: false,
    orderCode: text(order.orderCode || order.code),
    orderId: text(order.orderId || order.id || order.salesOrderId),
    customerCode: text(order.customerCode),
    currentArBeforeObserved: money(currentArBeforeObserved),
    transitionCount: transitions.length,
    proposedRepairCount: items.length,
    transitions: reconciliations.map(({ transition, detection }) => ({
      orderCode: transition.orderCode, correctionId: transition.correctionId, correctionCode: transition.correctionCode,
      sourceOriginalVersion: transition.sourceOriginalVersion,
      fromVersion: transition.fromVersion, predecessorVersionId: transition.predecessorVersionId,
      toVersion: transition.toVersion, correctedVersionId: transition.correctedVersionId,
      lineageResolutionMethod: transition.lineageResolutionMethod,
      lineageEvidenceRefs: transition.lineageEvidenceRefs || [], lineageHash: transition.lineageHash,
      correctionOwnedDebtDelta: transition.correctionOwnedDebtDelta,
      eventIdentity: transition.eventIdentity,
      timelineClassification: transition.classification,
      detectorClassification: detection.classification,
      safeToApply: detection.safeToApply === true,
      evidenceHash: transition.evidenceHash
    })),
    items,
    expectedNetHistoricalEffect: items.reduce((sum, item) => money(sum + money(item.expectedMissingEventDelta)), 0),
    expectedFinalArRaw: sequentialAr,
    expectedFinalDebtNormalized: normalizeDebtAmount(sequentialAr, DEBT_ZERO_TOLERANCE),
    sequencePolicy: 'ACTUAL_PREDECESSOR_THEN_TO_VERSION_ASC'
  };
  plan.planHash = sha256({ ...plan, planHash: undefined });
  return plan;
}

function verifyPlanHash(plan = {}) {
  const expected = sha256({ ...plan, planHash: undefined });
  return { ok: Boolean(plan.planHash) && text(plan.planHash) === expected, expected, actual: text(plan.planHash) };
}
function verifyPlanItemHash(item = {}) {
  const expected = sha256({ ...item, planItemHash: undefined });
  return { ok: Boolean(item.planItemHash) && text(item.planItemHash) === expected, expected, actual: text(item.planItemHash) };
}

module.exports = {
  createRepairPlan,
  buildPlanItem,
  canonicalSortItems,
  verifyPlanHash,
  verifyPlanItemHash,
  sha256,
  stableJson
};
