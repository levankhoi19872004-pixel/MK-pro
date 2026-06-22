'use strict';

const MasterOrder = require('../../models/MasterOrder');
const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const masterOrderDeliveryService = require('../master-order/masterOrderDelivery.service');
const {
  activeDocumentFilter,
  returnConfirmedFilter,
  businessDateStages,
  numberExpression,
  deliveryStaffCodeExpression,
  deliveryStaffNameExpression
} = require('./DashboardMongoExpressions');

const DELIVERED_STATUSES = Object.freeze(['delivered', 'success', 'completed', 'done', 'paid', 'accounting_confirmed']);
const FAILED_DELIVERY_STATUSES = Object.freeze(['failed', 'cancelled', 'canceled', 'returned', 'delivery_failed']);
const DELIVERING_STATUSES = Object.freeze(['delivering', 'in_progress', 'on_route', 'shipping']);

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function text(value) {
  return String(value || '').trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}


function parseYmd(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: match[1], month: match[2], day: match[3] };
}

function dateRangePrefilter(dateFrom, dateTo, fields = []) {
  const fromText = text(dateFrom).slice(0, 10);
  const toText = text(dateTo).slice(0, 10);
  if (!fromText || !toText) return null;
  const uniqueFields = unique([...fields, 'createdAt']);
  const fromParts = parseYmd(fromText);
  const toParts = parseYmd(toText);
  const clauses = [];
  const startDate = new Date(`${fromText}T00:00:00.000Z`);
  const endDate = new Date(`${toText}T00:00:00.000Z`);
  if (Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime())) {
    endDate.setUTCDate(endDate.getUTCDate() + 1);
  }
  const sameMonth = fromParts && toParts && fromParts.year === toParts.year && fromParts.month === toParts.month;
  const legacyMonthRegex = sameMonth ? new RegExp(`^(\\d{1,2}[\\/\\-.]${fromParts.month}[\\/\\-.]${fromParts.year}|${fromParts.year}[\\/\\-.]${fromParts.month})`) : null;
  for (const field of uniqueFields) {
    clauses.push({ [field]: { $gte: fromText, $lte: toText } });
    if (Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime())) {
      clauses.push({ [field]: { $gte: startDate, $lt: endDate } });
    }
    if (legacyMonthRegex) clauses.push({ [field]: { $regex: legacyMonthRegex } });
  }
  return clauses.length ? { $match: { $or: clauses } } : null;
}

function referenceValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(referenceValues);
  if (typeof value === 'object') {
    return unique([
      value.id,
      value._id,
      value.code,
      value.orderId,
      value.orderCode,
      value.salesOrderId,
      value.salesOrderCode,
      value.documentCode
    ]);
  }
  return [text(value)].filter(Boolean);
}

function masterChildReferences(master = {}) {
  return unique([
    ...referenceValues(master.childOrderIds),
    ...referenceValues(master.orderIds),
    ...referenceValues(master.salesOrderIds),
    ...referenceValues(master.children),
    ...referenceValues(master.childOrders),
    ...referenceValues(master.salesOrders),
    ...referenceValues(master.orderCodes),
    ...referenceValues(master.salesOrderCodes)
  ]);
}

function salesOrderKeys(order = {}) {
  return unique([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode
  ]);
}

function deliveryIdentity(source = {}, fallback = {}) {
  return {
    deliveryStaffCode: text(source.deliveryStaffCode || source.deliveryCode || source.nvghCode || fallback.deliveryStaffCode || fallback.deliveryCode || fallback.nvghCode),
    deliveryStaffName: text(source.deliveryStaffName || source.deliveryName || source.nvghName || fallback.deliveryStaffName || fallback.deliveryName || fallback.nvghName)
  };
}

function salesIdentity(source = {}, fallback = {}) {
  return {
    salesStaffCode: text(source.salesStaffCode || source.salesmanCode || source.nvbhCode || fallback.salesStaffCode || fallback.salesmanCode || fallback.nvbhCode)
  };
}

function statusBucket(source = {}, fallback = {}) {
  const status = text(source.deliveryStatus || source.status || fallback.deliveryStatus || fallback.status).toLowerCase();
  if (DELIVERED_STATUSES.includes(status)) return 'delivered';
  if (FAILED_DELIVERY_STATUSES.includes(status)) return 'failed';
  if (DELIVERING_STATUSES.includes(status)) return 'delivering';
  return 'pending';
}

function childOrderFilter(refs = []) {
  const values = unique(refs);
  if (!values.length) return null;
  const salesOrderIds = values.filter((value) => /^SO\d+$/i.test(value));
  const otherValues = values.filter((value) => !/^SO\d+$/i.test(value));
  if (salesOrderIds.length && !otherValues.length) return { id: { $in: salesOrderIds } };

  const clauses = [];
  if (salesOrderIds.length) clauses.push({ id: { $in: salesOrderIds } });
  if (otherValues.length) {
    clauses.push(
      { code: { $in: otherValues } },
      { orderCode: { $in: otherValues } },
      { salesOrderCode: { $in: otherValues } },
      { documentCode: { $in: otherValues } },
      { invoiceCode: { $in: otherValues } }
    );
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function ensureDeliveryAccumulator(map, identity = {}) {
  const code = text(identity.deliveryStaffCode);
  const name = text(identity.deliveryStaffName);
  if (!code && !name) return null;
  const key = code ? `code:${code}` : `name:${name.toLowerCase()}`;
  if (!map.has(key)) {
    map.set(key, {
      deliveryStaffCode: code,
      deliveryStaffName: name,
      tripKeys: new Set(),
      salesStaffCodes: new Set(),
      assignedOrders: 0,
      deliveredOrders: 0,
      deliveringOrders: 0,
      pendingOrders: 0,
      failedOrders: 0,
      assignedAmount: 0,
      deliveredAmount: 0
    });
  }
  return map.get(key);
}

function addDeliveryDocument(acc, source = {}, fallback = {}, uniqueKey = '') {
  if (!acc) return;
  const bucket = statusBucket(source, fallback);
  const amount = Math.max(0, normalizeMoney(source.totalAmount ?? source.totalReceivable ?? source.receivableAmount ?? source.grandTotal ?? source.amount ?? 0));
  acc.assignedOrders += 1;
  acc[`${bucket}Orders`] += 1;
  acc.assignedAmount += amount;
  if (bucket === 'delivered') acc.deliveredAmount += amount;
  const sales = salesIdentity(source, fallback);
  if (sales.salesStaffCode) acc.salesStaffCodes.add(sales.salesStaffCode);
  if (uniqueKey) acc.tripKeys.add(uniqueKey);
}

async function aggregateDeliveryMonth(dateFrom, dateTo) {
  // MasterOrder xác định phạm vi chuyến giao; SalesOrder cung cấp trạng thái từng đơn con.
  // Chỉ 2 query Mongo theo batch, không N+1 và không đọc snapshot.
  const masterDatePrefilter = dateRangePrefilter(dateFrom, dateTo, ['deliveryDate', 'date']);
  const masters = await MasterOrder.aggregate([
    { $match: activeDocumentFilter() },
    ...(masterDatePrefilter ? [masterDatePrefilter] : []),
    ...businessDateStages(dateFrom, dateTo, ['deliveryDate', 'date']),
    {
      $project: {
        id: 1,
        code: 1,
        deliveryDate: 1,
        date: 1,
        deliveryStaffCode: 1,
        deliveryStaffName: 1,
        deliveryCode: 1,
        deliveryName: 1,
        nvghCode: 1,
        nvghName: 1,
        salesStaffCode: 1,
        salesStaffName: 1,
        salesmanCode: 1,
        nvbhCode: 1,
        status: 1,
        deliveryStatus: 1,
        totalAmount: 1,
        amount: 1,
        grandTotal: 1,
        total: 1,
        value: 1,
        orderCount: 1,
        childOrderCount: 1,
        childOrderIds: 1,
        orderIds: 1,
        salesOrderIds: 1,
        children: 1,
        childOrders: 1,
        salesOrders: 1,
        orderCodes: 1,
        salesOrderCodes: 1
      }
    }
  ]).allowDiskUse(true).exec();

  const refsByMaster = new Map();
  const allRefs = [];
  for (const master of masters) {
    const refs = masterChildReferences(master);
    refsByMaster.set(text(master.id || master.code || master._id), refs);
    allRefs.push(...refs);
  }

  const filter = childOrderFilter(allRefs);
  const children = filter
    ? await SalesOrder.find(filter).select({
      id: 1,
      code: 1,
      orderCode: 1,
      salesOrderCode: 1,
      documentCode: 1,
      invoiceCode: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      deliveryCode: 1,
      deliveryName: 1,
      nvghCode: 1,
      nvghName: 1,
      salesStaffCode: 1,
      salesStaffName: 1,
      salesmanCode: 1,
      salesmanName: 1,
      nvbhCode: 1,
      nvbhName: 1,
      deliveryStatus: 1,
      status: 1,
      totalAmount: 1,
      totalReceivable: 1,
      receivableAmount: 1,
      grandTotal: 1,
      amount: 1,
      deletedAt: 1
    }).lean()
    : [];

  const childByRef = new Map();
  for (const child of children) {
    if (child.deletedAt || ['void', 'cancelled', 'canceled', 'deleted', 'removed', 'duplicate_cancelled'].includes(text(child.status).toLowerCase())) continue;
    for (const key of salesOrderKeys(child)) childByRef.set(key, child);
  }

  const map = new Map();
  const usedChildren = new Set();
  for (const master of masters) {
    const masterKey = text(master.id || master.code || master._id);
    const refs = refsByMaster.get(masterKey) || [];
    let matchedChildren = 0;
    for (const ref of refs) {
      const child = childByRef.get(ref);
      if (!child) continue;
      const childKey = text(child.id || child.code || child.orderCode || ref);
      const usedKey = `${masterKey}::${childKey}`;
      if (usedChildren.has(usedKey)) continue;
      usedChildren.add(usedKey);
      matchedChildren += 1;
      const identity = deliveryIdentity(child, master);
      const acc = ensureDeliveryAccumulator(map, identity);
      addDeliveryDocument(acc, child, master, masterKey);
    }

    // Dữ liệu master cũ có thể chỉ lưu orderCount mà không giữ đủ child references.
    // Fallback này giữ số tổng, nhưng vẫn đánh dấu theo trạng thái master thay vì tự suy diễn.
    if (matchedChildren === 0) {
      const fallbackCount = Math.max(0, normalizeMoney(master.orderCount || master.childOrderCount || refs.length));
      const identity = deliveryIdentity(master);
      const acc = ensureDeliveryAccumulator(map, identity);
      const amount = Math.max(0, normalizeMoney(master.totalAmount ?? master.amount ?? master.grandTotal ?? master.total ?? master.value ?? 0));
      const bucket = statusBucket(master);
      if (acc) {
        acc.tripKeys.add(masterKey);
        acc.assignedOrders += fallbackCount;
        acc[`${bucket}Orders`] += fallbackCount;
        acc.assignedAmount += amount;
        if (bucket === 'delivered') acc.deliveredAmount += amount;
        const sales = salesIdentity(master);
        if (sales.salesStaffCode) acc.salesStaffCodes.add(sales.salesStaffCode);
      }
    }
  }

  const rows = Array.from(map.values()).map((row) => ({
    deliveryStaffCode: row.deliveryStaffCode,
    deliveryStaffName: row.deliveryStaffName,
    tripCount: row.tripKeys.size,
    salesStaffCount: row.salesStaffCodes.size,
    assignedOrders: row.assignedOrders,
    deliveredOrders: row.deliveredOrders,
    deliveringOrders: row.deliveringOrders,
    pendingOrders: row.pendingOrders,
    failedOrders: row.failedOrders,
    assignedAmount: row.assignedAmount,
    deliveredAmount: row.deliveredAmount
  })).sort((left, right) => right.assignedOrders - left.assignedOrders || String(left.deliveryStaffName || left.deliveryStaffCode).localeCompare(String(right.deliveryStaffName || right.deliveryStaffCode), 'vi'));

  return {
    rows,
    source: 'mongo:master_orders+orders',
    perf: {
      masterCount: masters.length,
      childReferenceCount: unique(allRefs).length,
      childCount: children.length
    }
  };
}

async function aggregateDeliveryReturns(dateFrom, dateTo) {
  const returnAmount = numberExpression(['returnAmount', 'amount', 'totalAmount', 'debtReduction'], 0);
  const result = await ReturnOrder.aggregate([
    {
      $match: {
        $and: [activeDocumentFilter(), returnConfirmedFilter()]
      }
    },
    ...businessDateStages(dateFrom, dateTo, ['deliveryDate', 'returnDate', 'documentDate', 'date']),
    {
      $group: {
        _id: {
          code: deliveryStaffCodeExpression(),
          name: deliveryStaffNameExpression()
        },
        returnAmount: { $sum: returnAmount }
      }
    }
  ]).allowDiskUse(true).exec();

  return result.map((row) => ({
    deliveryStaffCode: String(row?._id?.code || '').trim(),
    deliveryStaffName: String(row?._id?.name || '').trim(),
    returnAmount: Math.max(0, normalizeMoney(row.returnAmount))
  })).filter((row) => row.deliveryStaffCode || row.deliveryStaffName);
}

function mapTodaySummaryRows(result = {}) {
  const rows = Array.isArray(result.rows) ? result.rows : (Array.isArray(result.summary) ? result.summary : []);
  return rows.map((row) => {
    const assignedOrders = normalizeMoney(row.orderCount || row.assignedOrders);
    const deliveredOrders = normalizeMoney(row.deliveredCount || row.deliveredOrders);
    const deliveringOrders = normalizeMoney(row.deliveringCount || row.deliveringOrders);
    const rawPending = normalizeMoney(row.pendingCount || row.pendingOrders);
    return {
      deliveryStaffCode: String(row.deliveryStaffCode || '').trim(),
      deliveryStaffName: String(row.deliveryStaffName || '').trim(),
      salesStaffCount: normalizeMoney(row.salesStaffCount),
      assignedOrders,
      deliveredOrders,
      deliveringOrders,
      pendingOrders: Math.max(0, rawPending - deliveringOrders),
      failedOrders: normalizeMoney(row.failedCount || row.failedOrders),
      assignedAmount: Math.max(0, normalizeMoney(row.totalReceivable || row.totalAmount || row.assignedAmount)),
      deliveredAmount: Math.max(0, normalizeMoney(row.deliveredAmount)),
      returnAmount: Math.max(0, normalizeMoney(row.returnAmount))
    };
  }).filter((row) => row.deliveryStaffCode || row.deliveryStaffName);
}

async function aggregateDeliveryToday(date) {
  const result = await masterOrderDeliveryService.listDeliveryTodaySummary({ date, limit: 5000 });
  return {
    rows: mapTodaySummaryRows(result),
    source: 'mongo:master_orders+orders:delivery-today-canonical',
    perf: result?.perf || null
  };
}

module.exports = {
  DELIVERED_STATUSES,
  FAILED_DELIVERY_STATUSES,
  DELIVERING_STATUSES,
  aggregateDeliveryMonth,
  aggregateDeliveryToday,
  aggregateDeliveryReturns,
  mapTodaySummaryRows
};
