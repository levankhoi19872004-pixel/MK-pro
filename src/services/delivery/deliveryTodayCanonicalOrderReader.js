'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function dateOnly(value) {
  if (value instanceof Date) return dateUtil.dateKeyInTimeZone(value, dateUtil.VIETNAM_TIME_ZONE);
  return dateUtil.toDateOnly(value || '', '');
}

function normalizeDeliveryDateInput(input) {
  return dateUtil.normalizeDeliveryDateInput(input, dateUtil.VIETNAM_TIME_ZONE);
}

function displayDateFromDateKey(dateKey) {
  return dateUtil.displayDateFromDateKey(dateKey);
}

function buildDateFilterDiagnostics(input) {
  const normalized = normalizeDeliveryDateInput(input);
  return {
    requestedDate: normalized.selectedDateKey || '',
    timezone: normalized.timezone,
    canonicalField: 'orders.deliveryDate',
    startInclusive: normalized.startInclusive || '',
    endExclusive: normalized.endExclusive || '',
    fallbackDateFieldsUsed: [],
    warnings: []
  };
}

function escapeRegExp(value = '') {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function activeOrderMatch() {
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    deleteMode: { $nin: ['hard_deleted', 'deleted'] }
  };
}

function pushAnd(match, condition) {
  match.$and = Array.isArray(match.$and) ? match.$and : [];
  match.$and.push(condition);
}

function buildCanonicalDateCondition(dateFilter) {
  if (!dateFilter || !dateFilter.selectedDateKey) return null;
  const key = dateFilter.selectedDateKey;
  const display = displayDateFromDateKey(key);
  const keyPrefix = new RegExp(`^${escapeRegExp(key)}(?:T|\\s|$)`);
  const displayRx = display ? new RegExp(`^${escapeRegExp(display)}$`) : null;
  const or = [
    { deliveryDate: key },
    { deliveryDate: keyPrefix },
    { deliveryDateKey: key }
  ];
  if (displayRx) or.push({ deliveryDate: displayRx });
  if (dateFilter.startOfDayVN && dateFilter.endOfDayVN) {
    or.push({ deliveryDate: { $gte: dateFilter.startOfDayVN, $lt: dateFilter.endOfDayVN } });
  }
  return { $or: or };
}

function buildCanonicalSalesOrderMatch(query = {}, options = {}) {
  const match = activeOrderMatch();
  const dateFilter = normalizeDeliveryDateInput(query.date || query.deliveryDate);
  const dateCondition = buildCanonicalDateCondition(dateFilter);
  if (dateCondition) pushAnd(match, dateCondition);

  const q = text(query.q || query.search || query.keyword || query.orderCode || query.customerCode || query.customerName);
  if (q) {
    const rx = new RegExp(escapeRegExp(q), 'i');
    pushAnd(match, {
      $or: [
        { id: rx },
        { code: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { customerCode: rx },
        { customerName: rx },
        { phone: rx },
        { customerPhone: rx },
        { phoneNumber: rx },
        { deliveryStaffCode: rx },
        { deliveryStaffName: rx },
        { salesStaffCode: rx },
        { salesStaffName: rx }
      ]
    });
  }

  const salesman = text(query.salesman || query.salesStaffCode || query.salesStaff || query.nvbh);
  if (salesman) {
    const rx = new RegExp(escapeRegExp(salesman), 'i');
    pushAnd(match, { $or: [{ salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { nvbhCode: rx }] });
  }

  // Delivery staff is intentionally not used as the primary DB predicate when a
  // date/search scope exists. Some canonical orders have missing deliveryStaff*
  // and can be enriched from masterOrders metadata after the orders read. This
  // keeps orders/salesOrders as the primary source while allowing metadata-only
  // assignment support.
  const delivery = text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh);
  const hasOtherScope = Boolean(dateFilter.selectedDateKey || q || salesman || options.allowBroadDeliveryScan);
  if (delivery && !hasOtherScope) {
    const rx = new RegExp(escapeRegExp(delivery), 'i');
    pushAnd(match, { $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }, { deliveryCode: rx }, { nvghCode: rx }] });
  }

  return match;
}

function orderKeys(order = {}) {
  return Array.from(new Set([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.sourceId,
    order.sourceCode
  ].map(text).filter(Boolean)));
}

function masterKeys(order = {}) {
  return Array.from(new Set([
    order.masterOrderId,
    order.masterOrderCode,
    order.masterId,
    order.masterCode
  ].map(text).filter(Boolean)));
}

function queryChain(model, filter) {
  if (!model || typeof model.find !== 'function') throw new Error('SalesOrder model is required for canonical delivery-today reader');
  return model.find(filter);
}

async function executeLean(query) {
  if (!query) return [];
  if (typeof query.lean === 'function') return await query.lean();
  return await query;
}

function applySortLimit(query, sort, limit, session) {
  let q = query;
  if (q && typeof q.sort === 'function') q = q.sort(sort);
  if (q && typeof q.limit === 'function') q = q.limit(limit);
  if (session && q && typeof q.session === 'function') q = q.session(session);
  return q;
}

async function loadMasterOrderMetadata(orders = [], models = {}, options = {}) {
  const MasterOrder = models.MasterOrder;
  if (!MasterOrder || typeof MasterOrder.find !== 'function' || !orders.length) return { metadataByOrderKey: new Map(), masterRows: [] };
  const childKeys = Array.from(new Set(orders.flatMap(orderKeys).filter(Boolean)));
  const directMasterKeys = Array.from(new Set(orders.flatMap(masterKeys).filter(Boolean)));
  if (!childKeys.length && !directMasterKeys.length) return { metadataByOrderKey: new Map(), masterRows: [] };
  const filter = {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { childOrderIds: { $in: childKeys } },
      { childOrderCodes: { $in: childKeys } },
      { orderCodes: { $in: childKeys } },
      { salesOrderCodes: { $in: childKeys } }
    ]
  };
  if (directMasterKeys.length) {
    filter.$or.push({ id: { $in: directMasterKeys } }, { code: { $in: directMasterKeys } }, { masterOrderCode: { $in: directMasterKeys } });
  }
  let q = MasterOrder.find(filter);
  q = applySortLimit(q, { updatedAt: -1, createdAt: -1 }, Math.max(1000, childKeys.length * 2), options.session);
  const rows = await executeLean(q);
  const map = new Map();
  for (const master of rows || []) {
    const keys = [
      ...(Array.isArray(master.childOrderIds) ? master.childOrderIds : []),
      ...(Array.isArray(master.childOrderCodes) ? master.childOrderCodes : []),
      ...(Array.isArray(master.orderCodes) ? master.orderCodes : []),
      ...(Array.isArray(master.salesOrderCodes) ? master.salesOrderCodes : [])
    ].map(text).filter(Boolean);
    for (const key of keys) {
      if (!map.has(key)) map.set(key, master);
    }
    for (const key of directMasterKeys) {
      if ([master.id, master.code, master.masterOrderCode].map(text).includes(key)) {
        for (const order of orders) for (const orderKey of orderKeys(order)) map.set(orderKey, master);
      }
    }
  }
  return { metadataByOrderKey: map, masterRows: rows || [] };
}

function metadataForOrder(order = {}, metadataByOrderKey = new Map()) {
  for (const key of orderKeys(order)) {
    const row = metadataByOrderKey.get(key);
    if (row) return row;
  }
  return null;
}

function enrichOrderWithMasterMetadata(order = {}, master = null) {
  if (!master) return { ...order, _canonicalPrimarySource: 'orders', _masterOrdersMetadataApplied: false };
  const deliveryStaffCode = text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode) || text(master.deliveryStaffCode || master.deliveryCode || master.nvghCode);
  const deliveryStaffName = text(order.deliveryStaffName || order.deliveryName || order.nvghName) || text(master.deliveryStaffName || master.deliveryName || master.nvghName);
  return {
    ...order,
    _canonicalPrimarySource: 'orders',
    _masterOrdersMetadataApplied: true,
    masterOrderId: text(order.masterOrderId || order.masterId || master.id || master._id || ''),
    masterOrderCode: text(order.masterOrderCode || order.masterCode || master.code || master.masterOrderCode || ''),
    deliveryStaffCode,
    deliveryStaffName,
    deliveryCode: text(order.deliveryCode || deliveryStaffCode),
    deliveryName: text(order.deliveryName || deliveryStaffName),
    nvghCode: text(order.nvghCode || deliveryStaffCode),
    nvghName: text(order.nvghName || deliveryStaffName)
  };
}

function fieldMatches(value, needle) {
  if (!needle) return true;
  return text(value).toLowerCase().includes(text(needle).toLowerCase());
}

function deliveryMatches(order = {}, query = {}) {
  const delivery = text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh);
  if (!delivery) return true;
  return [order.deliveryStaffCode, order.deliveryStaffName, order.deliveryCode, order.deliveryName, order.nvghCode, order.nvghName]
    .some((value) => fieldMatches(value, delivery));
}

function canonicalDeliveryDateKey(row = {}) {
  return dateOnly(row.deliveryDate ?? row.deliveryDateKey ?? '');
}

function normalizeCanonicalOrder(row = {}, dateFilter = null) {
  const deliveryDateKey = canonicalDeliveryDateKey(row);
  const dateWarnings = [];
  if (!deliveryDateKey) dateWarnings.push('ORDER_MISSING_CANONICAL_DELIVERY_DATE');
  const requested = dateFilter && dateFilter.selectedDateKey ? dateFilter.selectedDateKey : '';
  const dateFilterMatched = requested ? deliveryDateKey === requested : true;
  if (requested && !dateFilterMatched) dateWarnings.push('ORDER_DELIVERY_DATE_MISMATCH');
  return {
    ...row,
    _canonicalPrimarySource: 'orders',
    id: text(row.id || row._id || row.orderId || row.code || row.orderCode || row.salesOrderCode),
    orderId: text(row.id || row._id || row.orderId || row.code || row.orderCode || row.salesOrderCode),
    code: text(row.code || row.orderCode || row.salesOrderCode || row.id || row._id),
    orderCode: text(row.orderCode || row.code || row.salesOrderCode || row.id || row._id),
    salesOrderCode: text(row.salesOrderCode || row.orderCode || row.code || row.id || row._id),
    deliveryDate: deliveryDateKey,
    deliveryDateDisplay: displayDateFromDateKey(deliveryDateKey),
    deliveryDateSource: deliveryDateKey ? 'orders.deliveryDate' : '',
    dateFilterMatched,
    dateWarnings,
    totalAmount: money(row.totalAmount ?? row.amount ?? row.total ?? row.finalAmount ?? row.orderAmount)
  };
}

async function listSalesOrders(query = {}, models = {}, options = {}) {
  const SalesOrder = models.SalesOrder;
  const limit = Math.max(1, Math.min(500, Number(query.limit || options.limit || 100)));
  const hasDeliveryFilter = Boolean(text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh));
  const dateFilter = normalizeDeliveryDateInput(query.date || query.deliveryDate);
  const dbLimit = hasDeliveryFilter ? Math.min(2000, Math.max(limit * 5, 500)) : limit;
  const match = buildCanonicalSalesOrderMatch(query, { allowBroadDeliveryScan: Boolean(dateFilter.selectedDateKey) });
  let q = queryChain(SalesOrder, match);
  q = applySortLimit(q, { deliveryDate: -1, createdAt: -1 }, dbLimit, options.session);
  const rawRows = await executeLean(q);
  const normalizedRows = (Array.isArray(rawRows) ? rawRows : []).map((row) => normalizeCanonicalOrder(row, dateFilter));
  const dateFilteredRows = dateFilter.selectedDateKey
    ? normalizedRows.filter((row) => row.dateFilterMatched)
    : normalizedRows;
  const dateMismatchCount = normalizedRows.length - dateFilteredRows.length;
  const metadata = await loadMasterOrderMetadata(dateFilteredRows, models, options);
  const enriched = dateFilteredRows.map((row) => enrichOrderWithMasterMetadata(row, metadataForOrder(row, metadata.metadataByOrderKey)));
  const filtered = enriched.filter((row) => deliveryMatches(row, query)).slice(0, limit);
  const dateDiagnostics = buildDateFilterDiagnostics(query.date || query.deliveryDate);
  if (dateMismatchCount > 0) dateDiagnostics.warnings.push('ORDER_DELIVERY_DATE_MISMATCH_FILTERED');
  const missingDateCount = normalizedRows.filter((row) => Array.isArray(row.dateWarnings) && row.dateWarnings.includes('ORDER_MISSING_CANONICAL_DELIVERY_DATE')).length;
  if (missingDateCount > 0) dateDiagnostics.warnings.push('ORDER_MISSING_CANONICAL_DELIVERY_DATE');
  return {
    orders: filtered,
    diagnostics: {
      reader: 'deliveryTodayCanonicalOrderReader',
      primarySource: 'orders',
      orderSource: 'orders',
      masterOrdersRole: 'metadata-only',
      match,
      dbLimit,
      limit,
      rawOrderCount: normalizedRows.length,
      dateFilteredOrderCount: dateFilteredRows.length,
      dateMismatchCount,
      missingCanonicalDeliveryDateCount: missingDateCount,
      returnedOrderCount: filtered.length,
      masterMetadataRows: metadata.masterRows.length,
      masterMetadataAppliedCount: filtered.filter((row) => row._masterOrdersMetadataApplied).length,
      dateFilter: dateDiagnostics,
      warnings: Array.from(new Set([...(dateDiagnostics.warnings || [])]))
    }
  };
}

module.exports = {
  listSalesOrders,
  buildCanonicalSalesOrderMatch,
  loadMasterOrderMetadata,
  enrichOrderWithMasterMetadata,
  orderKeys,
  deliveryMatches,
  normalizeDeliveryDateInput,
  buildCanonicalDateCondition,
  canonicalDeliveryDateKey
};
