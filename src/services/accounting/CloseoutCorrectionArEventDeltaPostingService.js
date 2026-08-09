'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const arPostingService = require('../arPosting.service');
const arLedgerReadService = require('../arLedgerRead.service');
const { resolveCanonicalArOrderIdentity } = require('../../domain/ar/arOrderIdentity');

const CATEGORY = 'AR-ADJUSTMENT';
const SOURCE_TYPE = 'DELIVERY_CLOSEOUT_CORRECTION';
const ZERO_TOLERANCE = 1000;

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function safeToken(value = '') {
  return clean(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

function actorName(actor = {}) {
  if (typeof actor === 'string') return clean(actor) || 'system';
  return clean(actor.name || actor.fullName || actor.username || actor.email || actor.id || actor.code || actor.role || 'system');
}

function correctionFinancialDeltas(correction = {}) {
  const metadata = correction.metadata && typeof correction.metadata === 'object' ? correction.metadata : {};
  return {
    receivableDelta: money(correction.receivableDeltaAmount ?? correction.receivableDelta ?? metadata.receivableDelta ?? 0),
    cashDelta: money(correction.cashDeltaAmount ?? correction.cashDelta ?? metadata.cashDelta ?? 0),
    bankDelta: money(correction.bankDeltaAmount ?? correction.bankDelta ?? metadata.bankDelta ?? 0),
    rewardDelta: money(correction.rewardDeltaAmount ?? correction.rewardDelta ?? metadata.rewardDelta ?? 0),
    returnDelta: money(correction.returnAdjustmentAmount ?? correction.returnDeltaAmount ?? correction.returnDelta ?? metadata.returnDelta ?? 0)
  };
}

/**
 * AR ownership contract for post-closeout correction:
 * - receivable/payment/reward changes belong to the correction event now;
 * - return changes belong to returnOrders -> returnArPostingService -> AR-RETURN
 *   when accounting confirms that return.
 *
 * Including returnDelta here would double-count the same return business event.
 */
function computeCorrectionOwnedDebtDelta(correction = {}) {
  const deltas = correctionFinancialDeltas(correction);
  return money(deltas.receivableDelta - deltas.cashDelta - deltas.bankDelta - deltas.rewardDelta);
}

function correctionIdentity(correction = {}) {
  return {
    id: clean(correction.id || correction.correctionId || correction._id || correction.code || correction.correctionCode),
    code: clean(correction.correctionCode || correction.code || correction.id || correction.correctionId)
  };
}

function eventIdempotencyKey(order = {}, correction = {}, version = {}) {
  const identity = resolveCanonicalArOrderIdentity({ order });
  const correctionRef = correctionIdentity(correction);
  const versionNo = Number(
    correction.newCloseoutVersion
      ?? version.closeoutVersion
      ?? version.sourceVersion
      ?? version.version
      ?? 1
  ) || 1;
  return `${CATEGORY}:${SOURCE_TYPE}:${safeToken(identity.orderId || identity.orderCode)}:${safeToken(correctionRef.id || correctionRef.code)}:v${versionNo}`;
}

async function inspectCanonicalArBalance(order = {}, options = {}) {
  const identity = resolveCanonicalArOrderIdentity({ order, allocation: options.allocation });
  if (!identity.lookupKeys.length) {
    const err = new Error('Không xác định được canonical order identity để đọc AR trước closeout correction.');
    err.code = 'CORRECTION_EVENT_DELTA_ORDER_IDENTITY_MISSING';
    err.status = 409;
    throw err;
  }
  const inspection = await arLedgerReadService.inspectActiveDebtReadModelLedgersByOrderKeys(
    identity.lookupKeys,
    { customerCode: clean(order.customerCode || options.customerCode), status: 'all' },
    { session: options.session }
  );
  const currentArBalance = arLedgerReadService._internal.sumCanonicalBalanceRows(inspection.canonicalLedgers || []);
  return { identity, inspection, currentArBalance: money(currentArBalance) };
}

function buildEventDeltaLedger({ order = {}, correction = {}, version = {} } = {}, options = {}) {
  const delta = computeCorrectionOwnedDebtDelta(correction);
  if (delta === 0) return null;

  const identity = resolveCanonicalArOrderIdentity({ order, allocation: options.allocation });
  const correctionRef = correctionIdentity(correction);
  const orderIdentity = clean(identity.orderId || identity.orderCode);
  const orderCode = clean(identity.orderCode || identity.orderId);
  const amount = Math.abs(delta);
  const isDebit = delta > 0;
  const now = options.now || dateUtil.nowIso();
  const actor = actorName(options.actor || correction.createdBy || 'accountant');
  const versionNo = Number(correction.newCloseoutVersion ?? version.closeoutVersion ?? version.sourceVersion ?? version.version ?? 1) || 1;
  const idempotencyKey = eventIdempotencyKey(order, correction, version);
  const ledgerCode = `AR-ADJ-DCOC-${safeToken(orderCode)}-${safeToken(correctionRef.code || correctionRef.id)}-v${versionNo}`;
  const deltas = correctionFinancialDeltas(correction);

  if (!orderIdentity || !orderCode || !clean(correction.customerCode || order.customerCode)) {
    const err = new Error('Thiếu order/customer identity để post canonical closeout correction event delta.');
    err.code = 'CORRECTION_EVENT_DELTA_IDENTITY_MISSING';
    err.status = 409;
    throw err;
  }

  return {
    id: ledgerCode,
    code: ledgerCode,
    account: 'AR',
    category: CATEGORY,
    ledgerType: CATEGORY,
    entryType: 'normal',
    type: 'ar_closeout_correction_event_delta',
    sourceType: SOURCE_TYPE,
    // Keep business order identity in source/order fields so Debt New groups the
    // event with the original order. Correction identity belongs in ref/correction fields.
    sourceId: orderIdentity,
    sourceCode: orderCode,
    sourceModel: 'deliveryCloseoutCorrections',
    refType: SOURCE_TYPE,
    refId: correctionRef.id,
    refCode: correctionRef.code,
    orderId: orderIdentity,
    orderCode,
    salesOrderId: clean(identity.salesOrderId || orderIdentity),
    salesOrderCode: clean(identity.salesOrderCode || orderCode),
    customerId: clean(correction.customerId || order.customerId),
    customerCode: clean(correction.customerCode || order.customerCode),
    customerName: clean(correction.customerName || order.customerName),
    salesStaffCode: clean(correction.salesStaffCode || order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: clean(correction.salesStaffName || order.salesStaffName || order.salesmanName || order.nvbhName),
    salesmanCode: clean(correction.salesStaffCode || order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesmanName: clean(correction.salesStaffName || order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: clean(correction.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: clean(correction.deliveryStaffName || order.deliveryStaffName || order.deliveryName || order.nvghName),
    deliveryDate: dateUtil.toDateOnly(correction.deliveryDate || order.deliveryDate || order.orderDate || now),
    date: dateUtil.toDateOnly(correction.deliveryDate || order.deliveryDate || order.orderDate || now),
    debit: isDebit ? amount : 0,
    credit: isDebit ? 0 : amount,
    amount,
    direction: isDebit ? 'debit' : 'credit',
    amountField: isDebit ? 'debit' : 'credit',
    active: true,
    reversed: false,
    status: 'posted',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingConfirmedBy: actor,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    source: 'closeout_correction_ar_event_delta_posting_service',
    accountingBatchId: clean(options.accountingBatchId) || `AR-DCOC-EVENT-${safeToken(correctionRef.id || correctionRef.code)}-v${versionNo}`,
    idempotencyKey,
    correctionId: correctionRef.id,
    correctionCode: correctionRef.code,
    reason: clean(correction.auditReason || correction.reason || options.reason || 'Post-closeout correction event delta'),
    reasonText: clean(correction.auditReason || correction.reason || options.reason),
    note: clean(options.note || correction.note || `Canonical EVENT_DELTA AR for closeout correction ${correctionRef.code || correctionRef.id}`),
    metadata: {
      contractVersion: 'R1_EVENT_DELTA_V1',
      postingPolicy: 'EVENT_DELTA_ONLY',
      expectedArFormula: 'canonicalArBeforeCorrection + correctionOwnedDebtDelta',
      correctionOwnedDebtDelta: delta,
      receivableDelta: deltas.receivableDelta,
      cashDelta: deltas.cashDelta,
      bankDelta: deltas.bankDelta,
      rewardDelta: deltas.rewardDelta,
      returnDelta: deltas.returnDelta,
      returnDeltaExcluded: true,
      returnArOwner: 'returnOrders/returnArPostingService/AR-RETURN',
      preservesConfirmedReceipts: true,
      excludesCurrentDebtBalanceRecalculation: true,
      excludesCloseoutSnapshotTargeting: true,
      correctionId: correctionRef.id,
      correctionCode: correctionRef.code,
      closeoutVersion: versionNo,
      zeroTolerance: Number(options.zeroTolerance || ZERO_TOLERANCE)
    }
  };
}

async function findExistingCorrectionEventDeltaLedger({ order = {}, correction = {}, version = {} } = {}, options = {}) {
  const idempotencyKey = eventIdempotencyKey(order, correction, version);
  const rows = await arLedgerReadService.findArLedgerRowsByRawMatch(
    { idempotencyKey },
    { session: options.session, limit: 2 }
  );
  return (Array.isArray(rows) ? rows : []).find((row) => clean(row.idempotencyKey) === idempotencyKey) || null;
}

async function postCorrectionEventDelta({ order = {}, correction = {}, version = {}, allocation = null } = {}, options = {}) {
  const session = options.session;
  const zeroTolerance = Number(options.zeroTolerance || ZERO_TOLERANCE);
  const ledger = buildEventDeltaLedger({ order, correction, version }, { ...options, allocation, zeroTolerance });
  const before = await inspectCanonicalArBalance(order, { ...options, allocation, session });

  if (!ledger) {
    return {
      posted: false,
      skipped: true,
      reason: 'ZERO_CORRECTION_OWNED_DEBT_DELTA',
      category: CATEGORY,
      correctionOwnedDebtDelta: 0,
      returnDeltaExcluded: correctionFinancialDeltas(correction).returnDelta !== 0,
      arBefore: before.currentArBalance,
      expectedArAfter: before.currentArBalance,
      arAfter: before.currentArBalance,
      ledger: null,
      inspectionBefore: before.inspection,
      inspectionAfter: before.inspection
    };
  }

  // Detect retry before posting so the invariant does not apply the same event
  // twice conceptually. arPostingService still owns the authoritative payload
  // equality/idempotency guard.
  const existing = await findExistingCorrectionEventDeltaLedger({ order, correction, version }, { session });
  const eventAlreadyApplied = Boolean(existing);
  const expectedArAfter = money(before.currentArBalance + (eventAlreadyApplied ? 0 : computeCorrectionOwnedDebtDelta(correction)));
  const saved = await arPostingService.postArLedgerEntry(ledger, { session });
  const after = await inspectCanonicalArBalance(order, { ...options, allocation, session });

  if (money(after.currentArBalance) !== expectedArAfter) {
    const err = new Error('Canonical AR sau closeout correction không bằng AR trước correction cộng business-event delta; transaction phải rollback.');
    err.code = 'CORRECTION_EVENT_DELTA_AR_INVARIANT_FAILED';
    err.status = 409;
    err.data = {
      orderId: before.identity.orderId,
      orderCode: before.identity.orderCode,
      correctionId: correctionIdentity(correction).id,
      arBefore: before.currentArBalance,
      correctionOwnedDebtDelta: computeCorrectionOwnedDebtDelta(correction),
      eventAlreadyApplied,
      expectedArAfter,
      actualArAfter: after.currentArBalance,
      deviation: money(after.currentArBalance - expectedArAfter),
      zeroTolerance,
      returnDeltaExcluded: true
    };
    throw err;
  }

  return {
    posted: !eventAlreadyApplied,
    idempotent: eventAlreadyApplied,
    skipped: false,
    category: CATEGORY,
    correctionOwnedDebtDelta: computeCorrectionOwnedDebtDelta(correction),
    returnDeltaExcluded: true,
    arBefore: before.currentArBalance,
    expectedArAfter,
    arAfter: after.currentArBalance,
    ledger: saved,
    inspectionBefore: before.inspection,
    inspectionAfter: after.inspection
  };
}

module.exports = {
  CATEGORY,
  SOURCE_TYPE,
  ZERO_TOLERANCE,
  correctionFinancialDeltas,
  computeCorrectionOwnedDebtDelta,
  eventIdempotencyKey,
  inspectCanonicalArBalance,
  buildEventDeltaLedger,
  findExistingCorrectionEventDeltaLedger,
  postCorrectionEventDelta,
  _internal: { clean, money, safeToken, actorName, correctionIdentity }
};
