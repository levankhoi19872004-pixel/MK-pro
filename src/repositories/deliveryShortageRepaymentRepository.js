'use strict';

const collectionRepository = require('./mongoCollection.repository');
const DeliveryShortageRepayment = require('../models/DeliveryShortageRepayment');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const KEY = 'deliveryShortageRepayments';

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  return value ? buildIdentityFilter(value, ['id', 'code']) : null;
}

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(KEY, filter, options);
}

async function findByIdOrCode(idOrCode, options = {}) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await findAll(filter, { ...options, limit: 1 });
  return rows[0] || null;
}

async function upsert(row, options = {}) {
  return collectionRepository.upsertByIdentity(KEY, row, ['id', 'code'], options);
}

async function markConfirmedIfPending(idOrCode, patch, options = {}) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  const row = await DeliveryShortageRepayment.findOneAndUpdate(
    {
      ...buildIdentityFilter(value, ['id', 'code']),
      status: 'pending',
      fundPosted: { $ne: true }
    },
    { $set: patch },
    { new: true, session: options.session }
  ).lean();
  if (!row) return null;
  const { _id, __v, ...clean } = row;
  return clean;
}

module.exports = { findAll, findByIdOrCode, upsert, markConfirmedIfPending };
