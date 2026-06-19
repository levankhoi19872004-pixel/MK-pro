'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { canonicalizeOperationalStaff } = require('../utils/canonicalStaffWrite.util');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const ORDER_KEY = 'salesOrders';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(ORDER_KEY, filter, options);
}

async function count(filter = {}, options = {}) {
  return collectionRepository.count(ORDER_KEY, filter, options);
}

async function findByIdOrCode(idOrCode) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(ORDER_KEY, filter, { limit: 1 });
  return rows[0] || null;
}


async function findManyByIdentity(keys = [], options = {}) {
  const values = [...new Set((Array.isArray(keys) ? keys : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!values.length) return [];
  return collectionRepository.findAll(ORDER_KEY, {
    $or: [
      { id: { $in: values } },
      { code: { $in: values } },
      { documentCode: { $in: values } },
      { invoiceCode: { $in: values } },
      { orderCode: { $in: values } },
      { salesOrderCode: { $in: values } }
    ]
  }, options);
}

async function upsert(order, options = {}) {
  return collectionRepository.upsertByIdentity(ORDER_KEY, canonicalizeOperationalStaff(order), ['id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode'], options);
}

async function replaceAll(orders) {
  return collectionRepository.replaceAll(ORDER_KEY, (orders || []).map((row) => canonicalizeOperationalStaff(row)));
}

async function patchByIdentity(idOrCode, patch = {}, options = {}) {
  return collectionRepository.patchByIdentity(ORDER_KEY, idOrCode, canonicalizeOperationalStaff(patch), ['id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode'], options);
}

async function remove(idOrCode, options = {}) {
  return collectionRepository.deleteOneByIdentity(ORDER_KEY, idOrCode, ['id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode'], options);
}

module.exports = { findAll, count, findByIdOrCode, findManyByIdentity, upsert, patchByIdentity, replaceAll, remove };
