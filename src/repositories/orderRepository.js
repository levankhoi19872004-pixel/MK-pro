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

async function findByIdOrCode(idOrCode, options = {}) {
  const filter = identityFilter(idOrCode);
  if (!filter) return null;
  const rows = await collectionRepository.findAll(ORDER_KEY, filter, { ...options, limit: 1 });
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

  const salesOrderIds = values.filter((value) => /^SO\d+$/i.test(value));
  const fallbackValues = values.filter((value) => !/^SO\d+$/i.test(value));
  if (salesOrderIds.length && !fallbackValues.length) return findManyByIds(salesOrderIds, options);

  // Closeout/accounting hot path: when stable SO ids exist, query them directly by indexed `id`
  // instead of forcing one giant $or over many optional identity fields. Fallback keys are queried
  // separately for old B-code callers and then de-duplicated in memory.
  const rows = [];
  if (salesOrderIds.length) {
    rows.push(...await collectionRepository.findAll(ORDER_KEY, { id: { $in: salesOrderIds } }, {
      ...options,
      limit: Math.max(salesOrderIds.length, Number(options.limit || 0) || salesOrderIds.length)
    }));
  }

  if (fallbackValues.length) {
    const remainingLimit = options.limit
      ? Math.max(1, Number(options.limit) - rows.length)
      : fallbackValues.length;
    rows.push(...await collectionRepository.findAll(ORDER_KEY, {
      $or: [
        ...identityFields().map((field) => ({ [field]: { $in: fallbackValues } })),
        ...(fallbackValues.some(isMongoObjectId) ? [{ _id: { $in: fallbackValues.filter(isMongoObjectId) } }] : [])
      ]
    }, { ...options, limit: Math.max(1, remainingLimit) }));
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = normalizeIdOrCode(row && (row.id || row._id || row.code || row.orderCode));
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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


async function patchAccountingCloseoutById(orderId, patch = {}, options = {}) {
  const value = normalizeIdOrCode(orderId);
  if (!value) throw new Error('Thiếu salesOrder id để chốt sổ');
  if (!isGeneratedSalesOrderId(value)) throw new Error('Chốt sổ giao hàng yêu cầu salesOrder id nội bộ ổn định');
  const Model = collectionRepository.getModel(ORDER_KEY);
  const startedAt = Date.now();
  const result = await Model.updateOne(
    {
      id: value,
      accountingConfirmed: { $ne: true }
    },
    {
      $set: canonicalizeOperationalStaff(patch),
      $inc: { version: 1 }
    },
    { session: options.session }
  );
  return {
    acknowledged: result.acknowledged,
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    upsertedCount: result.upsertedCount || 0,
    durationMs: Date.now() - startedAt
  };
}

async function patchDeliveryCloseoutSnapshotById(orderId, patch = {}, guard = {}, options = {}) {
  const value = normalizeIdOrCode(orderId);
  if (!value) throw new Error('Thieu salesOrder id de repair deliveryCloseout snapshot');
  const Model = collectionRepository.getModel(ORDER_KEY);
  const filter = {
    id: value,
    accountingConfirmed: { $ne: true }
  };
  if (guard.updatedAt !== undefined) filter.updatedAt = guard.updatedAt;
  if (guard.calculationHash !== undefined) filter['deliveryCloseout.calculationHash'] = guard.calculationHash;
  if (guard.sourceHash !== undefined) filter['deliveryCloseout.sourceHash'] = guard.sourceHash;
  const result = await Model.updateOne(
    filter,
    { $set: canonicalizeOperationalStaff(patch) },
    { session: options.session }
  );
  return {
    acknowledged: result.acknowledged,
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    upsertedCount: result.upsertedCount || 0
  };
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

module.exports = { findAll, count, findByIdOrCode, findManyByIds, findManyByIdentity, findManyByIdentityMatches, upsert, patchByIdentity, patchAccountingCloseoutById, patchDeliveryCloseoutSnapshotById, replaceAll, remove, removeResolved, identityFields };
