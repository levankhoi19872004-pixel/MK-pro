'use strict';

const Promotion = require('../models/Promotion');

function identityFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  const filters = [{ id: value }, { code: value }];
  if (/^[a-f\d]{24}$/i.test(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

function queryFilter(query = {}) {
  const q = String(query.q || '').trim();
  if (!q) return {};
  return {
    $or: [
      { code: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
      { programName: { $regex: q, $options: 'i' } },
      { productGroupCode: { $regex: q, $options: 'i' } },
      { productGroupName: { $regex: q, $options: 'i' } },
      { customerCodes: { $elemMatch: { $regex: q, $options: 'i' } } },
      { type: { $regex: q, $options: 'i' } },
      { promotionType: { $regex: q, $options: 'i' } },
      { conditionText: { $regex: q, $options: 'i' } },
      { discountText: { $regex: q, $options: 'i' } },
      { productCodes: { $elemMatch: { $regex: q, $options: 'i' } } }
    ]
  };
}

async function findAll(query = {}) {
  return Promotion.find(queryFilter(query)).sort({ startDate: -1, code: 1 }).lean();
}

async function findByIdOrCode(idOrCode) {
  return Promotion.findOne(identityFilter(idOrCode));
}

async function upsert(payload) {
  const identity = payload.id || payload.code;
  const existing = identity ? await findByIdOrCode(identity) : null;
  if (existing) {
    Object.assign(existing, payload);
    return existing.save();
  }
  return Promotion.create(payload);
}

async function remove(idOrCode) {
  const result = await Promotion.deleteOne(identityFilter(idOrCode));
  return result.deletedCount > 0;
}

module.exports = { findAll, findByIdOrCode, upsert, remove };
