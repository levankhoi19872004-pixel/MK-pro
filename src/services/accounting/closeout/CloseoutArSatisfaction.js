'use strict';

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

function entryId(row = {}) {
  return clean(row.id || row.code || row._id || row.ledgerId || row.entryId);
}

function intentKey(row = {}) {
  return clean(row.idempotencyKey || row.key);
}

function normalizeIntent(row = {}) {
  return {
    idempotencyKey: intentKey(row),
    orderId: clean(row.orderId || row.salesOrderId || row.sourceId),
    orderCode: clean(row.orderCode || row.salesOrderCode || row.sourceCode),
    category: clean(row.category || row.ledgerType),
    debit: money(row.debit),
    credit: money(row.credit),
    amount: money(row.amount)
  };
}

function normalizePostingResult(row = {}) {
  const entry = row.entry || row.ledger || row;
  const idempotencyKey = clean(row.idempotencyKey || entry.idempotencyKey);
  return {
    idempotencyKey,
    created: row.created === true || row.posted === true || row.arPosted === true,
    alreadyExists: row.alreadyExists === true || row.existing === true || row.arAlreadyExists === true,
    entry,
    entryId: entryId(entry),
    reasonCode: clean(row.reasonCode)
  };
}

function evaluateDebtReconcile(result = {}) {
  if (!result || typeof result !== 'object' || !Object.keys(result).length) {
    return {
      required: false,
      satisfied: true,
      posted: false,
      alreadyExists: false,
      noopValid: true,
      reasonCode: 'NO_DEBT_DELTA',
      entryIds: [],
      idempotencyKeys: []
    };
  }

  const ledger = result.ledger || result.debtAdjustmentLedger || null;
  const key = clean(result.idempotencyKey || ledger?.idempotencyKey || result.diagnostic?.idempotencyKey);
  if (result.posted === true) {
    return {
      required: true,
      satisfied: true,
      posted: true,
      alreadyExists: false,
      noopValid: false,
      reasonCode: 'POSTED',
      entryIds: [entryId(ledger)].filter(Boolean),
      idempotencyKeys: [key].filter(Boolean)
    };
  }
  if (result.skippedAlreadyReconciled === true || result.skipReason === 'IDEMPOTENCY_KEY_EXISTS_AND_BALANCE_OK') {
    return {
      required: true,
      satisfied: true,
      posted: false,
      alreadyExists: true,
      noopValid: false,
      reasonCode: 'RECONCILED_ALREADY',
      entryIds: [entryId(ledger)].filter(Boolean),
      idempotencyKeys: [key].filter(Boolean)
    };
  }
  if (result.skippedAlreadyFixed === true || result.skipReason === 'NO_DEBT_DELTA') {
    return {
      required: false,
      satisfied: true,
      posted: false,
      alreadyExists: false,
      noopValid: true,
      reasonCode: result.zeroToleranceApplied === true ? 'ZERO_TOLERANCE' : 'NO_DEBT_DELTA',
      entryIds: [],
      idempotencyKeys: [key].filter(Boolean)
    };
  }
  if (result.manualReviewRequired === true || result.needsAdjustment === true) {
    return {
      required: true,
      satisfied: false,
      posted: false,
      alreadyExists: false,
      noopValid: false,
      reasonCode: clean(result.skipReason || result.reasonCode || 'UNKNOWN') || 'UNKNOWN',
      entryIds: [],
      idempotencyKeys: [key].filter(Boolean)
    };
  }
  return {
    required: false,
    satisfied: true,
    posted: false,
    alreadyExists: false,
    noopValid: true,
    reasonCode: 'NO_DEBT_DELTA',
    entryIds: [],
    idempotencyKeys: [key].filter(Boolean)
  };
}

function evaluateArSatisfaction({
  expectedArIntents = [],
  expectedArLedgers = [],
  arPostingResults = [],
  debtReconcileResult = null
} = {}) {
  const intents = (Array.isArray(expectedArIntents) && expectedArIntents.length ? expectedArIntents : expectedArLedgers)
    .map(normalizeIntent)
    .filter((row) => row.idempotencyKey);
  const evidence = new Map((Array.isArray(arPostingResults) ? arPostingResults : [])
    .map(normalizePostingResult)
    .filter((row) => row.idempotencyKey)
    .map((row) => [row.idempotencyKey, row]));

  const missingIntents = [];
  const arEntryIds = [];
  const arIdempotencyKeys = [];
  let arPosted = false;
  let arAlreadyExists = false;

  for (const intent of intents) {
    arIdempotencyKeys.push(intent.idempotencyKey);
    const row = evidence.get(intent.idempotencyKey);
    const satisfied = row && (row.created === true || row.alreadyExists === true);
    if (!satisfied) {
      missingIntents.push({
        ...intent,
        created: row ? row.created === true : false,
        alreadyExists: row ? row.alreadyExists === true : false,
        reasonCode: row ? clean(row.reasonCode || 'UNKNOWN') || 'UNKNOWN' : 'MISSING_EVIDENCE'
      });
      continue;
    }
    if (row.created) arPosted = true;
    if (row.alreadyExists) arAlreadyExists = true;
    if (row.entryId) arEntryIds.push(row.entryId);
  }

  const reconcile = evaluateDebtReconcile(debtReconcileResult || {});
  arPosted = arPosted || reconcile.posted;
  arAlreadyExists = arAlreadyExists || reconcile.alreadyExists;
  arEntryIds.push(...reconcile.entryIds);
  arIdempotencyKeys.push(...reconcile.idempotencyKeys);

  const arRequired = intents.length > 0 || reconcile.required;
  const arSatisfied = missingIntents.length === 0 && reconcile.satisfied;
  const arNoopValid = !arRequired || reconcile.noopValid === true;
  const arReasonCode = !arSatisfied
    ? (missingIntents.length ? 'UNKNOWN' : reconcile.reasonCode || 'UNKNOWN')
    : (arPosted ? 'POSTED'
      : (arAlreadyExists ? 'ALREADY_EXISTS'
        : (reconcile.reasonCode || 'NO_AR_REQUIRED')));

  return {
    arRequired,
    arSatisfied,
    arPosted,
    arAlreadyExists,
    arNoopValid,
    arReasonCode,
    arEntryIds: Array.from(new Set(arEntryIds.filter(Boolean))),
    arIdempotencyKeys: Array.from(new Set(arIdempotencyKeys.filter(Boolean))),
    expectedIntentCount: intents.length + (reconcile.required ? 1 : 0),
    satisfiedIntentCount: intents.length - missingIntents.length + (reconcile.required && reconcile.satisfied ? 1 : 0),
    missingIntents
  };
}

module.exports = {
  evaluateArSatisfaction,
  _internal: {
    normalizeIntent,
    normalizePostingResult,
    evaluateDebtReconcile
  }
};
