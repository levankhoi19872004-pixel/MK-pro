'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const CASHBOOK_KEY = 'cashbooks';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(CASHBOOK_KEY, filter, options);
}

async function findByIdOrCode(idOrCode) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(CASHBOOK_KEY, filter, { limit: 1 });
  return rows[0] || null;
}

async function upsert(entry, options = {}) {
  return collectionRepository.upsertByIdentity(CASHBOOK_KEY, entry, ['id', 'code'], options);
}

module.exports = { findAll, findByIdOrCode, upsert };
