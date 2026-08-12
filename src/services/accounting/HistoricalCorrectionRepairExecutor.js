'use strict';

const Planner = require('./HistoricalCorrectionRepairPlanner');
const TimelineService = require('./HistoricalCorrectionTimelineService');
const Detector = require('./HistoricalCorrectionMissingEventDetector');
const EventDeltaService = require('./CloseoutCorrectionArEventDeltaPostingService');

function text(value = '') { return String(value ?? '').trim(); }
function money(value) { return TimelineService.money(value); }
function stable(value) { return TimelineService.stableJson(value); }

function assertApplyGuard({ apply, plan, planHash, orderCode, planItemHash } = {}) {
  if (apply !== true) {
    const err = new Error('Historical repair executor is dry-run unless explicit --apply is provided.');
    err.code = 'HISTORICAL_REPAIR_APPLY_REQUIRED';
    throw err;
  }
  if (!plan || typeof plan !== 'object') {
    const err = new Error('Repair plan is required.'); err.code = 'HISTORICAL_REPAIR_PLAN_REQUIRED'; throw err;
  }
  const planCheck = Planner.verifyPlanHash(plan);
  if (!planCheck.ok || text(planHash) !== text(plan.planHash)) {
    const err = new Error('Repair plan hash mismatch.'); err.code = 'HISTORICAL_REPAIR_PLAN_HASH_MISMATCH'; err.data = planCheck; throw err;
  }
  if (!text(orderCode) || text(orderCode) !== text(plan.orderCode)) {
    const err = new Error('Explicit order-code must match repair plan.'); err.code = 'HISTORICAL_REPAIR_ORDER_MISMATCH'; throw err;
  }
  if (planItemHash && !(plan.items || []).some((item) => text(item.planItemHash) === text(planItemHash))) {
    const err = new Error('Requested plan-item-hash is not present in plan.'); err.code = 'HISTORICAL_REPAIR_ITEM_HASH_MISMATCH'; throw err;
  }
  return true;
}

function findPlannedItem(plan = {}, planItemHash = '') {
  const items = Array.isArray(plan.items) ? plan.items : [];
  if (planItemHash) return items.find((item) => text(item.planItemHash) === text(planItemHash)) || null;
  return items.length === 1 ? items[0] : null;
}

function lineageMismatches(item = {}, transition = {}) {
  const checks = [
    ['fromVersion', Number(item.fromVersion || 0), Number(transition.fromVersion || 0)],
    ['predecessorVersionId', text(item.predecessorVersionId), text(transition.predecessorVersionId)],
    ['toVersion', Number(item.toVersion || 0), Number(transition.toVersion || 0)],
    ['correctedVersionId', text(item.correctedVersionId), text(transition.correctedVersionId)],
    ['lineageResolutionMethod', text(item.lineageResolutionMethod), text(transition.lineageResolutionMethod)],
    ['lineageHash', text(item.lineageHash), text(transition.lineageHash)],
    ['timelineEvidenceHash', text(item.timelineEvidenceHash), text(transition.evidenceHash)],
    ['expectedMissingEventDelta', money(item.expectedMissingEventDelta), money(transition.correctionOwnedDebtDelta)]
  ];
  const mismatches = [];
  for (const [field, planned, actual] of checks) {
    if (planned !== actual) mismatches.push({ field, planned, actual });
  }
  if (stable(item.previousFinancialState || {}) !== stable(transition.previousFinancialState || {})) {
    mismatches.push({ field: 'previousFinancialState', planned: item.previousFinancialState, actual: transition.previousFinancialState });
  }
  if (stable(item.correctedFinancialState || {}) !== stable(transition.correctedFinancialState || {})) {
    mismatches.push({ field: 'correctedFinancialState', planned: item.correctedFinancialState, actual: transition.correctedFinancialState });
  }
  return mismatches;
}

function assertReconstructedItemStillMatches(item = {}, transition = {}, detection = {}) {
  const itemHash = Planner.verifyPlanItemHash(item);
  if (!itemHash.ok) {
    const err = new Error('Repair plan item hash no longer matches.'); err.code = 'HISTORICAL_REPAIR_ITEM_HASH_INVALID'; err.data = itemHash; throw err;
  }
  const mismatches = lineageMismatches(item, transition);
  if (mismatches.length) {
    const err = new Error('Immutable correction/version lineage changed since plan generation.');
    err.code = 'HISTORICAL_REPAIR_TIMELINE_CHANGED';
    err.data = { mismatches };
    throw err;
  }
  if (detection.classification !== 'MISSING_EVENT_SAFE_TO_PLAN' || detection.safeToApply !== true) {
    const err = new Error(`Historical event is no longer safely missing: ${detection.classification}`);
    err.code = 'HISTORICAL_REPAIR_PRECONDITION_FAILED'; err.data = detection; throw err;
  }
}

function sequenceMismatches(plan = {}) {
  const items = Array.isArray(plan.items) ? plan.items : [];
  const canonical = Planner.canonicalSortItems(items);
  const mismatches = [];
  if (items.length !== canonical.length) return [{ code:'SEQUENCE_LENGTH_MISMATCH' }];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const expected = canonical[index];
    if (text(item.planItemHash) !== text(expected.planItemHash)) {
      mismatches.push({ code:'PLAN_ITEM_ORDER_MISMATCH', index, planned:text(item.planItemHash), canonical:text(expected.planItemHash) });
    }
    if (Number(item.sequenceIndex || 0) !== index + 1) {
      mismatches.push({ code:'SEQUENCE_INDEX_INVALID', index, planned:item.sequenceIndex, expected:index + 1 });
    }
  }
  return mismatches;
}

async function revalidateRepairPlan({ plan, orderCode, session } = {}, deps = {}) {
  const planCheck = Planner.verifyPlanHash(plan || {});
  const result = {
    status: 'READ_ONLY_DB_REVALIDATION', mutation: false, apply: false,
    planHashValid: planCheck.ok, dbRevalidated: false, lineageRevalidated: false,
    eventMissingRevalidated: false, safeToApply: false, idempotentAlreadyApplied: false,
    itemResults: [], abortReasons: []
  };
  if (!planCheck.ok) {
    result.status = 'INVALID_PLAN_HASH';
    result.abortReasons.push({ code:'PLAN_HASH_INVALID', expected:planCheck.expected, actual:planCheck.actual });
    return result;
  }
  if (typeof deps.reloadEvidence !== 'function') {
    result.status = 'DB_REVALIDATION_UNAVAILABLE';
    result.abortReasons.push({ code:'DB_REVALIDATION_UNAVAILABLE' });
    return result;
  }
  const effectiveOrderCode = text(orderCode || plan.orderCode);
  if (!effectiveOrderCode || effectiveOrderCode !== text(plan.orderCode)) {
    result.status = 'STALE_OR_INVALID_PLAN_LINEAGE';
    result.abortReasons.push({ code:'ORDER_CODE_MISMATCH', planned:text(plan.orderCode), actual:effectiveOrderCode });
    return result;
  }

  const evidence = await deps.reloadEvidence({ orderCode: effectiveOrderCode, session });
  result.dbRevalidated = true;
  result.currentArBeforeObserved = money(evidence.currentArBeforeObserved);
  const transitions = TimelineService.reconstructHistoricalTransitions({ order:evidence.order, corrections:evidence.corrections, versions:evidence.versions });
  const seqIssues = sequenceMismatches(plan);
  result.abortReasons.push(...seqIssues);

  for (const item of Array.isArray(plan.items) ? plan.items : []) {
    const itemResult = {
      correctionId: item.correctionId, toVersion: item.toVersion, sequenceIndex:item.sequenceIndex,
      planItemHashValid: Planner.verifyPlanItemHash(item).ok,
      lineageValid: false, eventMissing: false, status: 'INVALID'
    };
    if (!itemResult.planItemHashValid) {
      itemResult.status = 'ITEM_HASH_INVALID';
      result.abortReasons.push({ code:'ITEM_HASH_INVALID', correctionId:item.correctionId });
      result.itemResults.push(itemResult); continue;
    }
    const transition = transitions.find((row) => text(row.correctionId) === text(item.correctionId) && Number(row.toVersion) === Number(item.toVersion));
    if (!transition) {
      itemResult.status = 'TRANSITION_NOT_FOUND';
      result.abortReasons.push({ code:'TRANSITION_NOT_FOUND', correctionId:item.correctionId, toVersion:item.toVersion });
      result.itemResults.push(itemResult); continue;
    }
    const mismatches = lineageMismatches(item, transition);
    itemResult.lineageMismatches = mismatches;
    itemResult.lineageValid = mismatches.length === 0;
    if (!itemResult.lineageValid) {
      itemResult.status = 'STALE_OR_INVALID_PLAN_LINEAGE';
      result.abortReasons.push({ code:'LINEAGE_MISMATCH', correctionId:item.correctionId, mismatches });
      result.itemResults.push(itemResult); continue;
    }
    const detection = Detector.detectMissingCanonicalEvent(transition, evidence.arLedgers || []);
    itemResult.detectorClassification = detection.classification;
    if (detection.classification === 'MISSING_EVENT_SAFE_TO_PLAN' && detection.safeToApply === true) {
      itemResult.eventMissing = true;
      itemResult.status = 'REVALIDATED_SAFE_TO_APPLY';
    } else if (detection.classification === 'ALREADY_POSTED') {
      itemResult.status = 'ALREADY_POSTED_REVALIDATED';
      itemResult.eventMissing = false;
    } else {
      itemResult.status = 'PRECONDITION_FAILED';
      result.abortReasons.push({ code:'EVENT_PRECONDITION_FAILED', correctionId:item.correctionId, classification:detection.classification });
    }
    result.itemResults.push(itemResult);
  }

  result.lineageRevalidated = result.itemResults.length === (plan.items || []).length
    && result.itemResults.every((row) => row.planItemHashValid && row.lineageValid)
    && !result.abortReasons.some((row) => ['PLAN_ITEM_ORDER_MISMATCH','SEQUENCE_INDEX_INVALID','LINEAGE_MISMATCH','TRANSITION_NOT_FOUND','ITEM_HASH_INVALID'].includes(row.code));
  const allMissing = result.itemResults.length > 0 && result.itemResults.every((row) => row.status === 'REVALIDATED_SAFE_TO_APPLY');
  const allPosted = result.itemResults.length > 0 && result.itemResults.every((row) => row.status === 'ALREADY_POSTED_REVALIDATED');
  const mixedPostedAndMissing = result.itemResults.some((row) => row.status === 'ALREADY_POSTED_REVALIDATED')
    && result.itemResults.some((row) => row.status === 'REVALIDATED_SAFE_TO_APPLY');
  if (mixedPostedAndMissing) result.abortReasons.push({ code:'PARTIAL_PLAN_ALREADY_APPLIED' });
  result.eventMissingRevalidated = allMissing;
  result.idempotentAlreadyApplied = allPosted && result.abortReasons.length === 0;
  result.safeToApply = allMissing && result.abortReasons.length === 0 && result.lineageRevalidated;
  if (result.idempotentAlreadyApplied) result.status = 'IDEMPOTENT_ALREADY_APPLIED';
  else if (result.safeToApply) result.status = 'DB_REVALIDATED_SAFE_TO_APPLY';
  else result.status = 'STALE_OR_INVALID_PLAN_LINEAGE';
  return result;
}

async function executePlanItem({ plan, planHash, planItemHash, orderCode, apply = false, actor = 'historical-correction-repair' } = {}, deps = {}) {
  assertApplyGuard({ apply, plan, planHash, orderCode, planItemHash });
  const item = findPlannedItem(plan, planItemHash);
  if (!item) {
    const err = new Error('Exactly one repair item must be selected for apply.'); err.code = 'HISTORICAL_REPAIR_SINGLE_ITEM_REQUIRED'; throw err;
  }
  if (item.safeToApply !== true || item.classification !== 'MISSING_EVENT_SAFE_TO_PLAN') {
    const err = new Error('Repair item is not marked safe-to-apply.'); err.code = 'HISTORICAL_REPAIR_ITEM_NOT_SAFE'; throw err;
  }
  if (typeof deps.withTransaction !== 'function' || typeof deps.reloadEvidence !== 'function') {
    const err = new Error('Transactional repair dependencies are required.'); err.code = 'HISTORICAL_REPAIR_DEPENDENCIES_REQUIRED'; throw err;
  }

  return deps.withTransaction(async (session) => {
    const evidence = await deps.reloadEvidence({ orderCode, correctionId: item.correctionId, session });
    const transitions = TimelineService.reconstructHistoricalTransitions({ order:evidence.order, corrections:evidence.corrections, versions:evidence.versions });
    const transition = transitions.find((row) => text(row.correctionId) === text(item.correctionId) && Number(row.toVersion) === Number(item.toVersion));
    if (!transition) {
      const err = new Error('Planned historical transition cannot be reconstructed during apply.'); err.code = 'HISTORICAL_REPAIR_TRANSITION_NOT_FOUND'; throw err;
    }
    const detection = Detector.detectMissingCanonicalEvent(transition, evidence.arLedgers || []);
    if (detection.classification === 'ALREADY_POSTED') {
      return { applied:false, idempotent:true, reason:'ALREADY_POSTED', correctionId:transition.correctionId,
        eventIdentity:transition.eventIdentity, expectedMissingEventDelta:money(item.expectedMissingEventDelta),
        arBefore:money(evidence.currentArBeforeObserved), arAfter:money(evidence.currentArBeforeObserved),
        expectedArAfter:money(evidence.currentArBeforeObserved), ledger:detection.matches && detection.matches[0] || null };
    }
    assertReconstructedItemStillMatches(item, transition, detection);
    const postFn = deps.postCorrectionEvent || (async ({ transition:t, session:s }) => EventDeltaService.postCorrectionEventDelta({
      order:t.syntheticOrder, correction:t.syntheticCorrection, version:t.version
    }, { session:s, actor, zeroTolerance:1000, accountingBatchId:`R1P4A-HISTORICAL-REPAIR-${t.correctionId}` }));
    const result = await postFn({ transition, session, actor, evidence });
    const expectedDelta = money(item.expectedMissingEventDelta);
    const arBefore = money(result.arBefore ?? evidence.currentArBeforeObserved ?? item.currentArBeforeObserved);
    const expectedAfter = money(arBefore + expectedDelta);
    const arAfter = money(result.arAfter);
    if (arAfter !== expectedAfter) {
      const err = new Error('Canonical AR after historical repair does not equal AR immediately before + missing historical event delta.');
      err.code = 'HISTORICAL_REPAIR_AR_INVARIANT_FAILED'; err.data = { arBefore, expectedDelta, expectedAfter, arAfter }; throw err;
    }
    return { applied:result.posted === true, idempotent:result.idempotent === true, correctionId:transition.correctionId,
      eventIdentity:transition.eventIdentity, expectedMissingEventDelta:expectedDelta, arBefore, arAfter, expectedArAfter:expectedAfter, ledger:result.ledger || null };
  });
}

async function executePlan({ plan, planHash, orderCode, apply = false, actor = 'historical-correction-repair' } = {}, deps = {}) {
  assertApplyGuard({ apply, plan, planHash, orderCode });
  if (typeof deps.withTransaction !== 'function' || typeof deps.reloadEvidence !== 'function') {
    const err = new Error('Transactional repair dependencies are required.'); err.code = 'HISTORICAL_REPAIR_DEPENDENCIES_REQUIRED'; throw err;
  }
  return deps.withTransaction(async (session) => {
    const preflight = await revalidateRepairPlan({ plan, orderCode, session }, { reloadEvidence:deps.reloadEvidence });
    if (preflight.idempotentAlreadyApplied) {
      return { applied:false, idempotent:true, reason:'ALL_EVENTS_ALREADY_POSTED', preflight, results:[], finalAr:preflight.currentArBeforeObserved };
    }
    if (!preflight.safeToApply) {
      const err = new Error('Repair plan failed database lineage/event preflight.');
      err.code = 'HISTORICAL_REPAIR_PLAN_REVALIDATION_FAILED'; err.data = preflight; throw err;
    }
    const initialEvidence = await deps.reloadEvidence({ orderCode, session });
    const transitions = TimelineService.reconstructHistoricalTransitions({ order:initialEvidence.order, corrections:initialEvidence.corrections, versions:initialEvidence.versions });
    const items = Planner.canonicalSortItems(plan.items || []);
    const results = [];
    const readCurrentAr = typeof deps.readCurrentAr === 'function'
      ? deps.readCurrentAr
      : async () => money((await deps.reloadEvidence({ orderCode, session })).currentArBeforeObserved);
    const postFn = deps.postCorrectionEvent || (async ({ transition:t, session:s }) => EventDeltaService.postCorrectionEventDelta({
      order:t.syntheticOrder, correction:t.syntheticCorrection, version:t.version
    }, { session:s, actor, zeroTolerance:1000, accountingBatchId:`R1P4A-HISTORICAL-REPAIR-${t.correctionId}` }));

    for (const item of items) {
      const transition = transitions.find((row) => text(row.correctionId) === text(item.correctionId) && Number(row.toVersion) === Number(item.toVersion));
      if (!transition) throw Object.assign(new Error('Transition disappeared inside repair transaction.'), { code:'HISTORICAL_REPAIR_TRANSITION_NOT_FOUND' });
      const arBefore = money(await readCurrentAr({ orderCode, session, item, transition }));
      const result = await postFn({ transition, session, actor, evidence:initialEvidence, item });
      const expectedAfter = money(arBefore + money(item.expectedMissingEventDelta));
      const actualBefore = money(result.arBefore ?? arBefore);
      const arAfter = money(result.arAfter);
      if (actualBefore !== arBefore || arAfter !== expectedAfter) {
        const err = new Error('Sequential historical repair AR invariant failed.');
        err.code = 'HISTORICAL_REPAIR_AR_INVARIANT_FAILED';
        err.data = { correctionId:item.correctionId, sequenceIndex:item.sequenceIndex, arBefore, actualBefore, expectedAfter, arAfter };
        throw err;
      }
      results.push({ correctionId:item.correctionId, toVersion:item.toVersion, sequenceIndex:item.sequenceIndex,
        expectedMissingEventDelta:money(item.expectedMissingEventDelta), arBefore, arAfter, expectedArAfter:expectedAfter,
        applied:result.posted === true, idempotent:result.idempotent === true, ledger:result.ledger || null });
    }
    const finalAr = results.length ? results[results.length - 1].arAfter : money(await readCurrentAr({ orderCode, session }));
    return { applied:results.some((row) => row.applied), idempotent:false, preflight, results, finalAr };
  });
}

module.exports = {
  assertApplyGuard,
  findPlannedItem,
  lineageMismatches,
  sequenceMismatches,
  assertReconstructedItemStillMatches,
  revalidateRepairPlan,
  executePlanItem,
  executePlan
};
