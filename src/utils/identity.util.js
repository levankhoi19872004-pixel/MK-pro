'use strict';

function normalizeIdOrCode(value) {
  return String(value || '').trim();
}

function isMongoObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

function buildIdentityFilter(value, fields = ['id', 'code']) {
  const normalized = normalizeIdOrCode(value);
  const filters = fields.map((field) => ({ [field]: normalized }));
  if (isMongoObjectId(normalized)) filters.unshift({ _id: normalized });
  return { $or: filters };
}

function buildTextSearchFilter(query = {}, fields = [], options = {}) {
  const q = String(query.q || query.search || '').trim();
  const activeOnly = String(query.activeOnly || '') === '1' || options.activeOnly === true;
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
  if (q && fields.length) {
    filter.$or = fields.map((field) => ({ [field]: { $regex: q, $options: 'i' } }));
  }
  return filter;
}

module.exports = {
  normalizeIdOrCode,
  isMongoObjectId,
  buildIdentityFilter,
  buildTextSearchFilter
};
