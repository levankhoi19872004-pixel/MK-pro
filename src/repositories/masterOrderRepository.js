'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { canonicalizeOperationalStaff } = require('../utils/canonicalStaffWrite.util');
const { buildIdentityFilter, normalizeIdOrCode, isMongoObjectId } = require('../utils/identity.util');

const MASTER_KEY = 'masterOrders';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  return buildIdentityFilter(value, ['id', 'code']);
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(MASTER_KEY, filter, options);
}

async function findByIdOrCode(idOrCode) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(MASTER_KEY, filter, { limit: 1 });
  return rows[0] || null;
}

async function findManyByIdentityMatches(keys = [], options = {}) {
  const values = [...new Set((Array.isArray(keys) ? keys : [])
    .map(normalizeIdOrCode)
    .filter(Boolean))];
  if (!values.length) return [];

  const identityFilters = [
    { id: { $in: values } },
    { code: { $in: values } }
  ];
  const mongoIds = values.filter(isMongoObjectId);
  if (mongoIds.length) identityFilters.unshift({ _id: { $in: mongoIds } });

  // Giữ _id chỉ trong identityKeys để batch caller có thể map lại ObjectId;
  // masterOrder vẫn theo contract repository hiện tại và không lộ Mongo fields.
  let query = collectionRepository.getModel(MASTER_KEY)
    .find({ $or: identityFilters }, options.projection || undefined)
    .lean();
  if (options.session) query = query.session(options.session);
  const rows = await query;
  return rows.map((row) => ({
    identityKeys: [...new Set([row._id, row.id, row.code]
      .map(normalizeIdOrCode)
      .filter(Boolean))],
    masterOrder: collectionRepository.stripMongoFields(row)
  }));
}

async function upsert(masterOrder, options = {}) {
  return collectionRepository.upsertByIdentity(MASTER_KEY, canonicalizeOperationalStaff(masterOrder), ['id', 'code'], options);
}

async function replaceAll(masterOrders) {
  return collectionRepository.replaceAll(MASTER_KEY, (masterOrders || []).map((row) => canonicalizeOperationalStaff(row)));
}

async function remove(idOrCode, options = {}) {
  return collectionRepository.deleteOneByIdentity(MASTER_KEY, idOrCode, ['id', 'code'], options);
}

module.exports = { findAll, findByIdOrCode, findManyByIdentityMatches, upsert, replaceAll, remove };
