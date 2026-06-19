'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const IMPORT_ORDER_KEY = 'importOrders';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(IMPORT_ORDER_KEY, filter, options);
}

async function findByIdOrCode(idOrCode) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(IMPORT_ORDER_KEY, filter, { limit: 1 });
  return rows[0] || null;
}

async function upsert(importOrder, options = {}) {
  return collectionRepository.upsertByIdentity(IMPORT_ORDER_KEY, importOrder, ['id', 'code'], options);
}

async function patchByIdentity(idOrCode, patch = {}, options = {}) {
  return collectionRepository.patchByIdentity(IMPORT_ORDER_KEY, idOrCode, patch, ['id', 'code'], options);
}

async function replaceAll(importOrders) {
  return collectionRepository.replaceAll(IMPORT_ORDER_KEY, importOrders || []);
}

module.exports = { findAll, findByIdOrCode, upsert, patchByIdentity, replaceAll };
