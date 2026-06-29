'use strict';

const ArLedger = require('../../models/ArLedger');
const ArAdjustment = require('../../models/ArAdjustment');
const { makeId, toNumber } = require('../../utils/common.util');
const dateUtil = require('../../utils/date.util');
const { tenantIdOf } = require('../../utils/tenant.util');

const LEDGER_TYPE = 'AR-ADJUSTMENT';
const SOURCE_TYPE = 'adminCorrection';
const INACTIVE_STATUSES = new Set(['void', 'reversed', 'cancelled', 'canceled', 'deleted', 'removed']);

function text(value) {
  return String(value ?? '').trim();
}

function nowIso() {
  return dateUtil.nowIso ? dateUtil.nowIso() : new Date().toISOString();
}

function roundAmount(value) {
  const n = toNumber(value);
  return Math.round(n * 100) / 100;
}

function normalizeReasonCode(value) {
  const raw = text(value) || 'ADMIN_CORRECTION';
  return raw.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'ADMIN_CORRECTION';
}

function actorSnapshot(actor = {}) {
  if (!actor || typeof actor !== 'object') return {};
  return {
    id: text(actor.id || actor._id || actor.userId),
    username: text(actor.username || actor.userName),
    name: text(actor.fullName || actor.name || actor.displayName || actor.username),
    role: text(actor.role || actor.roleCode),
    staffCode: text(actor.staffCode || actor.code)
  };
}

function activeLedgerQuery(extra = {}) {
  return {
    ...extra,
    type: LEDGER_TYPE,
    status: { $nin: [...INACTIVE_STATUSES] },
    isDeleted: { $ne: true }
  };
}

function withSession(query, options = {}) {
  if (query && options.session && typeof query.session === 'function') query.session(options.session);
  return query;
}

function buildAdjustmentIdempotencyKey(input = {}) {
  const patch = input.proposedPatch || input.patch || {};
  const correctionId = text(input.correctionId || input.correctionCode || input.id || input.sourceId || patch.correctionId);
  const customerCode = text(input.customerCode || patch.customerCode || input.customerId || patch.customerId);
  const amount = roundAmount(input.amount ?? input.adjustAmount ?? patch.adjustAmount ?? patch.amount);
  const reasonCode = normalizeReasonCode(input.reasonCode || patch.reasonCode || input.correctionType || input.reasonCategory);
  if (!correctionId || !customerCode || !amount) return '';
  return `${LEDGER_TYPE}:${correctionId}:${customerCode}:${amount}:${reasonCode}`;
}

function normalizeArAdjustmentInput(input = {}, options = {}) {
  const patch = input.proposedPatch || input.patch || {};
  const actor = options.actor || input.actor || input.createdBy || {};
  const approvedBy = input.approvedBy || options.approvedBy || actor;
  const correctionId = text(input.correctionId || input.id || input.sourceId || patch.correctionId || input.correctionCode);
  const correctionCode = text(input.correctionCode || input.sourceCode || patch.correctionCode || correctionId);
  const customerId = text(input.customerId || patch.customerId || input.customerCode || patch.customerCode);
  const customerCode = text(input.customerCode || patch.customerCode || input.customerId || patch.customerId);
  const customerName = text(input.customerName || patch.customerName);
  const amount = roundAmount(input.amount ?? input.adjustAmount ?? patch.adjustAmount ?? patch.amount);
  const reasonCode = normalizeReasonCode(input.reasonCode || patch.reasonCode || input.correctionType || input.reasonCategory);
  const reasonText = text(input.reasonText || input.reason || patch.reasonText || patch.reason || input.note || options.reason);
  const idempotencyKey = text(input.idempotencyKey) || buildAdjustmentIdempotencyKey({
    ...input,
    correctionId,
    customerCode,
    amount,
    reasonCode
  });
  const isRollback = Boolean(input.isRollback || patch.isRollback || input.rollbackOf || patch.rollbackOf);
  const rollbackOf = text(input.rollbackOf || patch.rollbackOf);
  const now = nowIso();
  const direction = text(input.direction || patch.direction) || (amount >= 0 ? 'increase_debt' : 'decrease_debt');

  return {
    tenantId: tenantIdOf({ tenantId: input.tenantId || options.tenantId || actor.tenantId }),
    correctionId,
    correctionCode,
    customerId,
    customerCode,
    customerName,
    amount,
    direction,
    debit: amount > 0 ? Math.abs(amount) : 0,
    credit: amount < 0 ? Math.abs(amount) : 0,
    reasonCode,
    reasonText,
    sourceType: SOURCE_TYPE,
    sourceId: correctionId,
    sourceCode: correctionCode,
    idempotencyKey,
    createdBy: actorSnapshot(input.createdBy || actor),
    approvedBy: actorSnapshot(approvedBy),
    beforeDebt: Number.isFinite(Number(input.beforeDebt ?? patch.beforeDebt)) ? roundAmount(input.beforeDebt ?? patch.beforeDebt) : undefined,
    afterDebt: Number.isFinite(Number(input.afterDebt ?? patch.afterDebt)) ? roundAmount(input.afterDebt ?? patch.afterDebt) : undefined,
    isRollback,
    rollbackOf,
    originalAdjustmentId: text(input.originalAdjustmentId || patch.originalAdjustmentId),
    originalLedgerId: text(input.originalLedgerId || patch.originalLedgerId),
    auditTrail: Array.isArray(input.auditTrail) ? input.auditTrail : [],
    createdAt: text(input.createdAt) || now,
    approvedAt: text(input.approvedAt) || now,
    appliedAt: text(input.appliedAt) || now,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  };
}

function validateArAdjustment(input = {}, options = {}) {
  const normalized = normalizeArAdjustmentInput(input, options);
  if (!normalized.correctionId) {
    const err = new Error('AR adjustment cần correctionId/correctionCode để tạo idempotency key');
    err.status = 400;
    err.code = 'AR_ADJUSTMENT_MISSING_CORRECTION_ID';
    throw err;
  }
  if (!normalized.customerCode) {
    const err = new Error('AR adjustment cần customerCode/customerId');
    err.status = 400;
    err.code = 'AR_ADJUSTMENT_MISSING_CUSTOMER';
    throw err;
  }
  if (!normalized.amount) {
    const err = new Error('AR adjustment cần amount/adjustAmount khác 0');
    err.status = 400;
    err.code = 'AR_ADJUSTMENT_MISSING_AMOUNT';
    throw err;
  }
  if (!normalized.reasonText) {
    const err = new Error('AR adjustment cần reasonText/reason để audit');
    err.status = 400;
    err.code = 'AR_ADJUSTMENT_MISSING_REASON';
    throw err;
  }
  if (!normalized.idempotencyKey) {
    const err = new Error('AR adjustment không build được idempotencyKey');
    err.status = 400;
    err.code = 'AR_ADJUSTMENT_MISSING_IDEMPOTENCY_KEY';
    throw err;
  }
  return normalized;
}

async function findExistingAdjustment(idempotencyKey, options = {}) {
  const key = text(idempotencyKey);
  if (!key) return null;
  const query = ArLedger.findOne(activeLedgerQuery({ idempotencyKey: key }));
  const ledger = await withSession(query, options).lean();
  if (!ledger) return null;
  const adjQuery = ArAdjustment.findOne({ $or: [{ arLedgerId: ledger.id }, { arLedgerCode: ledger.code }, { correctionId: ledger.correctionId }, { correctionCode: ledger.correctionCode }] });
  const adjustment = await withSession(adjQuery, options).lean();
  return { ledger, adjustment, idempotent: true };
}

async function findActiveAdjustmentByCorrectionId(correctionId, options = {}) {
  const id = text(correctionId);
  if (!id) return null;
  const query = ArLedger.findOne(activeLedgerQuery({
    $or: [
      { correctionId: id },
      { sourceId: id },
      { refId: id }
    ]
  }));
  const ledger = await withSession(query, options).lean();
  if (!ledger) return null;
  const adjQuery = ArAdjustment.findOne({ $or: [{ arLedgerId: ledger.id }, { arLedgerCode: ledger.code }, { correctionId: id }] });
  const adjustment = await withSession(adjQuery, options).lean();
  return { ledger, adjustment };
}

function assertSameCorrectionPayload(existing = {}, normalized = {}) {
  if (!existing || !existing.ledger) return;
  const ledger = existing.ledger;
  const sameCustomer = text(ledger.customerCode || ledger.customerId) === normalized.customerCode;
  const sameAmount = roundAmount(ledger.amount) === normalized.amount;
  const sameKey = text(ledger.idempotencyKey) === normalized.idempotencyKey;
  if (sameCustomer && sameAmount && sameKey) return;
  const err = new Error('P0: cùng correctionId nhưng customer/amount/idempotencyKey khác nhau, dừng để tránh lệch công nợ');
  err.status = 409;
  err.code = 'P0_AR_ADJUSTMENT_CONFLICT';
  err.existing = {
    id: ledger.id,
    code: ledger.code,
    correctionId: ledger.correctionId || ledger.sourceId,
    customerCode: ledger.customerCode,
    amount: ledger.amount,
    idempotencyKey: ledger.idempotencyKey
  };
  err.incoming = {
    correctionId: normalized.correctionId,
    customerCode: normalized.customerCode,
    amount: normalized.amount,
    idempotencyKey: normalized.idempotencyKey
  };
  throw err;
}

function buildAuditTrail(normalized = {}, action = 'created') {
  return [
    ...normalized.auditTrail,
    {
      action,
      at: nowIso(),
      by: normalized.createdBy,
      approvedBy: normalized.approvedBy,
      reasonCode: normalized.reasonCode,
      reasonText: normalized.reasonText,
      idempotencyKey: normalized.idempotencyKey
    }
  ];
}

async function createArAdjustment(input = {}, options = {}) {
  const normalized = validateArAdjustment(input, options);

  const existingByKey = await findExistingAdjustment(normalized.idempotencyKey, options);
  if (existingByKey) {
    assertSameCorrectionPayload(existingByKey, normalized);
    return { ...existingByKey, created: false, reason: 'existing_idempotency_key' };
  }

  const existingByCorrection = await findActiveAdjustmentByCorrectionId(normalized.correctionId, options);
  if (existingByCorrection) {
    assertSameCorrectionPayload(existingByCorrection, normalized);
    return { ...existingByCorrection, created: false, reason: 'existing_correction_id' };
  }

  const ledgerId = makeId(normalized.isRollback ? 'ARADJRB' : 'ARADJ');
  const adjustmentId = makeId(normalized.isRollback ? 'ARADJREQRB' : 'ARADJREQ');
  const createdAt = nowIso();
  const createOptions = options.session ? { session: options.session } : undefined;
  const ledgerPayload = {
    id: ledgerId,
    tenantId: normalized.tenantId,
    code: ledgerId,
    type: LEDGER_TYPE,
    ledgerType: LEDGER_TYPE,
    category: LEDGER_TYPE,
    date: createdAt.slice(0, 10),
    account: 'AR',
    amount: normalized.amount,
    debit: normalized.debit,
    credit: normalized.credit,
    direction: normalized.direction,
    customerId: normalized.customerId,
    customerCode: normalized.customerCode,
    customerName: normalized.customerName,
    reasonCode: normalized.reasonCode,
    reasonText: normalized.reasonText,
    note: normalized.reasonText,
    refType: SOURCE_TYPE,
    refId: normalized.correctionId,
    refCode: normalized.correctionCode,
    source: SOURCE_TYPE,
    sourceType: SOURCE_TYPE,
    sourceId: normalized.correctionId,
    sourceCode: normalized.correctionCode,
    correctionId: normalized.correctionId,
    correctionCode: normalized.correctionCode,
    idempotencyKey: normalized.idempotencyKey,
    auditTrail: buildAuditTrail(normalized, normalized.isRollback ? 'rollback_created' : 'created'),
    createdBy: normalized.createdBy,
    approvedBy: normalized.approvedBy,
    status: 'active',
    accountingStatus: 'posted',
    isRollback: normalized.isRollback,
    rollbackOf: normalized.rollbackOf,
    originalAdjustmentId: normalized.originalAdjustmentId,
    originalLedgerId: normalized.originalLedgerId,
    createdAt,
    updatedAt: createdAt,
    metadata: {
      ...normalized.metadata,
      sourceBoundary: 'arAdjustmentService',
      rollbackOf: normalized.rollbackOf || normalized.metadata.rollbackOf || ''
    }
  };

  const [ledgerDoc] = await ArLedger.create([ledgerPayload], createOptions);
  const ledger = ledgerDoc && typeof ledgerDoc.toObject === 'function' ? ledgerDoc.toObject() : ledgerDoc;
  const beforeDebt = Number.isFinite(Number(normalized.beforeDebt)) ? normalized.beforeDebt : undefined;
  const afterDebt = Number.isFinite(Number(normalized.afterDebt)) ? normalized.afterDebt : (Number.isFinite(Number(beforeDebt)) ? beforeDebt + normalized.amount : undefined);

  const [adjustmentDoc] = await ArAdjustment.create([{
    id: adjustmentId,
    tenantId: normalized.tenantId,
    adjustmentCode: adjustmentId,
    correctionId: normalized.correctionId,
    correctionCode: normalized.correctionCode,
    customerId: normalized.customerId,
    customerCode: normalized.customerCode,
    customerName: normalized.customerName,
    beforeDebt,
    adjustAmount: normalized.amount,
    afterDebt,
    direction: normalized.direction,
    reason: normalized.reasonText,
    reasonCode: normalized.reasonCode,
    reasonText: normalized.reasonText,
    sourceType: SOURCE_TYPE,
    sourceId: normalized.correctionId,
    sourceCode: normalized.correctionCode,
    idempotencyKey: normalized.idempotencyKey,
    arLedgerId: ledger.id,
    arLedgerCode: ledger.code,
    adjustmentKind: normalized.direction,
    isRollback: normalized.isRollback,
    rollbackOf: normalized.rollbackOf,
    originalAdjustmentId: normalized.originalAdjustmentId,
    originalLedgerId: normalized.originalLedgerId,
    createdBy: normalized.createdBy,
    approvedBy: normalized.approvedBy,
    status: 'applied',
    createdAt: normalized.createdAt || createdAt,
    approvedAt: normalized.approvedAt || createdAt,
    appliedAt: normalized.appliedAt || createdAt,
    auditTrail: ledger.auditTrail,
    metadata: {
      ...normalized.metadata,
      arLedger: ledger,
      sourceBoundary: 'arAdjustmentService'
    }
  }], createOptions);
  const adjustment = adjustmentDoc && typeof adjustmentDoc.toObject === 'function' ? adjustmentDoc.toObject() : adjustmentDoc;
  return { ledger, adjustment, created: true, reason: normalized.isRollback ? 'rollback_created' : 'created' };
}

async function findOriginalAdjustment(adjustmentIdOrCorrection = {}, options = {}) {
  const ref = typeof adjustmentIdOrCorrection === 'object' && adjustmentIdOrCorrection !== null
    ? adjustmentIdOrCorrection
    : { id: adjustmentIdOrCorrection };
  const key = text(ref.adjustmentId || ref.id || ref.adjustmentCode || ref.correctionId || ref.correctionCode || ref.arLedgerId || ref.arLedgerCode);
  const correctionId = text(ref.correctionId || ref.id);
  const correctionCode = text(ref.correctionCode || ref.code);
  const ors = [];
  if (key) ors.push({ id: key }, { adjustmentCode: key }, { correctionId: key }, { correctionCode: key }, { arLedgerId: key }, { arLedgerCode: key });
  if (correctionId) ors.push({ correctionId });
  if (correctionCode) ors.push({ correctionCode });
  if (!ors.length) return null;

  const adjQuery = ArAdjustment.findOne({ $or: ors, isRollback: { $ne: true } });
  const adjustment = await withSession(adjQuery, options).lean();
  if (adjustment) {
    const ledgerQuery = ArLedger.findOne({ $or: [{ id: adjustment.arLedgerId }, { code: adjustment.arLedgerCode }, { correctionId: adjustment.correctionId }], type: LEDGER_TYPE });
    const ledger = await withSession(ledgerQuery, options).lean();
    return { adjustment, ledger };
  }

  const ledgerQuery = ArLedger.findOne({ $or: ors.map((row) => {
    if (row.arLedgerId) return { id: row.arLedgerId };
    if (row.arLedgerCode) return { code: row.arLedgerCode };
    return row;
  }), type: LEDGER_TYPE, isRollback: { $ne: true } });
  const ledger = await withSession(ledgerQuery, options).lean();
  if (!ledger) return null;
  return { ledger, adjustment: null };
}

async function findExistingRollback(original = {}, options = {}) {
  const adjustment = original.adjustment || {};
  const ledger = original.ledger || {};
  const keys = [
    adjustment.id,
    adjustment.adjustmentCode,
    adjustment.correctionId,
    adjustment.correctionCode,
    ledger.id,
    ledger.code,
    ledger.correctionId,
    ledger.correctionCode,
    ledger.idempotencyKey
  ].map(text).filter(Boolean);
  if (!keys.length) return null;
  const query = ArLedger.findOne(activeLedgerQuery({
    type: LEDGER_TYPE,
    isRollback: true,
    $or: [
      { rollbackOf: { $in: keys } },
      { originalAdjustmentId: { $in: keys } },
      { originalLedgerId: { $in: keys } },
      { 'metadata.rollbackOf': { $in: keys } }
    ]
  }));
  const rollbackLedger = await withSession(query, options).lean();
  if (!rollbackLedger) return null;
  const adjQuery = ArAdjustment.findOne({ $or: [{ arLedgerId: rollbackLedger.id }, { arLedgerCode: rollbackLedger.code }, { idempotencyKey: rollbackLedger.idempotencyKey }] });
  const rollbackAdjustment = await withSession(adjQuery, options).lean();
  return { ledger: rollbackLedger, adjustment: rollbackAdjustment, created: false, reason: 'already_rolled_back' };
}

async function rollbackArAdjustment(adjustmentId, options = {}) {
  const original = await findOriginalAdjustment(adjustmentId, options);
  if (!original || !original.ledger) {
    const err = new Error('Không tìm thấy AR adjustment gốc để rollback');
    err.status = 404;
    err.code = 'AR_ADJUSTMENT_ROLLBACK_ORIGINAL_NOT_FOUND';
    throw err;
  }
  if (original.ledger.isRollback || original.adjustment?.isRollback) {
    const err = new Error('Không rollback một bút toán rollback');
    err.status = 409;
    err.code = 'AR_ADJUSTMENT_ROLLBACK_OF_ROLLBACK_DENIED';
    throw err;
  }

  const existingRollback = await findExistingRollback(original, options);
  if (existingRollback) return existingRollback;

  const ledger = original.ledger;
  const adjustment = original.adjustment || {};
  const originalKey = text(ledger.idempotencyKey || adjustment.idempotencyKey || ledger.correctionId || adjustment.correctionId || ledger.id || adjustment.id);
  const rollbackCorrectionId = `ROLLBACK:${text(adjustment.correctionId || ledger.correctionId || ledger.sourceId || ledger.id)}`;
  const rollbackReason = text(options.reason || options.rollbackReason || `Rollback ${text(adjustment.correctionCode || ledger.correctionCode || ledger.code)}`);
  const rollbackInput = {
    tenantId: ledger.tenantId || adjustment.tenantId,
    correctionId: rollbackCorrectionId,
    correctionCode: `RB-${text(adjustment.correctionCode || ledger.correctionCode || ledger.code || adjustment.id)}`,
    customerId: ledger.customerId || adjustment.customerId,
    customerCode: ledger.customerCode || adjustment.customerCode,
    customerName: ledger.customerName || adjustment.customerName,
    amount: -roundAmount(ledger.amount ?? adjustment.adjustAmount),
    reasonCode: 'ROLLBACK',
    reasonText: rollbackReason,
    sourceId: rollbackCorrectionId,
    idempotencyKey: `${LEDGER_TYPE}-ROLLBACK:${originalKey}`,
    isRollback: true,
    rollbackOf: originalKey,
    originalAdjustmentId: text(adjustment.id || adjustment.adjustmentCode),
    originalLedgerId: text(ledger.id || ledger.code),
    createdBy: options.actor || options.createdBy || {},
    approvedBy: options.approvedBy || options.actor || {},
    metadata: {
      rollbackOf: originalKey,
      rollbackLedgerOf: ledger.id || ledger.code,
      rollbackAdjustmentOf: adjustment.id || adjustment.adjustmentCode || ''
    }
  };

  const result = await createArAdjustment(rollbackInput, options);
  const updateOptions = options.session ? { session: options.session } : undefined;
  if (adjustment.id || adjustment.correctionId || adjustment.correctionCode) {
    await ArAdjustment.updateMany({
      $or: [
        { id: adjustment.id },
        { adjustmentCode: adjustment.adjustmentCode },
        { correctionId: adjustment.correctionId },
        { correctionCode: adjustment.correctionCode }
      ].filter((row) => Object.values(row)[0])
    }, { $set: { status: 'rolled_back', rolledBackAt: nowIso(), rollbackLedgerId: result.ledger.id, rollbackLedgerCode: result.ledger.code } }, updateOptions);
  }
  await ArLedger.updateMany({
    $or: [
      { id: ledger.id },
      { code: ledger.code },
      { idempotencyKey: ledger.idempotencyKey }
    ].filter((row) => Object.values(row)[0])
  }, { $set: { rollbackStatus: 'rolled_back', rolledBackAt: nowIso(), rollbackLedgerId: result.ledger.id, rollbackLedgerCode: result.ledger.code } }, updateOptions);
  return result;
}

module.exports = {
  LEDGER_TYPE,
  SOURCE_TYPE,
  buildAdjustmentIdempotencyKey,
  validateArAdjustment,
  findExistingAdjustment,
  createArAdjustment,
  rollbackArAdjustment
};
