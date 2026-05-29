'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const ORDER_KEY = 'salesOrders';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(ORDER_KEY, filter, options);
}

async function findByIdOrCode(idOrCode) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(ORDER_KEY, filter, { limit: 1 });
  return rows[0] || null;
}

async function upsert(order, options = {}) {
  return collectionRepository.upsertByIdentity(ORDER_KEY, order, ['id', 'code'], options);
}

async function replaceAll(orders) {
  return collectionRepository.replaceAll(ORDER_KEY, orders || []);
}

module.exports = { findAll, findByIdOrCode, upsert, replaceAll };
