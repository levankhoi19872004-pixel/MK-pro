'use strict';

const collectionRepository = require('./mongoCollection.repository');
const DeliveryCashShortage = require('../models/DeliveryCashShortage');
const { buildIdentityFilter, normalizeIdOrCode } = require('../utils/identity.util');

const KEY = 'deliveryCashShortages';

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

async function findBySourceAndFundType(sourceSubmissionId, sourceSubmissionCode, fundType, options = {}) {
  const sourceFilters = [];
  if (sourceSubmissionId) sourceFilters.push({ sourceSubmissionId: String(sourceSubmissionId) });
  if (sourceSubmissionCode) sourceFilters.push({ sourceSubmissionCode: String(sourceSubmissionCode) });
  if (!sourceFilters.length) return null;
  const rows = await findAll({ fundType: String(fundType), $or: sourceFilters }, { ...options, limit: 1 });
  return rows[0] || null;
}

async function upsert(row, options = {}) {
  return collectionRepository.upsertByIdentity(KEY, row, ['id', 'code'], options);
}

async function patchByIdOrCode(idOrCode, patch, options = {}) {
  return collectionRepository.patchByIdentity(KEY, idOrCode, patch, ['id', 'code'], options);
}

async function reservePendingRepayment(idOrCode, amount, updatedAt, options = {}) {
  const value = normalizeIdOrCode(idOrCode);
  const numericAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!value || numericAmount <= 0) return null;
  const row = await DeliveryCashShortage.findOneAndUpdate(
    {
      ...buildIdentityFilter(value, ['id', 'code']),
      responsibleType: 'delivery_staff',
      status: { $in: ['open', 'partial'] },
      $expr: {
        $gte: [
          { $subtract: [{ $ifNull: ['$outstandingAmount', 0] }, { $ifNull: ['$pendingRepaymentAmount', 0] }] },
          numericAmount
        ]
      }
    },
    {
      $inc: { pendingRepaymentAmount: numericAmount },
      $set: { updatedAt }
    },
    { new: true, session: options.session }
  ).lean();
  if (!row) return null;
  const { _id, __v, ...clean } = row;
  return clean;
}

async function applyConfirmedRepayment(idOrCode, amount, updatedAt, options = {}) {
  const value = normalizeIdOrCode(idOrCode);
  const numericAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!value || numericAmount <= 0) return null;
  let query = DeliveryCashShortage.findOneAndUpdate(
    {
      ...buildIdentityFilter(value, ['id', 'code']),
      responsibleType: 'delivery_staff',
      status: { $in: ['open', 'partial'] },
      outstandingAmount: { $gte: numericAmount },
      pendingRepaymentAmount: { $gte: numericAmount }
    },
    {
      $inc: { settledAmount: numericAmount, pendingRepaymentAmount: -numericAmount, outstandingAmount: -numericAmount },
      $set: { updatedAt }
    },
    { new: true, session: options.session }
  ).lean();
  let row = await query;
  if (!row) return null;
  const nextStatus = Number(row.outstandingAmount || 0) <= 0 ? 'settled' : 'partial';
  if (row.status !== nextStatus) {
    row = await DeliveryCashShortage.findOneAndUpdate(
      { _id: row._id },
      { $set: { status: nextStatus, updatedAt } },
      { new: true, session: options.session }
    ).lean();
  }
  if (!row) return null;
  const { _id, __v, ...clean } = row;
  return clean;
}

module.exports = {
  findAll,
  findByIdOrCode,
  findBySourceAndFundType,
  upsert,
  patchByIdOrCode,
  reservePendingRepayment,
  applyConfirmedRepayment
};
