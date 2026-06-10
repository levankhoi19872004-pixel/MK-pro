'use strict';
const collectionRepository = require('./mongoCollection.repository');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');
const KEY = 'fundTransfers';
function identityFilter(idOrCode) { const value = normalizeIdOrCode(idOrCode); return value ? buildIdentityFilter(value, ['id', 'code']) : null; }
async function findAll(filter = {}, options = {}) { return collectionRepository.findAll(KEY, filter, options); }
async function findByIdOrCode(idOrCode) { const filter = identityFilter(idOrCode); if (!filter) return null; const rows = await findAll(filter, { limit: 1 }); return rows[0] || null; }
async function upsert(row, options = {}) { return collectionRepository.upsertByIdentity(KEY, row, ['id', 'code'], options); }
module.exports = { findAll, findByIdOrCode, upsert };
