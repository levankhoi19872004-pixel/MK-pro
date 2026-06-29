'use strict';

const ArLedger = require('../../models/ArLedger');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

const LEDGER_TYPE = 'ar_external_debt';
const LEDGER_TYPE_CANONICAL = 'AR-EXTERNAL-DEBT';
const SOURCE_TYPE = 'externalDebt';
const ACTIVE_STATUSES = new Set(['', 'active', 'posted', 'confirmed']);
const INACTIVE_STATUSES = new Set(['void', 'reversed', 'cancelled', 'canceled', 'deleted', 'removed']);

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function compact(value = '') {
  return lower(value).replace(/[^a-z0-9]+/g, '');
}

function money(value) {
  return Math.round(toNumber(value));
}

function fail(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.status = code && code.startsWith('P0_') ? 409 : 400;
  err.details = details;
  return err;
}

function normalizeSourceType(value) {
  const normalized = compact(value);
  if (normalized === 'externaldebt' || normalized === 'externaldebtorder') return SOURCE_TYPE;
  return clean(value);
}

function actorLabel(actor = {}) {
  if (typeof actor === 'string') return clean(actor);
  return clean(actor.username || actor.name || actor.fullName || actor.code || actor.id || actor._id || 'system');
}

function sourceIdFrom(input = {}) {
  return clean(input.sourceId || input.externalDebtId || input.externalDebtOrderId || input.orderId || input.refId || '');
}

function sourceCodeFrom(input = {}) {
  return clean(input.sourceCode || input.externalDebtCode || input.externalDebtOrderCode || input.orderCode || input.refCode || '');
}

function buildExternalDebtIdempotencyKey(input = {}) {
  const sourceId = sourceIdFrom(input);
  const sourceCode = sourceCodeFrom(input);
  const sourceKey = clean(sourceId || sourceCode);
  if (!sourceKey) return '';
  return clean(input.idempotencyKey) || `${LEDGER_TYPE_CANONICAL}:${sourceKey}`;
}

function validateExternalDebtInput(input = {}) {
  const sourceType = normalizeSourceType(input.sourceType);
  const sourceId = sourceIdFrom(input);
  const sourceCode = sourceCodeFrom(input);
  const customerId = clean(input.customerId);
  const customerCode = clean(input.customerCode);
  const customerName = clean(input.customerName);
  const amount = money(input.amount ?? input.debit ?? input.totalAmount);
  const date = dateUtil.toDateOnly(input.date || input.documentDate || input.createdAt || '');
  const reason = clean(input.reason || input.reasonText || input.note);
  const createdBy = input.createdBy || input.actor || input.user || '';

  if (sourceType !== SOURCE_TYPE) throw fail('VALIDATION_EXTERNAL_DEBT_SOURCE_TYPE_REQUIRED', 'postExternalDebt yêu cầu sourceType="externalDebt".', { sourceType: input.sourceType });
  if (!sourceId && !sourceCode) throw fail('VALIDATION_EXTERNAL_DEBT_SOURCE_REQUIRED', 'postExternalDebt yêu cầu sourceId hoặc sourceCode rõ ràng.');
  if (!customerId) throw fail('VALIDATION_EXTERNAL_DEBT_CUSTOMER_ID_REQUIRED', 'postExternalDebt yêu cầu customerId.');
  if (!customerCode) throw fail('VALIDATION_EXTERNAL_DEBT_CUSTOMER_CODE_REQUIRED', 'postExternalDebt yêu cầu customerCode.');
  if (!customerName) throw fail('VALIDATION_EXTERNAL_DEBT_CUSTOMER_NAME_REQUIRED', 'postExternalDebt yêu cầu customerName.');
  if (amount <= 0) throw fail('VALIDATION_EXTERNAL_DEBT_AMOUNT_REQUIRED', 'postExternalDebt yêu cầu amount > 0.');
  if (!date) throw fail('VALIDATION_EXTERNAL_DEBT_DATE_REQUIRED', 'postExternalDebt yêu cầu date hợp lệ.');
  if (!reason) throw fail('VALIDATION_EXTERNAL_DEBT_REASON_REQUIRED', 'postExternalDebt yêu cầu reason.');
  if (!actorLabel(createdBy)) throw fail('VALIDATION_EXTERNAL_DEBT_CREATED_BY_REQUIRED', 'postExternalDebt yêu cầu createdBy.');

  const idempotencyKey = buildExternalDebtIdempotencyKey({ ...input, sourceId, sourceCode });
  if (!idempotencyKey) throw fail('VALIDATION_EXTERNAL_DEBT_IDEMPOTENCY_REQUIRED', 'postExternalDebt không build được idempotencyKey.');

  return {
    sourceType,
    sourceId,
    sourceCode,
    customerId,
    customerCode,
    customerName,
    amount,
    date,
    reason,
    createdBy,
    idempotencyKey
  };
}

function isInactive(row = {}) {
  if (!row) return false;
  const statuses = [row.status, row.accountingStatus, row.lifecycleStatus].map(lower).filter(Boolean);
  return row.isDeleted === true || row.reversed === true || Boolean(row.deletedAt)
    || statuses.some((status) => INACTIVE_STATUSES.has(status));
}

function isActive(row = {}) {
  if (!row || isInactive(row)) return false;
  const status = lower(row.status);
  return ACTIVE_STATUSES.has(status) || !status;
}

function conflictFields(existing = {}, normalized = {}) {
  const conflicts = [];
  if (money(existing.amount ?? existing.debit) !== normalized.amount) conflicts.push('amount');
  if (clean(existing.customerId) && clean(existing.customerId) !== normalized.customerId) conflicts.push('customerId');
  if (clean(existing.customerCode) && clean(existing.customerCode) !== normalized.customerCode) conflicts.push('customerCode');
  if (dateUtil.toDateOnly(existing.date || existing.documentDate || '') && dateUtil.toDateOnly(existing.date || existing.documentDate || '') !== normalized.date) conflicts.push('date');
  if (clean(existing.sourceId) && normalized.sourceId && clean(existing.sourceId) !== normalized.sourceId) conflicts.push('sourceId');
  if (clean(existing.sourceCode) && normalized.sourceCode && clean(existing.sourceCode) !== normalized.sourceCode) conflicts.push('sourceCode');
  return conflicts;
}

function createOptions(options = {}) {
  return options.session ? { session: options.session } : {};
}

function applySession(query, session) {
  return session && query && typeof query.session === 'function' ? query.session(session) : query;
}

async function queryLeanOne(query, session) {
  if (!query || !ArLedger || typeof ArLedger.findOne !== 'function') return null;
  const q = applySession(ArLedger.findOne(query), session);
  if (q && typeof q.lean === 'function') return q.lean();
  return q;
}

async function findExistingExternalDebt(normalized = {}, options = {}) {
  const or = [
    { idempotencyKey: normalized.idempotencyKey }
  ];
  if (normalized.sourceId) or.push({ sourceType: SOURCE_TYPE, sourceId: normalized.sourceId, type: LEDGER_TYPE });
  if (normalized.sourceCode) or.push({ sourceType: SOURCE_TYPE, sourceCode: normalized.sourceCode, type: LEDGER_TYPE });
  const ledgerId = externalDebtLedgerId(normalized);
  const ledgerCode = externalDebtLedgerCode(normalized);
  if (ledgerId) or.push({ id: ledgerId });
  if (ledgerCode) or.push({ code: ledgerCode });

  return queryLeanOne({ $or: or }, options.session);
}

function externalDebtLedgerId(normalized = {}, input = {}) {
  const supplied = clean(input.ledgerId || input.arLedgerId);
  if (supplied) return supplied.startsWith('AR-EXTERNAL-') ? supplied : `AR-EXTERNAL-${supplied}`;
  const sourceKey = clean(normalized.sourceId || normalized.sourceCode);
  return sourceKey ? `AR-EXTERNAL-${sourceKey}` : '';
}

function externalDebtLedgerCode(normalized = {}, input = {}) {
  const supplied = clean(input.ledgerCode || input.arLedgerCode);
  if (supplied) return supplied.startsWith('AR-EXTERNAL-') ? supplied : `AR-EXTERNAL-${supplied}`;
  const sourceKey = clean(normalized.sourceCode || normalized.sourceId);
  return sourceKey ? `AR-EXTERNAL-${sourceKey}` : '';
}

function buildExternalDebtLedgerEntry(input = {}, normalized = null) {
  const data = normalized || validateExternalDebtInput(input);
  const now = dateUtil.nowIso();
  const createdByLabel = actorLabel(data.createdBy);
  const note = clean(input.note || data.reason);
  const refType = clean(input.refType || 'EXTERNAL_DEBT_ORDER');
  const ledgerId = externalDebtLedgerId(data, input);
  const ledgerCode = externalDebtLedgerCode(data, input);

  return {
    tenantId: clean(input.tenantId),
    id: ledgerId,
    code: ledgerCode,
    type: LEDGER_TYPE,
    ledgerType: LEDGER_TYPE_CANONICAL,
    category: LEDGER_TYPE_CANONICAL,
    direction: 'debit',
    account: 'AR',
    orderType: 'external_debt',
    refType,
    refId: clean(input.refId || data.sourceId || data.sourceCode),
    refCode: clean(input.refCode || data.sourceCode || data.sourceId),
    sourceType: SOURCE_TYPE,
    sourceModel: clean(input.sourceModel || 'ExternalDebtOrder'),
    sourceId: data.sourceId,
    sourceCode: data.sourceCode,
    orderId: clean(input.orderId || data.sourceId),
    orderCode: clean(input.orderCode || data.sourceCode),
    salesOrderId: clean(input.salesOrderId || data.sourceId),
    salesOrderCode: clean(input.salesOrderCode || data.sourceCode),
    externalDebtId: data.sourceId,
    externalDebtCode: data.sourceCode,
    customerId: data.customerId,
    customerCode: data.customerCode,
    customerName: data.customerName,
    salesStaffCode: clean(input.salesStaffCode || input.salesmanCode),
    salesStaffName: clean(input.salesStaffName || input.salesmanName),
    salesmanCode: clean(input.salesmanCode || input.salesStaffCode),
    salesmanName: clean(input.salesmanName || input.salesStaffName),
    deliveryStaffCode: clean(input.deliveryStaffCode),
    deliveryStaffName: clean(input.deliveryStaffName),
    date: data.date,
    debit: data.amount,
    credit: 0,
    amount: data.amount,
    reason: data.reason,
    reasonText: clean(input.reasonText || data.reason),
    note,
    status: clean(input.status || 'posted'),
    accountingConfirmed: input.accountingConfirmed ?? true,
    accountingStatus: clean(input.accountingStatus || 'confirmed'),
    idempotencyKey: data.idempotencyKey,
    source: clean(input.source || 'externalDebtArPostingService'),
    createdBy: input.createdBy,
    auditTrail: [
      ...(Array.isArray(input.auditTrail) ? input.auditTrail : []),
      {
        action: 'post_external_debt',
        at: now,
        by: createdByLabel,
        sourceType: SOURCE_TYPE,
        sourceId: data.sourceId,
        sourceCode: data.sourceCode,
        idempotencyKey: data.idempotencyKey,
        amount: data.amount
      }
    ],
    metadata: {
      ...(input.metadata || {}),
      postingContract: 'externalDebt/v1',
      sourceTypeCanonical: SOURCE_TYPE
    },
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function assertNoConflict(existing = {}, normalized = {}) {
  if (!existing || !isActive(existing)) return;
  const conflicts = conflictFields(existing, normalized);
  if (conflicts.length) {
    throw fail('P0_AR_EXTERNAL_DEBT_CONFLICT', 'External debt ledger conflict: cùng idempotency/source nhưng amount/customer/date/source khác nhau.', {
      conflicts,
      idempotencyKey: normalized.idempotencyKey,
      sourceId: normalized.sourceId,
      sourceCode: normalized.sourceCode,
      existing: {
        id: clean(existing.id),
        code: clean(existing.code),
        amount: existing.amount,
        debit: existing.debit,
        customerId: clean(existing.customerId),
        customerCode: clean(existing.customerCode),
        date: clean(existing.date),
        sourceId: clean(existing.sourceId),
        sourceCode: clean(existing.sourceCode),
        idempotencyKey: clean(existing.idempotencyKey)
      }
    });
  }
}

async function createExternalDebtLedger(input = {}, options = {}) {
  const normalized = validateExternalDebtInput(input);
  const existing = await findExistingExternalDebt(normalized, options);
  if (existing && isActive(existing)) {
    assertNoConflict(existing, normalized);
    return options.returnResult
      ? { posted: false, created: false, reason: 'existing_idempotency_or_source', entry: existing, idempotencyKey: normalized.idempotencyKey }
      : existing;
  }

  const payload = buildExternalDebtLedgerEntry(input, normalized);
  try {
    const [doc] = await ArLedger.create([payload], createOptions(options));
    const entry = typeof doc?.toObject === 'function' ? doc.toObject() : doc;
    return options.returnResult
      ? { posted: true, created: true, reason: 'created_external_debt_ledger', entry, idempotencyKey: normalized.idempotencyKey }
      : entry;
  } catch (err) {
    if (err && err.code === 11000) {
      const duplicate = await findExistingExternalDebt(normalized, options);
      if (duplicate && isActive(duplicate)) {
        assertNoConflict(duplicate, normalized);
        return options.returnResult
          ? { posted: false, created: false, reason: 'existing_after_duplicate_key', entry: duplicate, idempotencyKey: normalized.idempotencyKey }
          : duplicate;
      }
    }
    throw err;
  }
}

module.exports = {
  LEDGER_TYPE,
  LEDGER_TYPE_CANONICAL,
  SOURCE_TYPE,
  createExternalDebtLedger,
  postExternalDebt: createExternalDebtLedger,
  buildExternalDebtIdempotencyKey,
  buildExternalDebtLedgerEntry,
  validateExternalDebtInput,
  findExistingExternalDebt,
  _internal: {
    clean,
    money,
    normalizeSourceType,
    sourceIdFrom,
    sourceCodeFrom,
    externalDebtLedgerId,
    externalDebtLedgerCode,
    conflictFields,
    isActive
  }
};
