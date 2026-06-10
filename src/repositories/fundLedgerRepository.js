'use strict';
const collectionRepository = require('./mongoCollection.repository');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');
const KEY = 'fundLedgers';
function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  return value ? buildIdentityFilter(value, ['id', 'code']) : null;
}
async function findAll(filter = {}, options = {}) { return collectionRepository.findAll(KEY, filter, options); }
async function findByIdOrCode(idOrCode) { const filter = identityFilter(idOrCode); if (!filter) return null; const rows = await findAll(filter, { limit: 1 }); return rows[0] || null; }
async function findByIdempotencyKey(idempotencyKey, options = {}) {
  const key = String(idempotencyKey || '').trim();
  if (!key) return null;
  const rows = await findAll({ idempotencyKey: key }, { ...options, limit: 1 });
  return rows[0] || null;
}
async function upsert(row, options = {}) {
  const identity = row && row.idempotencyKey ? ['idempotencyKey'] : ['id', 'code'];
  return collectionRepository.upsertByIdentity(KEY, row, identity, options);
}
module.exports = { findAll, findByIdOrCode, findByIdempotencyKey, upsert };
