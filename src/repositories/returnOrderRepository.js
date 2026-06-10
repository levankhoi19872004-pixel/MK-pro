'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const RETURN_ORDER_KEY = 'returnOrders';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(RETURN_ORDER_KEY, filter, options);
}

async function findByIdOrCode(idOrCode) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(RETURN_ORDER_KEY, filter, { limit: 1 });
  return rows[0] || null;
}

async function upsert(returnOrder, options = {}) {
  return collectionRepository.upsertByIdentity(RETURN_ORDER_KEY, returnOrder, ['id', 'code'], options);
}

async function replaceAll() {
  throw new Error('returnOrders không được replaceAll. Chỉ được ghi bằng returnOrderRepository.upsert().');
}

function collectionName() {
  return collectionRepository.getModel(RETURN_ORDER_KEY).collection.name;
}

module.exports = { findAll, findByIdOrCode, upsert, replaceAll, collectionName };
