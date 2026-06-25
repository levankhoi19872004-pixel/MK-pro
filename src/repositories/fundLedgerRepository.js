'use strict';
const collectionRepository = require('./mongoCollection.repository');
const FundLedger = require('../models/FundLedger');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');
const KEY = 'fundLedgers';
function escapeRegex(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  return value ? buildIdentityFilter(value, ['id', 'code']) : null;
}
async function findAll(filter = {}, options = {}) { return collectionRepository.findAll(KEY, filter, options); }
async function findByIdOrCode(idOrCode) { const filter = identityFilter(idOrCode); if (!filter) return null; const rows = await findAll(filter, { limit: 1 }); return rows[0] || null; }

async function findLatestCodes(prefix = '', options = {}) {
  const safePrefix = String(prefix || '').trim();
  const filter = safePrefix ? { code: { $regex: `^${escapeRegex(safePrefix)}\\d+$` } } : {};
  let query = FundLedger.find(filter).select('code').sort({ code: -1 }).limit(1).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query;
}

async function findByIdempotencyKey(idempotencyKey, options = {}) {
  const key = String(idempotencyKey || '').trim();
  if (!key) return null;
  const rows = await findAll({ idempotencyKey: key }, { ...options, limit: 1 });
  return rows[0] || null;
}
async function aggregate(pipeline = [], options = {}) {
  let query = FundLedger.aggregate(Array.isArray(pipeline) ? pipeline : []);
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query.exec();
}

async function upsert(row, options = {}) {
  const identity = row && row.idempotencyKey ? ['idempotencyKey'] : ['id', 'code'];
  return collectionRepository.upsertByIdentity(KEY, row, identity, options);
}
module.exports = { findAll, findByIdOrCode, findByIdempotencyKey, findLatestCodes, aggregate, upsert };
