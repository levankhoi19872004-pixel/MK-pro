'use strict';

const crypto = require('node:crypto');

const MAX_IDEMPOTENCY_KEY_LENGTH = 512;
const MONEY_FIELDS = ['amount', 'debit', 'credit'];
const FINANCIAL_STRING_FIELDS = [
  'account', 'category', 'ledgerType', 'entryType', 'type', 'direction',
  'customerId', 'customerCode',
  'orderId', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'sourceType', 'sourceId', 'sourceCode', 'sourceModel',
  'refType', 'refId', 'refCode',
  'returnOrderId', 'returnOrderCode',
  'correctionId', 'correctionCode',
  'accountingStatus'
];
const FINANCIAL_BOOLEAN_FIELDS = ['accountingConfirmed', 'active', 'reversed', 'isDeleted', 'deleted'];

function clean(value = '') {
  return String(value ?? '').trim();
}

function createGuardError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.severity = 'P0';
  error.details = details;
  return error;
}

function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string') {
    throw createGuardError(
      'AR_LEDGER_IDEMPOTENCY_INVALID',
      'AR ledger idempotencyKey phải là chuỗi ổn định.',
      { receivedType: typeof value }
    );
  }
  const normalized = value.normalize('NFKC').trim();
  if (!normalized) {
    throw createGuardError('AR_LEDGER_IDEMPOTENCY_REQUIRED', 'AR ledger entry thiếu idempotencyKey.');
  }
  if (normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw createGuardError(
      'AR_LEDGER_IDEMPOTENCY_TOO_LONG',
      `AR ledger idempotencyKey vượt ${MAX_IDEMPOTENCY_KEY_LENGTH} ký tự.`,
      { length: normalized.length }
    );
  }
  if (/\s/u.test(normalized) || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    throw createGuardError(
      'AR_LEDGER_IDEMPOTENCY_UNSTABLE',
      'AR ledger idempotencyKey không được chứa khoảng trắng hoặc ký tự điều khiển.',
      { idempotencyKey: normalized }
    );
  }
  return normalized;
}

function normalizeMoney(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw createGuardError(
      'AR_LEDGER_MONEY_INVALID',
      `AR ledger ${field} phải là số hữu hạn.`,
      { field, value }
    );
  }
  const rounded = Math.round(number);
  if (rounded < 0) {
    throw createGuardError(
      'AR_LEDGER_NEGATIVE_MONEY',
      `AR ledger ${field} không được âm.`,
      { field, value: rounded }
    );
  }
  return rounded;
}

function assertNonNegativeLedgerAmounts(entry = {}) {
  for (const field of MONEY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') continue;
    normalizeMoney(entry[field], field);
  }
  return true;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = stableValue(value[key]);
    return acc;
  }, {});
}

function buildFinancialPayload(entry = {}) {
  const payload = {
    idempotencyKey: normalizeIdempotencyKey(entry.idempotencyKey)
  };

  for (const field of FINANCIAL_STRING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    payload[field] = clean(entry[field]);
  }
  for (const field of MONEY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') continue;
    payload[field] = normalizeMoney(entry[field], field);
  }
  for (const field of FINANCIAL_BOOLEAN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
    payload[field] = Boolean(entry[field]);
  }

  return stableValue(payload);
}

function payloadHash(entry = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(buildFinancialPayload(entry))).digest('hex');
}

function compareFinancialPayload(existing = {}, incoming = {}) {
  const existingPayload = buildFinancialPayload(existing);
  const incomingPayload = buildFinancialPayload(incoming);
  const existingHash = crypto.createHash('sha256').update(JSON.stringify(existingPayload)).digest('hex');
  const incomingHash = crypto.createHash('sha256').update(JSON.stringify(incomingPayload)).digest('hex');
  return {
    same: existingHash === incomingHash,
    existingHash,
    incomingHash,
    existingPayload,
    incomingPayload
  };
}

function isMongoDuplicateKeyError(error) {
  return Boolean(error && (
    error.code === 11000
    || error.code === 11001
    || /E11000 duplicate key/i.test(clean(error.message))
  ));
}

function createPayloadConflictError({ idempotencyKey, comparison, existingLedgerId = '' } = {}) {
  return createGuardError(
    'AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT',
    `Idempotency key ${idempotencyKey} đã tồn tại với financial payload khác.`,
    {
      idempotencyKey,
      existingLedgerId: clean(existingLedgerId),
      existingHash: comparison?.existingHash || '',
      incomingHash: comparison?.incomingHash || '',
      existingPayload: comparison?.existingPayload || null,
      incomingPayload: comparison?.incomingPayload || null
    }
  );
}

module.exports = {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MONEY_FIELDS,
  normalizeIdempotencyKey,
  assertNonNegativeLedgerAmounts,
  buildFinancialPayload,
  payloadHash,
  compareFinancialPayload,
  isMongoDuplicateKeyError,
  createPayloadConflictError,
  _internal: { clean, normalizeMoney, stableValue, createGuardError }
};
