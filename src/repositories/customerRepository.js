'use strict';

const Customer = require('../models/Customer');
const { buildIdentityFilter } = require('../utils/identity.util');
const { getPagination, wantsPagination, buildPageMeta, escapeRegex } = require('../utils/query.util');


function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function buildMongoFilter(idOrCode) {
  return buildIdentityFilter(idOrCode, ['code']);
}

function buildQueryFilter(query = {}) {
  const q = String(query.q || query.search || '').trim();
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
  if (q) {
    const rawRegex = escapeRegex(q);
    const normalizedRegex = escapeRegex(normalizeSearchText(q));
    filter.$or = [
      { code: { $regex: rawRegex, $options: 'i' } },
      { customerCode: { $regex: rawRegex, $options: 'i' } },
      { name: { $regex: rawRegex, $options: 'i' } },
      { customerName: { $regex: rawRegex, $options: 'i' } },
      { phone: { $regex: rawRegex, $options: 'i' } },
      { address: { $regex: rawRegex, $options: 'i' } },
      { area: { $regex: rawRegex, $options: 'i' } },
      { route: { $regex: rawRegex, $options: 'i' } },
      { staffCode: { $regex: rawRegex, $options: 'i' } },
      { staffName: { $regex: rawRegex, $options: 'i' } },
      { searchText: { $regex: normalizedRegex, $options: 'i' } }
    ];
  }
  return filter;
}

async function findAll(query = {}) {
  const filter = buildQueryFilter(query);
  if (!wantsPagination(query)) return Customer.find(filter).sort({ code: 1 }).lean();
  const page = getPagination(query);
  const [rows, total] = await Promise.all([
    Customer.find(filter).sort({ code: 1 }).skip(page.skip).limit(page.limit).lean(),
    Customer.countDocuments(filter)
  ]);
  return { rows, meta: buildPageMeta({ ...page, total }) };
}

async function search(query = {}) {
  const filter = buildQueryFilter({ ...query, activeOnly: query.activeOnly ?? '1' });
  const limit = Math.min(Number.parseInt(query.limit, 10) || 20, 50);
  return Customer.find(filter)
    .select('code name phone address area route staffCode staffName openingDebt debtLimit isActive')
    .sort({ code: 1 })
    .limit(limit)
    .lean();
}

async function findByIdOrCode(idOrCode) {
  return Customer.findOne(buildMongoFilter(idOrCode));
}

async function findDuplicateCode(code, exceptId) {
  const filter = { code };
  if (exceptId) filter._id = { $ne: exceptId };
  return Customer.findOne(filter).select('_id').lean();
}

async function create(payload) {
  return Customer.create(payload);
}

async function save(document, options = {}) {
  if (document && typeof document.save === 'function') return document.save({ session: options.session });
  return document;
}

async function removeByIdOrCode(idOrCode) {
  return Customer.findOneAndDelete(buildMongoFilter(idOrCode)).lean();
}

async function bulkDelete(ids) {
  const objectIds = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
  return Customer.deleteMany({ $or: [{ code: { $in: ids } }, { _id: { $in: objectIds } }] });
}

module.exports = {
  buildMongoFilter,
  findAll,
  search,
  findByIdOrCode,
  findDuplicateCode,
  create,
  save,
  removeByIdOrCode,
  bulkDelete
};
