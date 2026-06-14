'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { canonicalizeOperationalStaff } = require('../utils/canonicalStaffWrite.util');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const MASTER_RETURN_KEY = 'masterReturnOrders';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(MASTER_RETURN_KEY, filter, options);
}

async function findByIdOrCode(idOrCode, options = {}) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(MASTER_RETURN_KEY, filter, {
    limit: 1,
    session: options.session
  });
  return rows[0] || null;
}

async function upsert(masterReturnOrder, options = {}) {
  return collectionRepository.upsertByIdentity(MASTER_RETURN_KEY, canonicalizeOperationalStaff(masterReturnOrder), ['id', 'code'], options);
}

async function replaceAll(masterReturnOrders) {
  return collectionRepository.replaceAll(MASTER_RETURN_KEY, (masterReturnOrders || []).map((row) => canonicalizeOperationalStaff(row)));
}

async function remove(idOrCode, options = {}) {
  return collectionRepository.deleteOneByIdentity(MASTER_RETURN_KEY, idOrCode, ['id', 'code'], options);
}

module.exports = { findAll, findByIdOrCode, upsert, replaceAll, remove };
