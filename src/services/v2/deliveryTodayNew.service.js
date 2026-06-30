'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

let models = null;
let deliveryListService = null;
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

function getDeliveryListService() {
  if (deliveryListService) return deliveryListService;
  deliveryListService = require('../master-order/masterOrderLegacy.service');
  return deliveryListService;
}

function setDeliveryListServiceForTest(nextService) {
  deliveryListService = nextService || null;
}

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normalizeQty(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? n : 0;
}

function normalizeOrderItem(item = {}) {
  const deliveredQty = normalizeQty(
    item.deliveredQty
      ?? item.deliveryQty
      ?? item.shipQty
      ?? item.quantity
      ?? item.qty
      ?? item.totalQty
      ?? item.soldQty
      ?? item.looseQty
      ?? item.units
  );
  const unitPrice = money(
    item.unitPrice
      ?? item.salePrice
      ?? item.price
      ?? item.finalPrice
      ?? item.priceAfterPromotion
      ?? item.actualPrice
  );
  const amount = money(item.amount ?? item.lineTotal ?? item.totalAmount ?? item.finalAmount ?? (deliveredQty * unitPrice));
  return {
    productCode: text(item.productCode || item.code || item.sku || item.itemCode),
    productName: text(item.productName || item.name || item.description || item.itemName),
    unit: text(item.unit || item.baseUnit || item.uom || item.unitName),
    deliveredQty,
    unitPrice,
    amount,
    conversionRate: normalizeQty(item.conversionRate || item.packing || item.boxSize || 0),
    caseQty: normalizeQty(item.caseQty || item.boxQty || item.thung || 0),
    looseQty: normalizeQty(item.looseQty || item.le || 0)
  };
}

function compactOrderItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeOrderItem)
    .filter((item) => item.productCode || item.productName || item.deliveredQty || item.amount);
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

function truthyFlag(value) {
  const normalized = text(value).toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function hasSearchCriteria(query = {}) {
  const q = text(query.q || query.search || query.keyword || query.orderCode || query.customerCode || query.customerName);
  const delivery = text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh);
  const salesman = text(query.salesman || query.salesStaffCode || query.salesStaff || query.nvbh);
  const deliveryDate = dateOnly(query.date || query.deliveryDate || query.orderDate);
  const dateTouched = truthyFlag(query.deliveryDateChangedByUser || query.deliveryDateTouched || query.dateTouched);
  return Boolean(q || delivery || salesman || (dateTouched && deliveryDate));
}

function emptyListResult(query = {}, reason = 'SEARCH_CRITERIA_REQUIRED') {
  return {
    rows: [],
    orders: [],
    summary: summarizeRows([]),
    diagnostics: {
      source: 'delivery-today-new-v2-guarded-empty',
      endpoint: '/api/new/delivery-today/orders',
      reason,
      searchCriteriaRequired: true,
      hasSearchCriteria: hasSearchCriteria(query),
      writePolicy: 'read-only; confirmed orders require DeliveryCloseoutCorrectionService; latest correction comes from deliveryCloseoutVersions',
      deliverySourceApplied: false,
      fallbackEnabled: false,
      matchKeys: []
    }
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

function firstMoney(source = {}, keys = []) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return money(source[key]);
  }
  return 0;
}

function closeoutMoneyBreakdown(closeout = {}) {
  const cashAmount = firstMoney(closeout, ['cashAmount', 'cashCollectedAmount', 'cash', 'cashInAmount', 'cashPaymentAmount']);
  const bankAmount = firstMoney(closeout, ['bankAmount', 'transferAmount', 'bankCollectedAmount', 'transferCollectedAmount', 'bankPaymentAmount']);
  const rewardAmount = firstMoney(closeout, ['rewardAmount', 'bonusAmount', 'rewardOffsetAmount', 'promotionOffsetAmount']);
  const offsetAmount = firstMoney(closeout, ['offsetAmount', 'debtOffsetAmount', 'otherOffsetAmount']);
  const explicitCollected = firstMoney(closeout, ['collectedAmount', 'cashCollectedTotal', 'paidAmount']);
  const breakdownCollected = cashAmount + bankAmount + rewardAmount + offsetAmount;
  return {
    cashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    collectedAmount: breakdownCollected || explicitCollected
  };
}

function deliveryOperationalMoneyBreakdown(order = {}) {
  const cashAmount = firstMoney(order, ['cashAmount', 'cashCollected', 'cashCollectedAmount']);
  const bankAmount = firstMoney(order, ['bankAmount', 'bankCollected', 'transferAmount', 'transferCollectedAmount']);
  const rewardAmount = firstMoney(order, ['rewardAmount', 'bonusAmount', 'displayRewardAmount', 'bonusReturnAmount']);
  const offsetAmount = firstMoney(order, ['offsetAmount', 'debtOffsetAmount', 'otherOffsetAmount']);
  return {
    cashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    collectedAmount: cashAmount + bankAmount + rewardAmount + offsetAmount
  };
}

function moneyBreakdownForOrder(order = {}) {
  const closeout = closeoutOf(order);
  const closeoutBreakdown = closeoutMoneyBreakdown(closeout);
  if (closeoutBreakdown.collectedAmount || !order._deliveryOperationalSource) return closeoutBreakdown;
  return deliveryOperationalMoneyBreakdown(order);
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

function numberValue(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? n : 0;
}

function normalizeReturnItem(item = {}) {
  const returnQty = numberValue(
    item.returnQty
      ?? item.returnedQty
      ?? item.actualReturnQty
      ?? item.quantity
      ?? item.qty
      ?? item.totalQty
      ?? item.units
      ?? item.looseQty
  );
  const unitPrice = money(
    item.unitPrice
      ?? item.salePrice
      ?? item.price
      ?? item.finalPrice
      ?? item.actualPrice
      ?? item.priceAfterPromotion
  );
  const amount = money(item.returnAmount ?? item.amount ?? item.lineTotal ?? item.totalAmount ?? (returnQty * unitPrice));
  return {
    productCode: text(item.productCode || item.code || item.sku || item.itemCode),
    productName: text(item.productName || item.name || item.description || item.itemName),
    unit: text(item.unit || item.baseUnit || item.uom || item.unitName),
    returnQty,
    unitPrice,
    amount
  };
}

function compactReturnItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeReturnItem)
    .filter((item) => item.productCode || item.productName || item.returnQty || item.amount);
}

function normalizeReturn(row = {}) {
  const items = compactReturnItems(row.items);
  const totalAmount = money(row.returnAmount ?? row.amount ?? row.totalAmount ?? returnAmountFromItems(items.length ? items : row.items));
  const totalQty = numberValue(
    row.totalQty
      ?? row.returnQty
      ?? row.quantity
      ?? row.qty
      ?? items.reduce((sum, item) => sum + numberValue(item.returnQty), 0)
  );
  const returnDate = dateOnly(row.returnDate || row.date || row.documentDate || row.deliveryDate || row.createdAt);
  return {
    id: text(row.id || row.code || row._id),
    code: text(row.code || row.returnOrderCode || row.id || row._id),
    orderId: text(row.salesOrderId || row.orderId || row.sourceOrderId),
    orderCode: text(row.salesOrderCode || row.orderCode || row.sourceOrderCode),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    amount: totalAmount,
    totalAmount,
    totalQty,
    status: text(row.status || row.returnStatus || row.returnState || 'valid'),
    accountingStatus: text(row.accountingStatus || ''),
    warehouseStatus: text(row.warehouseStatus || row.warehouseReceiveStatus || row.stockReceiveStatus || ''),
    stockPosted: row.stockPosted === true,
    note: text(row.note || row.accountingNote || ''),
    returnDate,
    createdAt: text(row.createdAt || row.date || row.returnDate || row.documentDate),
    items
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

function normalizeDeliveryOperationalRow(row = {}) {
  const orderId = text(row.salesOrderId || row.orderId || row.id || row._id);
  const code = text(row.salesOrderCode || row.orderCode || row.code || row.displayOrderCode || orderId);
  return {
    ...row,
    _deliveryOperationalSource: true,
    id: orderId || code,
    orderId: orderId || code,
    code,
    orderCode: code,
    salesOrderCode: code,
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName),
    deliveryDate: dateOnly(row.deliveryDate || row.date || row.orderDate || row.documentDate),
    totalAmount: money(row.totalReceivable ?? row.originalAmount ?? row.totalAmount ?? row.amount),
    items: compactOrderItems(row.items || row.orderItems || row.soldItems || row.products || row.lines || []),
    orderItems: compactOrderItems(row.orderItems || row.items || row.soldItems || row.products || row.lines || []),
    soldItems: compactOrderItems(row.soldItems || row.items || row.orderItems || row.products || row.lines || []),
    cashAmount: money(row.cashAmount ?? row.cashCollected ?? 0),
    bankAmount: money(row.bankAmount ?? row.bankCollected ?? row.transferAmount ?? 0),
    rewardAmount: money(row.rewardAmount ?? row.bonusAmount ?? row.displayRewardAmount ?? 0),
    offsetAmount: money(row.offsetAmount ?? 0),
    status: text(row.status || row.deliveryStatus || row.accountingStatus || 'draft'),
    accountingConfirmed: row.accountingConfirmed === true,
    accountingStatus: text(row.accountingStatus || '')
  };
}

async function loadDeliveryOperationalOrders(query = {}, options = {}) {
  const service = options.deliveryListService || getDeliveryListService();
  if (!service || typeof service.listDeliveryToday !== 'function') return [];
  const limit = Math.max(1, Math.min(500, Number(query.limit || 100)));
  const result = await service.listDeliveryToday({
    date: query.date || query.deliveryDate || query.orderDate,
    q: query.q || query.search || query.keyword,
    delivery: query.delivery || query.deliveryStaffCode || query.nvgh,
    deliveryStaff: query.delivery || query.deliveryStaffCode || query.nvgh,
    deliveryStaffCode: query.delivery || query.deliveryStaffCode || query.nvgh,
    salesman: query.salesman || query.salesStaffCode || query.nvbh,
    salesStaff: query.salesman || query.salesStaffCode || query.nvbh,
    salesStaffCode: query.salesman || query.salesStaffCode || query.nvbh,
    route: query.route || query.routeName,
    status: query.status,
    page: query.page || 1,
    limit
  });
  const rows = Array.isArray(result && result.orders) ? result.orders : [];
  return rows.map(normalizeDeliveryOperationalRow);
}

async function loadSalesOrdersFallback(query = {}, options = {}) {
  const { SalesOrder } = getModels();
  const limit = Math.max(1, Math.min(500, Number(query.limit || 100)));
  const match = buildOrderMatch(query);
  const mongoQuery = SalesOrder.find(match).sort({ deliveryDate: -1, orderDate: -1, createdAt: -1 }).limit(limit).lean();
  if (options.session) mongoQuery.session(options.session);
  return mongoQuery;
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
  const baseBreakdown = moneyBreakdownForOrder(order);
  const adjustedCashAmount = latestVersion
    ? money(baseBreakdown.cashAmount + money(latestVersion.cashAdjustmentAmount))
    : baseBreakdown.cashAmount;
  const bankAmount = baseBreakdown.bankAmount;
  const rewardAmount = baseBreakdown.rewardAmount;
  const offsetAmount = baseBreakdown.offsetAmount;
  const collected = money((latestVersion && (latestVersion.collectedAmount ?? latestVersion.cashCollectedAmount))
    ?? (baseBreakdown.collectedAmount || collectedAmount(order)));
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
    items: compactOrderItems(order.items || order.orderItems || order.soldItems || order.products || order.lines || []),
    orderItems: compactOrderItems(order.orderItems || order.items || order.soldItems || order.products || order.lines || []),
    soldItems: compactOrderItems(order.soldItems || order.items || order.orderItems || order.products || order.lines || []),
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
    returnOrderCount: uniqueReturns.length,
    returnOrderCodes: uniqueReturns.map((row) => row.code || row.id).filter(Boolean),
    latestReturnDate: uniqueReturns.map((row) => row.returnDate || row.createdAt).filter(Boolean).sort().slice(-1)[0] || '',
    returnOrders: uniqueReturns.map((row) => ({
      id: row.id,
      code: row.code,
      returnDate: row.returnDate,
      status: row.status,
      accountingStatus: row.accountingStatus,
      warehouseStatus: row.warehouseStatus,
      stockPosted: row.stockPosted,
      note: row.note,
      totalAmount: money(row.totalAmount ?? row.amount),
      totalQty: numberValue(row.totalQty),
      items: Array.isArray(row.items) ? row.items : []
    })),
    cashAmount: adjustedCashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
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
    summary.cashAmount += money(row.cashAmount);
    summary.bankAmount += money(row.bankAmount);
    summary.rewardAmount += money(row.rewardAmount);
    summary.offsetAmount += money(row.offsetAmount);
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
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    collectedAmount: 0,
    finalDebtAmount: 0
  });
}

async function listOrders(query = {}, options = {}) {
  if (!hasSearchCriteria(query)) {
    return emptyListResult(query);
  }
  const useSalesOrderFallback = query.includeUnassignedSalesOrders === '1' || options.includeUnassignedSalesOrders === true;
  const deliveryOrders = await loadDeliveryOperationalOrders(query, options);
  const orders = deliveryOrders.length || !useSalesOrderFallback
    ? deliveryOrders
    : await loadSalesOrdersFallback(query, options);
  const returnsByKey = await loadReturnsForOrders(orders, options);
  const versionsByKey = await loadLatestVersionsForOrders(orders, options);
  const rows = orders.map((order) => summarizeOrder(order, returnsByKey, versionsByKey));
  return {
    rows,
    orders: rows,
    summary: summarizeRows(rows),
    diagnostics: {
      source: deliveryOrders.length || !useSalesOrderFallback
        ? 'delivery-today-new-v2-delivery-operational-list + returnOrders + correction-versions'
        : 'delivery-today-new-v2-salesOrders-fallback',
      endpoint: '/api/new/delivery-today/orders',
      writePolicy: 'read-only; confirmed orders require DeliveryCloseoutCorrectionService; latest correction comes from deliveryCloseoutVersions',
      deliverySourceApplied: Boolean(deliveryOrders.length || !useSalesOrderFallback),
      fallbackEnabled: useSalesOrderFallback,
      hasSearchCriteria: hasSearchCriteria(query),
      matchKeys: Object.keys(buildOrderMatch(query))
    }
  };
}

module.exports = {
  listOrders,
  hasSearchCriteria,
  buildOrderMatch,
  summarizeOrder,
  summarizeRows,
  setModelsForTest,
  setDeliveryListServiceForTest,
  _private: { money, truthyFlag, hasSearchCriteria, emptyListResult, normalizeQty, normalizeOrderItem, compactOrderItems, numberValue, orderBusinessIds, returnAmountFromItems, normalizeReturnItem, compactReturnItems, isValidReturn, normalizeReturn, normalizeDeliveryOperationalRow, loadDeliveryOperationalOrders, loadSalesOrdersFallback, loadReturnsForOrders, loadLatestVersionsForOrders, latestVersionForOrder, closeoutMoneyBreakdown, deliveryOperationalMoneyBreakdown, moneyBreakdownForOrder }
};
