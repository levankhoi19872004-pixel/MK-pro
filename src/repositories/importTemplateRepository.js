'use strict';

const ImportTemplate = require('../models/ImportTemplate');

function identityFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  const filters = [{ id: value }, { code: value }, { name: value }];
  if (/^[a-f\d]{24}$/i.test(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

async function findAll(query = {}) {
  const filter = {};
  if (query.type) filter.type = String(query.type).trim();
  return ImportTemplate.find(filter).sort({ createdAt: -1, name: 1 }).lean();
}

async function findById(id) {
  return ImportTemplate.findOne(identityFilter(id));
}

async function upsert(payload) {
  const existing = payload.id ? await findById(payload.id) : null;
  if (existing) {
    Object.assign(existing, payload);
    return existing.save();
  }
  return ImportTemplate.create(payload);
}

async function remove(id) {
  const result = await ImportTemplate.deleteOne(identityFilter(id));
  return result.deletedCount > 0;
}

module.exports = { findAll, findById, upsert, remove };
