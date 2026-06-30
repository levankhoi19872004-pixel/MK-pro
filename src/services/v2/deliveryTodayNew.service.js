'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

let models = null;
function getModels() {
  if (models) return models;
  models = {
    SalesOrder: require('../../models/SalesOrder'),
    ReturnOrder: require('../../models/ReturnOrder'),
    DeliveryCloseoutVersion: require('../../models/DeliveryCloseoutVersion')
  };
  return models;
}

function setModelsForTest(nextModels) {
  models = nextModels || null;
}

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function dateOnly(value) {
  return dateUtil.toDateOnly(value || '', '');
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

function buildOrderMatch(query = {}) {
  const match = activeOrderMatch();
  const deliveryDate = dateOnly(query.date || query.deliveryDate || query.orderDate);
  if (deliveryDate) {
    const rx = new RegExp(`^${escapeRegExp(deliveryDate)}$`);
    match.$or = [
      { deliveryDate: rx },
      { orderDate: rx },
      { documentDate: rx },
      { date: rx }
    ];
  }

  const q = text(query.q || query.search || query.keyword);
  if (q) {
    const rx = new RegExp(escapeRegExp(q), 'i');
    const condition = {
      $or: [
        { id: rx },
        { code: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { customerCode: rx },
        { customerName: rx },
        { deliveryStaffCode: rx },
        { deliveryStaffName: rx },
        { salesStaffCode: rx },
        { salesStaffName: rx }
      ]
    };
    if (match.$or) {
      match.$and = [{ $or: match.$or }, condition];
      delete match.$or;
    } else {
      Object.assign(match, condition);
    }
  }

  const delivery = text(query.delivery || query.deliveryStaffCode || query.nvgh);
  if (delivery) {
    const rx = new RegExp(escapeRegExp(delivery), 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }, { deliveryCode: rx }, { nvghCode: rx }] });
  }

  const salesman = text(query.salesman || query.salesStaffCode || query.nvbh);
  if (salesman) {
    const rx = new RegExp(escapeRegExp(salesman), 'i');
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [{ salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { nvbhCode: rx }] });
  }

  return match;
}

function orderBusinessIds(order = {}) {
  return [
    text(order.id),
    text(order.code),
    text(order.orderCode),
    text(order.salesOrderCode),
    text(order.documentCode),
    text(order.invoiceCode),
    text(order._id)
  ].filter(Boolean);
}

function orderCode(order = {}) {
  return text(order.code || order.orderCode || order.salesOrderCode || order.id || order._id);
}

function orderAmount(order = {}) {
  return money(order.totalAmount ?? order.amount ?? order.total ?? order.finalAmount ?? order.orderAmount);
}

function closeoutOf(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

function closeoutStatus(order = {}) {
  return text(closeoutOf(order).status || order.accountingStatus || order.status || order.deliveryStatus || 'draft');
}

function isConfirmedCloseout(order = {}) {
  const closeout = closeoutOf(order);
  const versions = Array.isArray(closeout.versions) ? closeout.versions : [];
  return closeoutStatus(order) === 'accounting_confirmed'
    || order.accountingConfirmed === true
    || versions.some((version) => text(version.status) === 'accounting_confirmed');
}

function returnAmountFromItems(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const qty = money(item.returnQty ?? item.quantity ?? item.qty ?? item.totalQty ?? item.units);
    const price = money(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice);
    const lineAmount = money(item.returnAmount ?? item.amount ?? item.lineTotal ?? (qty * price));
    return sum + lineAmount;
  }, 0);
}

function normalizeReturn(row = {}) {
  return {
    id: text(row.id || row.code || row._id),
    code: text(row.code || row.returnOrderCode || row.id || row._id),
    orderId: text(row.salesOrderId || row.orderId || row.sourceOrderId),
    orderCode: text(row.salesOrderCode || row.orderCode || row.sourceOrderCode),
    amount: money(row.returnAmount ?? row.amount ?? returnAmountFromItems(row.items)),
    status: text(row.status || row.returnStatus || row.returnState || 'valid'),
    stockPosted: row.stockPosted === true,
    createdAt: text(row.createdAt || row.date || row.returnDate || row.documentDate)
  };
}

function isValidReturn(row = {}) {
  const status = text(row.status || row.returnStatus || row.returnState).toLowerCase();
  return !['cancelled', 'canceled', 'void', 'voided', 'deleted', 'rejected'].includes(status)
    && row.deleted !== true
    && row.isDeleted !== true;
}

async function loadReturnsForOrders(orders = [], options = {}) {
  const ids = Array.from(new Set(orders.flatMap(orderBusinessIds).filter(Boolean)));
  if (!ids.length) return new Map();
  const { ReturnOrder } = getModels();
  const match = {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { salesOrderId: { $in: ids } },
      { orderId: { $in: ids } },
      { sourceOrderId: { $in: ids } },
      { salesOrderCode: { $in: ids } },
      { orderCode: { $in: ids } },
      { sourceOrderCode: { $in: ids } }
    ]
  };
  const query = ReturnOrder.find(match).lean();
  if (options.session) query.session(options.session);
  const rows = await query;
  const map = new Map();
  for (const row of rows || []) {
    if (!isValidReturn(row)) continue;
    const normalized = normalizeReturn(row);
    const keys = [normalized.orderId, normalized.orderCode].filter(Boolean);
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(normalized);
    }
  }
  return map;
}


async function loadLatestVersionsForOrders(orders = [], options = {}) {
  const ids = Array.from(new Set(orders.flatMap(orderBusinessIds).filter(Boolean)));
  if (!ids.length) return new Map();
  const { DeliveryCloseoutVersion } = getModels();
  const match = {
    $or: [
      { salesOrderId: { $in: ids } },
      { salesOrderCode: { $in: ids } },
      { orderId: { $in: ids } },
      { orderCode: { $in: ids } },
      { originalCloseoutId: { $in: ids } },
      { originalCloseoutCode: { $in: ids } }
    ]
  };
  const query = DeliveryCloseoutVersion.find(match).sort({ closeoutVersion: -1, createdAt: -1 }).lean();
  if (options.session) query.session(options.session);
  const rows = await query;
  const map = new Map();
  for (const row of rows || []) {
    const keys = [row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode, row.originalCloseoutId, row.originalCloseoutCode].map(text).filter(Boolean);
    for (const key of keys) {
      const current = map.get(key);
      if (!current || Number(row.closeoutVersion || 0) > Number(current.closeoutVersion || 0)) map.set(key, row);
    }
  }
  return map;
}

function latestVersionForOrder(order = {}, versionsByKey = new Map()) {
  for (const id of orderBusinessIds(order)) {
    const version = versionsByKey.get(id);
    if (version) return version;
  }
  return null;
}

function collectedAmount(order = {}) {
  const closeout = closeoutOf(order);
  return money(closeout.collectedAmount ?? order.collectedAmount ?? order.deliveryCollectedAmount ?? order.paidAmount ?? order.paymentAmount ?? 0);
}

function summarizeOrder(order = {}, returnsByKey = new Map(), versionsByKey = new Map()) {
  const ids = orderBusinessIds(order);
  const returns = ids.flatMap((id) => returnsByKey.get(id) || []);
  const seen = new Set();
  const uniqueReturns = returns.filter((row) => {
    const key = row.id || row.code;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const closeout = closeoutOf(order);
  const latestVersion = latestVersionForOrder(order, versionsByKey);
  const originalAmount = money((latestVersion && (latestVersion.originalAmount ?? latestVersion.saleAmount)) ?? closeout.originalAmount ?? orderAmount(order));
  const legacyReturnedAmount = money(uniqueReturns.reduce((sum, row) => sum + money(row.amount), 0));
  const returnedAmount = money((latestVersion && (latestVersion.returnedAmount ?? latestVersion.returnAmount)) ?? legacyReturnedAmount);
  const collected = money((latestVersion && (latestVersion.collectedAmount ?? latestVersion.cashCollectedAmount)) ?? collectedAmount(order));
  const finalDebtAmount = money((latestVersion && (latestVersion.finalDebtAmount ?? latestVersion.debtAmount)) ?? (originalAmount - returnedAmount - collected));
  const closeoutFinalDebt = latestVersion
    ? finalDebtAmount
    : (closeout.finalDebtAmount !== undefined ? money(closeout.finalDebtAmount) : finalDebtAmount);
  return {
    id: text(order.id || order._id),
    orderId: text(order.id || order._id),
    orderCode: orderCode(order),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    deliveryDate: dateOnly(order.deliveryDate || order.orderDate || order.date || order.documentDate),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
    status: text(order.status || order.deliveryStatus || order.accountingStatus || 'draft'),
    closeoutStatus: latestVersion ? text(latestVersion.status || 'corrected_confirmed') : closeoutStatus(order),
    accountingConfirmed: isConfirmedCloseout(order),
    correctionVersionApplied: Boolean(latestVersion),
    correctionId: latestVersion ? text(latestVersion.correctionId) : '',
    correctionCode: latestVersion ? text(latestVersion.correctionCode) : '',
    closeoutVersionId: latestVersion ? text(latestVersion.id || latestVersion.code) : '',
    returnAdjustmentAmount: latestVersion ? money(latestVersion.returnAdjustmentAmount) : 0,
    cashAdjustmentAmount: latestVersion ? money(latestVersion.cashAdjustmentAmount) : 0,
    debtAdjustmentAmount: latestVersion ? money(latestVersion.debtAdjustmentAmount) : 0,
    originalAmount,
    returnedAmount,
    collectedAmount: collected,
    finalDebtAmount,
    closeoutFinalDebtAmount: closeoutFinalDebt,
    closeoutDelta: money(closeoutFinalDebt - finalDebtAmount),
    returnOrderIds: uniqueReturns.map((row) => row.id || row.code).filter(Boolean),
    paymentIds: Array.isArray(closeout.paymentIds) ? closeout.paymentIds : [],
    version: latestVersion ? Number(latestVersion.closeoutVersion || 0) : Number(closeout.version || (Array.isArray(closeout.versions) ? closeout.versions.length : 0) || 0),
    source: latestVersion ? 'deliveryCloseoutVersions + AR-DEBT-ADJUSTMENT' : 'salesOrders.deliveryCloseout + returnOrders',
    correctionRequired: isConfirmedCloseout(order),
    correctionMessage: isConfirmedCloseout(order) ? 'Đơn đã xác nhận kế toán: mọi sửa đổi phải qua correction flow.' : ''
  };
}

function summarizeRows(rows = []) {
  return rows.reduce((summary, row) => {
    summary.orderCount += 1;
    summary.originalAmount += money(row.originalAmount);
    summary.returnedAmount += money(row.returnedAmount);
    summary.collectedAmount += money(row.collectedAmount);
    summary.finalDebtAmount += money(row.finalDebtAmount);
    if (row.accountingConfirmed) summary.accountingConfirmedCount += 1;
    if (row.closeoutDelta !== 0) summary.closeoutMismatchCount += 1;
    return summary;
  }, {
    orderCount: 0,
    accountingConfirmedCount: 0,
    closeoutMismatchCount: 0,
    originalAmount: 0,
    returnedAmount: 0,
    collectedAmount: 0,
    finalDebtAmount: 0
  });
}

async function listOrders(query = {}, options = {}) {
  const { SalesOrder } = getModels();
  const limit = Math.max(1, Math.min(500, Number(query.limit || 100)));
  const match = buildOrderMatch(query);
  const mongoQuery = SalesOrder.find(match).sort({ deliveryDate: -1, orderDate: -1, createdAt: -1 }).limit(limit).lean();
  if (options.session) mongoQuery.session(options.session);
  const orders = await mongoQuery;
  const returnsByKey = await loadReturnsForOrders(orders, options);
  const versionsByKey = await loadLatestVersionsForOrders(orders, options);
  const rows = orders.map((order) => summarizeOrder(order, returnsByKey, versionsByKey));
  return {
    rows,
    orders: rows,
    summary: summarizeRows(rows),
    diagnostics: {
      source: 'delivery-today-new-v2-correction-version-aware',
      endpoint: '/api/delivery-new/orders',
      writePolicy: 'read-only; confirmed orders require DeliveryCloseoutCorrectionService; latest correction comes from deliveryCloseoutVersions',
      matchKeys: Object.keys(match)
    }
  };
}

module.exports = {
  listOrders,
  buildOrderMatch,
  summarizeOrder,
  summarizeRows,
  setModelsForTest,
  _private: { money, orderBusinessIds, returnAmountFromItems, isValidReturn, normalizeReturn, loadLatestVersionsForOrders, latestVersionForOrder }
};
