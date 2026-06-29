'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { canonicalizeOperationalStaff } = require('../utils/canonicalStaffWrite.util');
const { buildIdentityFilter, normalizeIdOrCode, isMongoObjectId } = require('../utils/identity.util');

const ORDER_KEY = 'salesOrders';

function isGeneratedSalesOrderId(value) {
  return /^SO\d+$/i.test(String(value || '').trim());
}

function identityFields() {
  return [
    'id',
    'code',
    'documentCode',
    'invoiceCode',
    'orderCode',
    'salesOrderId',
    'salesOrderCode',
    'externalOrderCode',
    'sourceOrderId',
    'sourceOrderCode',
    'deliveryOrderId',
    'deliveryOrderCode',
    'orderNo'
  ];
}

function identityFilter(idOrCode) {
  const value = normalizeIdOrCode(idOrCode);
  if (!value) return null;
  // API /api/sales-orders/:id luôn truyền mã SO nội bộ trong case phổ biến.
  // Đi thẳng vào field id để Mongo dùng uniq_salesOrders_id, tránh $or nhiều nhánh trên đường nóng.
  if (isGeneratedSalesOrderId(value)) return { id: value };
  return buildIdentityFilter(value, identityFields());
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


function normalizeIdentityValues(keys = []) {
  return [...new Set((Array.isArray(keys) ? keys : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeSalesOrderIds(keys = []) {
  return normalizeIdentityValues(keys).filter((value) => /^SO\d+$/i.test(value));
}

async function findManyByIds(ids = [], options = {}) {
  const values = normalizeSalesOrderIds(ids);
  if (!values.length) return [];
  return collectionRepository.findAll(ORDER_KEY, { id: { $in: values } }, options);
}

async function findManyByIdentity(keys = [], options = {}) {
  const values = normalizeIdentityValues(keys);
  if (!values.length) return [];
  if (values.every((value) => /^SO\d+$/i.test(value))) return findManyByIds(values, options);
  return collectionRepository.findAll(ORDER_KEY, {
    $or: [
      ...identityFields().map((field) => ({ [field]: { $in: values } })),
      ...(values.some(isMongoObjectId) ? [{ _id: { $in: values.filter(isMongoObjectId) } }] : [])
    ]
  }, options);
}

async function findManyByIdentityMatches(keys = [], options = {}) {
  const values = normalizeIdentityValues(keys);
  if (!values.length) return [];

  const identityFilters = identityFields().map((field) => ({ [field]: { $in: values } }));
  const mongoIds = values.filter(isMongoObjectId);
  if (mongoIds.length) identityFilters.unshift({ _id: { $in: mongoIds } });

  let query = collectionRepository.getModel(ORDER_KEY)
    .find({ $or: identityFilters }, options.projection || undefined)
    .lean();
  if (options.sort) query = query.sort(options.sort);
  if (options.limit) query = query.limit(options.limit);
  if (options.session) query = query.session(options.session);

  const rows = await query;
  return rows.map((row) => {
    const order = collectionRepository.stripMongoFields(row);
    if (row._id) order.__mongoId = normalizeIdOrCode(row._id);
    return {
      identityKeys: [...new Set([row._id, ...identityFields().map((field) => row[field])]
        .map(normalizeIdOrCode)
        .filter(Boolean))],
      order
    };
  });
}

async function upsert(order, options = {}) {
  return collectionRepository.upsertByIdentity(ORDER_KEY, canonicalizeOperationalStaff(order), ['id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode'], options);
}

async function replaceAll(orders) {
  return collectionRepository.replaceAll(ORDER_KEY, (orders || []).map((row) => canonicalizeOperationalStaff(row)));
}

async function patchByIdentity(idOrCode, patch = {}, options = {}) {
  const value = normalizeIdOrCode(idOrCode);
  if (isGeneratedSalesOrderId(value)) {
    return collectionRepository.patchByIdentity(ORDER_KEY, value, canonicalizeOperationalStaff(patch), ['id'], options);
  }
  return collectionRepository.patchByIdentity(ORDER_KEY, value, canonicalizeOperationalStaff(patch), ['id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode'], options);
}

async function remove(idOrCode, options = {}) {
  const filter = identityFilter(idOrCode);
  if (!filter) throw new Error(`Không có khóa định danh để xóa ${ORDER_KEY}`);
  return collectionRepository.getModel(ORDER_KEY).deleteOne(filter, { session: options.session });
}

async function removeResolved(order = {}, fallbackRef = '', options = {}) {
  const values = normalizeIdentityValues([
    order.id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.externalOrderCode,
    order.sourceOrderId,
    order.sourceOrderCode,
    order.deliveryOrderId,
    order.deliveryOrderCode,
    order.orderNo,
    fallbackRef
  ]);
  if (!values.length) throw new Error(`Không có khóa định danh để xóa ${ORDER_KEY}`);
  return collectionRepository.getModel(ORDER_KEY).deleteOne({
    $or: [
      ...identityFields().map((field) => ({ [field]: { $in: values } })),
      ...(values.some(isMongoObjectId) ? [{ _id: { $in: values.filter(isMongoObjectId) } }] : [])
    ]
  }, { session: options.session });
}

module.exports = { findAll, count, findByIdOrCode, findManyByIds, findManyByIdentity, findManyByIdentityMatches, upsert, patchByIdentity, replaceAll, remove, removeResolved, identityFields };
