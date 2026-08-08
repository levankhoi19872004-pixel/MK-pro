'use strict';

const closeoutQueryAudit = require('../../../observability/closeoutQueryAudit');
const arPostingService = require('../../arPosting.service');
const { validateArLedgerContract } = require('../../../domain/ar/arLedgerContract');
const {
  normalizeIdempotencyKey,
  assertNonNegativeLedgerAmounts,
  compareFinancialPayload,
  createPayloadConflictError,
  isMongoDuplicateKeyError
} = require('../../../domain/ar/arLedgerIdempotencyGuard');

const ELIGIBLE_CATEGORIES = new Set([
  'AR-SALE',
  'AR-RECEIPT-CASH',
  'AR-RECEIPT-BANK',
  'AR-REWARD-ALLOWANCE',
  'AR-RETURN'
]);

function clean(value = '') { return String(value ?? '').trim(); }

function createP0(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.severity = 'P0';
  error.details = details;
  return error;
}

function defaultRepository() {
  const ArLedger = require('../../../models/ArLedger');
  return {
    async findByIdempotencyKeys(keys = [], options = {}) {
      let query = ArLedger.find({ idempotencyKey: { $in: keys } });
      if (options.session && typeof query.session === 'function') query = query.session(options.session);
      if (typeof query.lean === 'function') query = query.lean();
      if (typeof query.exec === 'function') return query.exec();
      return query;
    },
    async bulkUpsert(rows = [], options = {}) {
      const operations = rows.map((row) => ({
        updateOne: {
          filter: { idempotencyKey: row.idempotencyKey },
          update: { $setOnInsert: row },
          upsert: true
        }
      }));
      return ArLedger.bulkWrite(operations, { ordered: options.ordered !== false, session: options.session });
    }
  };
}

function normalizeAndValidateIntents(intents = []) {
  const rows = [];
  const keys = new Set();
  const ids = new Map();
  const codes = new Map();
  for (const source of Array.isArray(intents) ? intents : []) {
    if (!source || typeof source !== 'object') throw createP0('AR_BATCH_INTENT_INVALID', 'AR batch intent không hợp lệ.');
    const idempotencyKey = normalizeIdempotencyKey(source.idempotencyKey);
    const row = { ...source, idempotencyKey };
    const category = clean(row.category).toUpperCase();
    if (!ELIGIBLE_CATEGORIES.has(category)) {
      throw createP0('AR_BATCH_UNSUPPORTED_CATEGORY', `AR category ${category || '(empty)'} không thuộc G4 closeout bulk scope.`, { category });
    }
    assertNonNegativeLedgerAmounts(row);
    const validation = validateArLedgerContract(row);
    if (!validation.ok) {
      throw createP0('INVALID_AR_LEDGER_CONTRACT', `Invalid canonical AR ledger ${validation.ledgerId}: ${validation.errors.map((item) => item.code).join(', ')}`, { validation });
    }
    if (keys.has(idempotencyKey)) {
      throw createP0('AR_BATCH_DUPLICATE_IDEMPOTENCY_KEY', 'Trùng idempotencyKey trong cùng AR batch.', { idempotencyKey });
    }
    keys.add(idempotencyKey);
    for (const [field, map, code] of [['id', ids, 'AR_BATCH_DETERMINISTIC_ID_COLLISION'], ['code', codes, 'AR_BATCH_DETERMINISTIC_CODE_COLLISION']]) {
      const value = clean(row[field]);
      if (!value) continue;
      if (map.has(value) && map.get(value) !== idempotencyKey) {
        throw createP0(code, `AR batch có deterministic ${field} collision.`, { field, value });
      }
      map.set(value, idempotencyKey);
    }
    rows.push(row);
  }
  return rows;
}

function partitionRowsByKey(rows = [], expectedKeys = []) {
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = clean(row && row.idempotencyKey);
    if (!key || !expectedKeys.includes(key)) continue;
    if (byKey.has(key)) throw createP0('AR_BATCH_MULTIPLE_ROWS_PER_IDEMPOTENCY_KEY', 'Nhiều AR rows cùng idempotencyKey trong readback.', { idempotencyKey: key });
    byKey.set(key, row);
  }
  return byKey;
}

async function assertEquivalent(existing, incoming, options = {}) {
  if (options.suppressConflictAuditForTest === true) {
    const comparison = compareFinancialPayload(existing, incoming);
    if (comparison.same) return existing;
    throw createPayloadConflictError({
      idempotencyKey: incoming.idempotencyKey,
      comparison,
      existingLedgerId: clean(existing.id || existing.code || existing._id)
    });
  }
  return arPostingService._idempotency.assertSameIdempotentPayload(existing, incoming, { trigger: options.trigger || 'ar_batch' });
}

function isIdempotencyUniqueDuplicate(error = {}) {
  if (!isMongoDuplicateKeyError(error)) return false;
  const keyPattern = error.keyPattern || error.keyValue || {};
  const indexName = clean(error.index || error.indexName || error?.errorResponse?.index);
  const message = clean(error.message);
  return Object.prototype.hasOwnProperty.call(keyPattern, 'idempotencyKey')
    || indexName === 'uniq_arledger_idempotency_key_v1'
    || /uniq_arledger_idempotency_key_v1/i.test(message)
    || /idempotencyKey/i.test(message);
}

async function postEligibleArIntentsBatch(intents = [], options = {}) {
  const normalized = normalizeAndValidateIntents(intents);
  if (!normalized.length) {
    const entries = [];
    entries.postingResults = [];
    entries.expectedArLedgers = [];
    return { entries, postingResults: [], expectedArLedgers: [], telemetry: { arPreflightReadCommands: 0, arBulkWriteCommands: 0, arReadbackCommands: 0, legacyArWriteCommands: 0, bulkOperationCount: 0 } };
  }
  const repository = options.repository || defaultRepository();
  const keys = normalized.map((row) => row.idempotencyKey);
  const telemetry = { arPreflightReadCommands: 0, arBulkWriteCommands: 0, arReadbackCommands: 0, legacyArWriteCommands: 0, bulkOperationCount: 0 };

  const preflightRows = await closeoutQueryAudit.withCloseoutAuditStage('transaction.arBulk.preflight', async () => {
    telemetry.arPreflightReadCommands += 1;
    return repository.findByIdempotencyKeys(keys, { session: options.session });
  });
  const existingByKey = partitionRowsByKey(preflightRows, keys);
  const newRows = [];
  for (const incoming of normalized) {
    const existing = existingByKey.get(incoming.idempotencyKey);
    if (existing) await assertEquivalent(existing, incoming, { ...options, trigger: 'batch_preflight' });
    else newRows.push(incoming);
  }

  if (newRows.length) {
    try {
      await closeoutQueryAudit.withCloseoutAuditStage('transaction.arBulk.write', async () => {
        telemetry.arBulkWriteCommands += 1;
        telemetry.bulkOperationCount += newRows.length;
        return repository.bulkUpsert(newRows, { session: options.session, ordered: true });
      });
    } catch (error) {
      if (isIdempotencyUniqueDuplicate(error)) error.arBatchRetryWholeTransaction = true;
      throw error;
    }
  }

  const finalRows = newRows.length
    ? await closeoutQueryAudit.withCloseoutAuditStage('transaction.arBulk.readback', async () => {
      telemetry.arReadbackCommands += 1;
      return repository.findByIdempotencyKeys(keys, { session: options.session });
    })
    : preflightRows;
  const finalByKey = partitionRowsByKey(finalRows, keys);
  const entries = [];
  const postingResults = [];
  for (const incoming of normalized) {
    const actual = finalByKey.get(incoming.idempotencyKey);
    if (!actual) throw createP0('AR_BATCH_READBACK_MISSING', 'Thiếu AR row sau batch persistence/readback.', { idempotencyKey: incoming.idempotencyKey });
    await assertEquivalent(actual, incoming, { ...options, trigger: newRows.length ? 'batch_readback' : 'batch_preflight_existing' });
    entries.push(actual);
    const alreadyExists = existingByKey.has(incoming.idempotencyKey);
    postingResults.push({
      idempotencyKey: incoming.idempotencyKey,
      category: incoming.category,
      created: !alreadyExists,
      alreadyExists,
      reasonCode: alreadyExists ? 'ALREADY_EXISTS' : 'POSTED',
      entry: actual
    });
  }
  entries.postingResults = postingResults;
  entries.expectedArLedgers = normalized;
  return { entries, postingResults, expectedArLedgers: normalized, telemetry };
}

module.exports = {
  ELIGIBLE_CATEGORIES,
  postEligibleArIntentsBatch,
  isIdempotencyUniqueDuplicate,
  _internal: { clean, createP0, normalizeAndValidateIntents, partitionRowsByKey, assertEquivalent, defaultRepository }
};
