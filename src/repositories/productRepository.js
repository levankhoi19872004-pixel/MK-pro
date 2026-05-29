'use strict';

const Product = require('../models/Product');
const { buildIdentityFilter } = require('../utils/identity.util');
const { getPagination, wantsPagination, buildPageMeta, escapeRegex } = require('../utils/query.util');

function buildMongoFilter(idOrCode) {
  return buildIdentityFilter(idOrCode, ['code']);
}

function buildQueryFilter(query = {}) {
  const q = String(query.q || query.search || '').trim();
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
  if (q) {
    filter.$or = [
      { code: { $regex: escapeRegex(q), $options: 'i' } },
      { name: { $regex: escapeRegex(q), $options: 'i' } },
      { barcode: { $regex: escapeRegex(q), $options: 'i' } },
      { category: { $regex: escapeRegex(q), $options: 'i' } },
      { brand: { $regex: escapeRegex(q), $options: 'i' } }
    ];
  }
  return filter;
}

async function findAll(query = {}) {
  const filter = buildQueryFilter(query);
  if (!wantsPagination(query)) return Product.find(filter).sort({ code: 1 }).lean();
  const page = getPagination(query);
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ code: 1 }).skip(page.skip).limit(page.limit).lean(),
    Product.countDocuments(filter)
  ]);
  return { rows, meta: buildPageMeta({ ...page, total }) };
}

async function search(query = {}) {
  const filter = buildQueryFilter({ ...query, activeOnly: query.activeOnly ?? '1' });
  const limit = Math.min(Number.parseInt(query.limit, 10) || 20, 50);
  return Product.find(filter)
    .select('code name unit baseUnit conversionRate packing barcode category brand salePrice availableStock stockQuantity isActive')
    .sort({ code: 1 })
    .limit(limit)
    .lean();
}

async function findByIdOrCode(idOrCode) {
  return Product.findOne(buildMongoFilter(idOrCode));
}

async function findDuplicateCode(code, exceptId) {
  const filter = { code };
  if (exceptId) filter._id = { $ne: exceptId };
  return Product.findOne(filter).select('_id').lean();
}

async function findDuplicateBarcode(barcode, exceptId) {
  if (!barcode) return null;
  const filter = { barcode };
  if (exceptId) filter._id = { $ne: exceptId };
  return Product.findOne(filter).select('_id').lean();
}

async function create(payload) {
  return Product.create(payload);
}

async function save(document, options = {}) {
  if (document && typeof document.save === 'function') return document.save({ session: options.session });
  return document;
}

module.exports = {
  buildMongoFilter,
  findAll,
  search,
  findByIdOrCode,
  findDuplicateCode,
  findDuplicateBarcode,
  create,
  save
};
