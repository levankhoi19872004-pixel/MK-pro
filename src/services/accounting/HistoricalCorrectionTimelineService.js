'use strict';

const crypto = require('node:crypto');
const { toNumber } = require('../../utils/common.util');
const CloseoutCorrectionArEventDeltaPostingService = require('./CloseoutCorrectionArEventDeltaPostingService');

function text(value = '') { return String(value ?? '').trim(); }
function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function hasOwnValue(obj = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
    && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '';
}
function firstMoney(source = {}, keys = [], fallback) {
  for (const key of keys) if (hasOwnValue(source, key)) return { known: true, value: money(source[key]), field: key };
  if (fallback && fallback.known) return fallback;
  return { known: false, value: 0, field: '' };
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
function rowId(row = {}) { return text(row.id || row._id || row.code || row.correctionId || row.correctionCode); }
function correctionId(row = {}) { return text(row.id || row.correctionId || row._id || row.code || row.correctionCode); }
function correctionCode(row = {}) { return text(row.correctionCode || row.code || row.id || row.correctionId); }
function orderId(row = {}) { return text(row.salesOrderId || row.orderId || row.sourceOrderId || row.id || row._id); }
function orderCode(row = {}) { return text(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.code); }
function customerCode(row = {}) { return text(row.customerCode); }
function versionNo(row = {}) {
  const n = Number(row.newCloseoutVersion ?? row.closeoutVersion ?? row.sourceVersion ?? row.version ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function createdAt(row = {}) { return text(row.createdAt || row.updatedAt); }
function sameText(a, b) { return text(a) && text(b) && text(a) === text(b); }

function versionMatchesCorrection(version = {}, correction = {}) {
  const cid = correctionId(correction);
  const ccode = correctionCode(correction);
  return [version.correctionId, version.correctionCode].map(text).some((v) => v && (v === cid || v === ccode));
}

function findVersionForCorrection(versions = [], correction = {}) {
  const exact = (versions || []).filter((v) => versionMatchesCorrection(v, correction));
  if (exact.length === 1) return { row: exact[0], ambiguous: false, candidates: exact };
  if (exact.length > 1) {
    const wanted = versionNo(correction);
    const byVersion = exact.filter((v) => versionNo(v) === wanted);
    if (byVersion.length === 1) return { row: byVersion[0], ambiguous: false, candidates: exact };
    return { row: null, ambiguous: true, candidates: exact };
  }
  const wanted = versionNo(correction);
  const byNo = (versions || []).filter((v) => wanted > 0 && versionNo(v) === wanted && (
    sameText(v.orderId || v.salesOrderId, correction.orderId || correction.salesOrderId)
    || sameText(v.orderCode || v.salesOrderCode, correction.orderCode || correction.salesOrderCode)
  ));
  if (byNo.length === 1) return { row: byNo[0], ambiguous: false, candidates: byNo };
  return { row: null, ambiguous: byNo.length > 1, candidates: byNo };
}

function embeddedOriginalState(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  const receivable = firstMoney(closeout, ['receivableAmount', 'saleAmount', 'originalAmount'], firstMoney(order, ['totalAmount', 'amount', 'finalAmount', 'orderAmount']));
  return {
    receivableAmount: receivable,
    cashAmount: firstMoney(closeout, ['cashAmount', 'cashCollectedAmount'], { known: true, value: 0, field: 'default_zero' }),
    bankAmount: firstMoney(closeout, ['bankAmount', 'transferAmount', 'bankTransferAmount'], { known: true, value: 0, field: 'default_zero' }),
    rewardAmount: firstMoney(closeout, ['rewardAmount', 'rewardOffsetTotalAmount', 'offsetAmount'], { known: true, value: 0, field: 'default_zero' }),
    returnAmount: firstMoney(closeout, ['returnAmount', 'returnedAmount'], { known: true, value: 0, field: 'default_zero' }),
    debtAmount: firstMoney(closeout, ['debtAmount', 'finalDebtAmount', 'rawDebtAmount']),
    version: Number(closeout.closeoutVersion || closeout.version || 1) || 1,
    source: 'salesOrders.deliveryCloseout'
  };
}

function stateFromVersion(version = {}) {
  return {
    receivableAmount: firstMoney(version, ['saleAmount', 'originalAmount', 'receivableAmount']),
    cashAmount: firstMoney(version, ['cashAmount', 'newCashAmount', 'cashCollectedAmount']),
    bankAmount: firstMoney(version, ['bankAmount', 'newBankAmount']),
    rewardAmount: firstMoney(version, ['rewardAmount', 'newRewardAmount', 'rewardOffsetTotalAmount']),
    returnAmount: firstMoney(version, ['returnAmount', 'returnedAmount', 'newReturnAmount']),
    debtAmount: firstMoney(version, ['debtAmount', 'finalDebtAmount', 'rawDebtAmount']),
    version: versionNo(version),
    source: rowId(version) || 'deliveryCloseoutVersion'
  };
}

function previousStateFromCorrection(correction = {}, version = {}, fallback = null) {
  const fb = fallback || {};
  const vr = version || {};
  return {
    receivableAmount: firstMoney(correction, ['previousReceivableAmount', 'previousSaleAmount'], firstMoney(vr, ['previousReceivableAmount', 'previousSaleAmount'], fb.receivableAmount)),
    cashAmount: firstMoney(correction, ['previousCashAmount', 'previousCashCollectedAmount'], firstMoney(vr, ['previousCashAmount', 'previousCashCollectedAmount'], fb.cashAmount)),
    bankAmount: firstMoney(correction, ['previousBankAmount'], firstMoney(vr, ['previousBankAmount'], fb.bankAmount)),
    rewardAmount: firstMoney(correction, ['previousRewardAmount'], firstMoney(vr, ['previousRewardAmount'], fb.rewardAmount)),
    returnAmount: firstMoney(correction, ['previousReturnAmount'], firstMoney(vr, ['previousReturnAmount'], fb.returnAmount)),
    debtAmount: firstMoney(correction, ['previousDebtAmount'], firstMoney(vr, ['previousDebtAmount'], fb.debtAmount)),
    source: rowId(correction) ? 'deliveryCloseoutCorrection.previous*' : (fb.source || '')
  };
}

function correctedStateFromCorrection(correction = {}, version = {}, fallback = null) {
  const fb = fallback || {};
  const vr = version || {};
  return {
    receivableAmount: firstMoney(correction, ['newReceivableAmount', 'receivableAmount', 'saleAmount'], firstMoney(vr, ['saleAmount', 'originalAmount', 'receivableAmount'], fb.receivableAmount)),
    cashAmount: firstMoney(correction, ['newCashAmount', 'cashAmount', 'newCashCollectedAmount'], firstMoney(vr, ['cashAmount', 'newCashAmount', 'cashCollectedAmount'], fb.cashAmount)),
    bankAmount: firstMoney(correction, ['newBankAmount', 'bankAmount'], firstMoney(vr, ['bankAmount', 'newBankAmount'], fb.bankAmount)),
    rewardAmount: firstMoney(correction, ['newRewardAmount', 'rewardAmount'], firstMoney(vr, ['rewardAmount', 'newRewardAmount', 'rewardOffsetTotalAmount'], fb.rewardAmount)),
    returnAmount: firstMoney(correction, ['newReturnAmount', 'returnAmount'], firstMoney(vr, ['returnAmount', 'returnedAmount', 'newReturnAmount'], fb.returnAmount)),
    debtAmount: firstMoney(correction, ['newDebtAmount', 'debtAmount', 'finalDebtAmount'], firstMoney(vr, ['debtAmount', 'finalDebtAmount', 'rawDebtAmount'], fb.debtAmount)),
    source: rowId(correction) ? 'deliveryCloseoutCorrection.new*' : (rowId(version) || fb.source || '')
  };
}

function stateValue(state = {}, key = '') { return state[key] && state[key].known ? money(state[key].value) : null; }
function plainState(state = {}) {
  return {
    receivableAmount: stateValue(state, 'receivableAmount'),
    cashAmount: stateValue(state, 'cashAmount'),
    bankAmount: stateValue(state, 'bankAmount'),
    rewardAmount: stateValue(state, 'rewardAmount'),
    returnAmount: stateValue(state, 'returnAmount'),
    debtAmount: stateValue(state, 'debtAmount')
  };
}
function coreStateComplete(state = {}) {
  return ['receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount'].every((k) => state[k] && state[k].known);
}

function stateMatchesPlain(candidateState = {}, expectedPlain = {}) {
  const keys = ['receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount', 'debtAmount'];
  let compared = 0;
  for (const key of keys) {
    const candidate = stateValue(candidateState, key);
    const expected = expectedPlain[key];
    if (candidate === null || expected === null || expected === undefined) continue;
    compared += 1;
    if (money(candidate) !== money(expected)) return false;
  }
  return compared >= 5;
}

function sourceOriginalVersion(correction = {}, version = {}) {
  const n = Number(correction.originalCloseoutVersion ?? version.originalCloseoutVersion ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function directPredecessorVersion(correction = {}, version = {}) {
  const candidates = [
    correction.predecessorCloseoutVersion, correction.previousCloseoutVersion, correction.predecessorVersion, correction.previousVersion,
    version.predecessorCloseoutVersion, version.previousCloseoutVersion, version.predecessorVersion, version.previousVersion
  ];
  for (const value of candidates) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function directPredecessorId(correction = {}, version = {}) {
  return text(
    correction.predecessorVersionId || correction.previousVersionId || correction.predecessorCloseoutId || correction.previousCloseoutId
    || version.predecessorVersionId || version.previousVersionId || version.predecessorCloseoutId || version.previousCloseoutId
  );
}

function predecessorCandidates({ order = {}, versions = [], original = {}, toVersion = 0 } = {}) {
  const out = [];
  if (original && original.version > 0 && coreStateComplete(original) && original.version <= toVersion) {
    const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
    out.push({
      version: Number(original.version),
      id: text(closeout.id || closeout.closeoutId || closeout.code || closeout.closeoutCode || `ORIGINAL-v${original.version}`),
      state: original,
      source: 'salesOrders.deliveryCloseout'
    });
  }
  for (const row of versions || []) {
    const n = versionNo(row);
    if (!(n > 0 && n < toVersion)) continue;
    out.push({ version: n, id: rowId(row), state: stateFromVersion(row), source: 'deliveryCloseoutVersion', row });
  }
  const deduped = [];
  const seen = new Set();
  for (const row of out) {
    const key = `${row.version}|${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key); deduped.push(row);
  }

  // DeliveryCloseoutVersion is the immutable version ledger and therefore wins
  // over the embedded salesOrders.deliveryCloseout snapshot when both describe
  // the same version number. Keep multiple immutable rows for the same version:
  // that is genuine ambiguity and must fail closed in predecessor resolution.
  const immutableVersions = new Set(
    deduped.filter((row) => row.source === 'deliveryCloseoutVersion').map((row) => row.version)
  );
  return deduped.filter((row) => !(row.source === 'salesOrders.deliveryCloseout' && immutableVersions.has(row.version)));
}

function resolveActualPredecessor({ order = {}, correction = {}, version = {}, versions = [], original = {}, previousPlain = {}, toVersion = 0 } = {}) {
  const candidates = predecessorCandidates({ order, versions, original, toVersion });
  const explicitVersion = directPredecessorVersion(correction, version);
  const explicitId = directPredecessorId(correction, version);

  if (explicitId) {
    const matches = candidates.filter((row) => text(row.id) === explicitId);
    if (matches.length === 1 && stateMatchesPlain(matches[0].state, previousPlain)) {
      return { ok: true, ...matches[0], method: 'EXPLICIT_PREDECESSOR_ID', candidates: matches };
    }
    return { ok: false, method: 'EXPLICIT_PREDECESSOR_ID_CONFLICT', candidates: matches };
  }
  if (explicitVersion > 0) {
    const matches = candidates.filter((row) => row.version === explicitVersion);
    if (matches.length === 1 && stateMatchesPlain(matches[0].state, previousPlain)) {
      return { ok: true, ...matches[0], method: 'EXPLICIT_PREDECESSOR_VERSION', candidates: matches };
    }
    return { ok: false, method: 'EXPLICIT_PREDECESSOR_VERSION_CONFLICT', candidates: matches };
  }

  const stateMatches = candidates.filter((row) => stateMatchesPlain(row.state, previousPlain));
  if (stateMatches.length === 1) return { ok: true, ...stateMatches[0], method: 'EXACT_PREVIOUS_STATE_MATCH', candidates: stateMatches };
  if (stateMatches.length > 1) {
    const immediate = stateMatches.filter((row) => row.version === toVersion - 1);
    if (immediate.length === 1) return { ok: true, ...immediate[0], method: 'CANONICAL_SEQUENCE_TIEBREAK', candidates: stateMatches };
    return { ok: false, method: 'AMBIGUOUS_PREVIOUS_STATE_MATCH', candidates: stateMatches };
  }

  // Runtime correction versions are created as previousVersion + 1. Only use this
  // fallback when the correction's previous state is incomplete; a complete-but-
  // mismatching state is a data conflict and must not be silently coerced.
  const expectedKnown = ['receivableAmount','cashAmount','bankAmount','rewardAmount','returnAmount']
    .filter((key) => previousPlain[key] !== null && previousPlain[key] !== undefined).length;
  const immediate = candidates.filter((row) => row.version === toVersion - 1);
  if (expectedKnown < 5 && immediate.length === 1) {
    return { ok: true, ...immediate[0], method: 'CANONICAL_SEQUENCE_INCOMPLETE_STATE_FALLBACK', candidates: immediate };
  }
  if (toVersion === Number(original.version) && coreStateComplete(original)) {
    const originalCandidate = candidates.find((row) => row.version === Number(original.version));
    if (originalCandidate && stateMatchesPlain(originalCandidate.state, previousPlain)) {
      return { ok: true, ...originalCandidate, method: 'ORIGINAL_SAME_VERSION', candidates: [originalCandidate] };
    }
  }
  return { ok: false, method: 'NO_DETERMINISTIC_PREDECESSOR', candidates: stateMatches };
}

function lineageHash(transition = {}) {
  return sha256({
    orderId: transition.orderId,
    correctionId: transition.correctionId,
    sourceOriginalVersion: transition.sourceOriginalVersion,
    fromVersion: transition.fromVersion,
    predecessorVersionId: transition.predecessorVersionId,
    toVersion: transition.toVersion,
    correctedVersionId: transition.correctedVersionId,
    lineageResolutionMethod: transition.lineageResolutionMethod,
    previousFinancialState: transition.previousFinancialState,
    correctedFinancialState: transition.correctedFinancialState
  });
}

function detectCorrectionVersionConflicts(correction = {}, version = {}) {
  if (!version || !Object.keys(version).length) return [];
  const pairs = [
    ['previousCashAmount', ['previousCashAmount']], ['previousBankAmount', ['previousBankAmount']], ['previousRewardAmount', ['previousRewardAmount']], ['previousReturnAmount', ['previousReturnAmount']],
    ['newCashAmount', ['cashAmount', 'newCashAmount']], ['newBankAmount', ['bankAmount', 'newBankAmount']], ['newRewardAmount', ['rewardAmount', 'newRewardAmount']], ['newReturnAmount', ['returnAmount', 'returnedAmount', 'newReturnAmount']],
    ['newDebtAmount', ['debtAmount', 'finalDebtAmount']]
  ];
  const conflicts = [];
  for (const [cField, vFields] of pairs) {
    if (!hasOwnValue(correction, cField)) continue;
    const v = firstMoney(version, vFields);
    if (!v.known) continue;
    const c = money(correction[cField]);
    if (c !== v.value) conflicts.push({ field: cField, correctionValue: c, versionValue: v.value, versionField: v.field });
  }
  return conflicts;
}

function transitionEvidenceHash(transition = {}) {
  return sha256({
    orderId: transition.orderId, orderCode: transition.orderCode, correctionId: transition.correctionId,
    correctionCode: transition.correctionCode, sourceOriginalVersion: transition.sourceOriginalVersion,
    fromVersion: transition.fromVersion, predecessorVersionId: transition.predecessorVersionId,
    toVersion: transition.toVersion, correctedVersionId: transition.correctedVersionId,
    lineageResolutionMethod: transition.lineageResolutionMethod, lineageHash: transition.lineageHash,
    previousFinancialState: transition.previousFinancialState, correctedFinancialState: transition.correctedFinancialState,
    correctionOwnedDebtDelta: transition.correctionOwnedDebtDelta, eventIdentity: transition.eventIdentity,
    evidenceRefs: transition.evidenceRefs, lineageEvidenceRefs: transition.lineageEvidenceRefs
  });
}

function reconstructHistoricalTransitions({ order = {}, corrections = [], versions = [] } = {}) {
  const original = embeddedOriginalState(order);
  const sortedCorrections = [...(corrections || [])].sort((a, b) => {
    const av = versionNo(a); const bv = versionNo(b);
    if (av !== bv) return av - bv;
    return createdAt(a).localeCompare(createdAt(b));
  });
  const sortedVersions = [...(versions || [])].sort((a, b) => versionNo(a) - versionNo(b) || createdAt(a).localeCompare(createdAt(b)));
  const transitionRows = [];
  const stateByVersion = new Map();
  if (original.version > 0 && coreStateComplete(original)) stateByVersion.set(original.version, original);
  for (const v of sortedVersions) if (versionNo(v) > 0) stateByVersion.set(versionNo(v), stateFromVersion(v));

  let lastCorrectedState = null;
  let lastVersion = 0;

  for (const correction of sortedCorrections) {
    const vmatch = findVersionForCorrection(sortedVersions, correction);
    const version = vmatch.row || {};
    const toVersion = versionNo(correction) || versionNo(version) || (lastVersion + 1);
    const originalVersion = sourceOriginalVersion(correction, version);
    const lineageFallbackVersion = toVersion > 1 ? stateByVersion.get(toVersion - 1) : null;
    const safeEmbeddedOriginal = coreStateComplete(original) && original.version > 0 && original.version <= toVersion ? original : null;
    const fallbackPrevious = lineageFallbackVersion || lastCorrectedState || (originalVersion ? stateByVersion.get(originalVersion) : null) || safeEmbeddedOriginal;
    const previous = previousStateFromCorrection(correction, version, fallbackPrevious);
    const corrected = correctedStateFromCorrection(correction, version, previous);
    const conflicts = detectCorrectionVersionConflicts(correction, version);
    if (vmatch.ambiguous) conflicts.push({ field: 'versionIdentity', reason: 'multiple_versions_match_correction', candidates: vmatch.candidates.map(rowId) });

    const previousPlain = plainState(previous);
    const correctedPlain = plainState(corrected);
    const predecessor = resolveActualPredecessor({
      order, correction, version, versions: sortedVersions, original, previousPlain, toVersion
    });
    const previousComplete = coreStateComplete(previous);
    const correctedComplete = coreStateComplete(corrected);
    const receivableDelta = previousComplete && correctedComplete ? money(correctedPlain.receivableAmount - previousPlain.receivableAmount) : 0;
    const cashDelta = previousComplete && correctedComplete ? money(correctedPlain.cashAmount - previousPlain.cashAmount) : 0;
    const bankDelta = previousComplete && correctedComplete ? money(correctedPlain.bankAmount - previousPlain.bankAmount) : 0;
    const rewardDelta = previousComplete && correctedComplete ? money(correctedPlain.rewardAmount - previousPlain.rewardAmount) : 0;
    const returnDeltaObserved = previousComplete && correctedComplete ? money(correctedPlain.returnAmount - previousPlain.returnAmount) : 0;
    const correctionOwnedDebtDelta = previousComplete && correctedComplete
      ? money(receivableDelta - cashDelta - bankDelta - rewardDelta)
      : 0;

    let classification = 'RECONSTRUCTED';
    if (conflicts.length) classification = 'DATA_CONFLICT';
    else if (!previousComplete || !correctedComplete) classification = 'AMBIGUOUS_TIMELINE';
    else if (!predecessor.ok) classification = 'AMBIGUOUS_LINEAGE';
    else if (correctionOwnedDebtDelta === 0 && returnDeltaObserved !== 0) classification = 'RETURN_OWNED_EXTERNALLY';
    else if (correctionOwnedDebtDelta === 0) classification = 'NO_EFFECT';

    const syntheticOrder = {
      id: orderId(correction) || orderId(order), orderId: orderId(correction) || orderId(order), salesOrderId: orderId(correction) || orderId(order),
      code: orderCode(correction) || orderCode(order), orderCode: orderCode(correction) || orderCode(order), salesOrderCode: orderCode(correction) || orderCode(order),
      customerCode: customerCode(correction) || customerCode(order), customerName: text(correction.customerName || order.customerName)
    };
    const syntheticCorrection = {
      ...correction,
      id: correctionId(correction), code: correctionCode(correction), correctionId: correctionId(correction), correctionCode: correctionCode(correction),
      newCloseoutVersion: toVersion,
      receivableDeltaAmount: receivableDelta, cashDeltaAmount: cashDelta, bankDeltaAmount: bankDelta, rewardDeltaAmount: rewardDelta,
      returnAdjustmentAmount: returnDeltaObserved,
      metadata: {
        ...(correction.metadata || {}),
        receivableDelta, cashDelta, bankDelta, rewardDelta, returnDelta: returnDeltaObserved,
        correctionOwnedArDebtDelta: correctionOwnedDebtDelta,
        historicalReconstruction: true
      }
    };
    let eventIdentity = '';
    try { eventIdentity = CloseoutCorrectionArEventDeltaPostingService.eventIdempotencyKey(syntheticOrder, syntheticCorrection, { closeoutVersion: toVersion }); } catch (_) { eventIdentity = ''; }

    const transition = {
      orderId: syntheticOrder.id,
      orderCode: syntheticOrder.code,
      customerCode: syntheticOrder.customerCode,
      correctionId: correctionId(correction), correctionCode: correctionCode(correction),
      sourceOriginalVersion: originalVersion,
      fromVersion: predecessor.ok ? predecessor.version : 0,
      predecessorVersionId: predecessor.ok ? predecessor.id : '',
      toVersion,
      correctedVersionId: rowId(version),
      lineageResolutionMethod: predecessor.method,
      lineageEvidenceRefs: [predecessor.ok && predecessor.id, rowId(version), rowId(correction)].filter(Boolean),
      previousFinancialState: previousPlain,
      correctedFinancialState: correctedPlain,
      receivableDelta, cashDelta, bankDelta, rewardDelta, returnDeltaObserved,
      correctionOwnedDebtDelta,
      eventIdentity,
      evidenceRefs: [rowId(correction), rowId(version), predecessor.ok ? predecessor.id : (fallbackPrevious && fallbackPrevious.source)].filter(Boolean),
      immutableConflicts: conflicts,
      classification,
      syntheticOrder,
      syntheticCorrection,
      version: version && Object.keys(version).length ? version : { closeoutVersion: toVersion, correctionId: correctionId(correction), correctionCode: correctionCode(correction) }
    };
    transition.lineageHash = lineageHash(transition);
    transition.evidenceHash = transitionEvidenceHash(transition);
    transitionRows.push(transition);

    if (correctedComplete && !conflicts.length) {
      lastCorrectedState = {
        receivableAmount: { known: true, value: correctedPlain.receivableAmount, field: 'reconstructed_previous' },
        cashAmount: { known: true, value: correctedPlain.cashAmount, field: 'reconstructed_previous' },
        bankAmount: { known: true, value: correctedPlain.bankAmount, field: 'reconstructed_previous' },
        rewardAmount: { known: true, value: correctedPlain.rewardAmount, field: 'reconstructed_previous' },
        returnAmount: { known: true, value: correctedPlain.returnAmount, field: 'reconstructed_previous' },
        debtAmount: { known: correctedPlain.debtAmount !== null, value: correctedPlain.debtAmount || 0, field: 'reconstructed_previous' },
        version: toVersion,
        source: rowId(version) || rowId(correction)
      };
      stateByVersion.set(toVersion, lastCorrectedState);
      lastVersion = toVersion;
    }
  }
  return transitionRows;
}

module.exports = {
  text,
  money,
  stableJson,
  sha256,
  correctionId,
  correctionCode,
  orderId,
  orderCode,
  versionNo,
  embeddedOriginalState,
  stateFromVersion,
  findVersionForCorrection,
  reconstructHistoricalTransitions,
  transitionEvidenceHash,
  lineageHash,
  resolveActualPredecessor,
  _internal: {
    hasOwnValue, firstMoney, previousStateFromCorrection, correctedStateFromCorrection,
    plainState, coreStateComplete, detectCorrectionVersionConflicts, stateMatchesPlain,
    sourceOriginalVersion, directPredecessorVersion, directPredecessorId, predecessorCandidates
  }
};
