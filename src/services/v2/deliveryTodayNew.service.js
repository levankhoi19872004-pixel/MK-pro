'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { normalizeDebtAmount, calculateDeliveryDebtAmount, DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');
const searchService = require('../searchService');
const { buildSourceNote } = require('../source-contracts/SourceNoteBuilder');
const deliveryTodayCanonicalOrderReader = require('../delivery/deliveryTodayCanonicalOrderReader');
const { calculateDeliveryTodayKpi } = require('../delivery/deliveryTodayKpiCalculator');
const { evaluateCloseoutEligibility } = require('../accounting/closeout/CloseoutEligibility');
const DeliveryPaymentStateReadService = require('../delivery/DeliveryPaymentStateReadService');
const {
  RETURN_ORDER_LOCK_PROJECTION,
  resolveDeliveryAccountingLockState
} = require('../../domain/returns/ReturnMutationGuard');


function buildDeliveryTodaySourceNotes(query = {}) {
  return {
    orders: buildSourceNote('delivery-today-orders', { filters: query }),
    byStaff: buildSourceNote('delivery-today-by-staff', { filters: query }),
    collections: buildSourceNote('delivery-today-collections', { filters: query }),
    returns: buildSourceNote('delivery-today-returns', { filters: query })
  };
}

let models = null;
let deliveryListServiceForTest = null;
function getModels() {
  if (models) return models;
  models = {
    SalesOrder: require('../../models/SalesOrder'),
    ReturnOrder: require('../../models/ReturnOrder'),
    DeliveryCloseoutVersion: require('../../models/DeliveryCloseoutVersion'),
    OrderPaymentAllocation: require('../../models/OrderPaymentAllocation'),
    MasterOrder: require('../../models/MasterOrder')
  };
  return models;
}

function setModelsForTest(nextModels) {
  models = nextModels || null;
}

// Legacy test hook kept for compatibility only. Delivery Today New no longer
// reads masterOrderLegacy.service.listDeliveryToday as the primary source.
function setDeliveryListServiceForTest(nextService) {
  deliveryListServiceForTest = nextService || null;
}

const RETURN_ORDER_HOT_PATH_PROJECTION = [
  '_id', 'id', 'code',
  'salesOrderId', 'orderId', 'sourceOrderId',
  'salesOrderCode', 'orderCode', 'sourceOrderCode',
  'amount', 'totalAmount', 'returnAmount', 'refundAmount', 'netAmount', 'receivableAmount',
  'items', 'returnItems', 'products', 'lines',
  'status', 'returnStatus', 'returnState',
  'accountingStatus', 'accountingConfirmed', 'warehouseStatus', 'warehouseReceiveStatus', 'stockReceiveStatus',
  'warehouseCheckStatus', 'warehouseConfirmed', 'warehouseCheckedAt', 'stockInStatus',
  'inventoryPosted', 'inventoryTransactionId', 'stockPosted', 'stockTransactionId', 'stockTransactionIds',
  'active', 'isCurrentVersion', 'version', 'updatedAt',
  'note', 'accountingNote', 'returnDate', 'date', 'documentDate', 'createdAt',
  'deleted', 'isDeleted',
  RETURN_ORDER_LOCK_PROJECTION
].join(' ');

const CLOSEOUT_VERSION_HOT_PATH_PROJECTION = [
  '_id', 'id', 'code',
  'salesOrderId', 'salesOrderCode', 'orderId', 'orderCode', 'originalCloseoutId', 'originalCloseoutCode',
  'closeoutVersion', 'sourceVersion', 'version', 'status', 'createdAt',
  'originalAmount', 'saleAmount', 'returnedAmount', 'returnAmount',
  'cashAmount', 'newCashAmount', 'cashCollectedAmount',
  'bankAmount', 'newBankAmount', 'rewardAmount', 'newRewardAmount',
  'collectedAmount', 'newCollectedAmount', 'finalDebtAmount', 'debtAmount',
  'correctionId', 'correctionCode', 'returnAdjustmentAmount',
  'totalCollectedDelta', 'cashAdjustmentAmount', 'cashDeltaAmount', 'bankDeltaAmount',
  'rewardDeltaAmount', 'debtDeltaAmount', 'debtAdjustmentAmount'
].join(' ');

const PAYMENT_ALLOCATION_HOT_PATH_PROJECTION = [
  '_id', 'id', 'allocationCode',
  'orderId', 'orderCode', 'sourceId', 'sourceCode',
  'status', 'sourceVersion', 'version', 'postedAt', 'updatedAt', 'createdAt',
  'receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount',
  'debtAmount', 'normalizedDebtAmount', 'rawDebtAmount'
].join(' ');

function applyProjection(query, projection) {
  if (query && projection && typeof query.select === 'function') return query.select(projection);
  return query;
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
  if (value instanceof Date) return dateUtil.dateKeyInTimeZone(value, dateUtil.VIETNAM_TIME_ZONE);
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
  const deliveryDate = dateOnly(query.date || query.deliveryDate);
  const explicitDateSearch = Boolean(deliveryDate) && truthyFlag(query.deliveryDateChangedByUser || query.dateChangedByUser || query.userSelectedDate);
  return Boolean(q.length >= 2 || delivery || salesman || explicitDateSearch);
}

function emptyListResult(query = {}, reason = 'SEARCH_CRITERIA_REQUIRED') {
  return {
    rows: [],
    orders: [],
    summary: summarizeRows([]),
    groups: [],
    requireFilter: true,
    message: 'Chọn NVGH, NVBH hoặc nhập tìm kiếm để tải đơn.',
    sourceNote: buildSourceNote('delivery-today-orders', { filters: query, sourceWarnings: ['Cần chọn bộ lọc trước khi đọc dữ liệu'] }),
    sourceNotes: buildDeliveryTodaySourceNotes(query),
    diagnostics: {
      source: 'delivery-today-new-v2-guarded-empty',
      endpoint: '/api/new/delivery-today/orders',
      reason,
      searchCriteriaRequired: true,
      requireFilter: true,
      hasSearchCriteria: hasSearchCriteria(query),
      writePolicy: 'read-only list; closeout must use POST /api/new/delivery-today/closeout; confirmed orders require DeliveryCloseoutCorrectionService; posted payment allocation comes from orderPaymentAllocations; latest correction comes from deliveryCloseoutVersions',
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      deliverySourceApplied: false,
      fallbackEnabled: false,
      matchKeys: []
    }
  };
}

function buildOrderMatch(query = {}) {
  const match = activeOrderMatch();
  const deliveryDate = dateOnly(query.date || query.deliveryDate);
  if (deliveryDate) {
    const rx = new RegExp(`^${escapeRegExp(deliveryDate)}(?:T|\\s|$)`);
    match.$and = Array.isArray(match.$and) ? match.$and : [];
    match.$and.push({ $or: [
      { deliveryDate },
      { deliveryDate: rx },
      { deliveryDateKey: deliveryDate }
    ] });
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
        { phone: rx },
        { customerPhone: rx },
        { phoneNumber: rx },
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
    if (source[key] === undefined || source[key] === null || source[key] === '') continue;
    const value = money(source[key]);
    if (value !== 0) return value;
  }
  return 0;
}

const CASH_FIELDS = ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash', 'collectedCash', 'deliveryCashAmount', 'cashCollected', 'cash', 'cashInAmount', 'cashPaymentAmount'];
const BANK_FIELDS = ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount', 'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount', 'deliveryBankAmount', 'bankCollected', 'bankCollectedAmount', 'transferCollectedAmount', 'bankPaymentAmount'];
const REWARD_FIELDS = ['rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount'];
const OFFSET_FIELDS = ['offsetAmount', 'debtOffsetAmount', 'otherOffsetAmount', 'deliveryOffsetAmount'];
const COLLECTED_FIELDS = ['collectedAmount', 'cashCollectedTotal', 'paidAmount', 'paymentAmount', 'deliveryCollectedAmount'];

function closeoutMoneyBreakdown(closeout = {}) {
  const cashAmount = firstMoney(closeout, CASH_FIELDS);
  const bankAmount = firstMoney(closeout, BANK_FIELDS);
  const rewardAmount = firstMoney(closeout, REWARD_FIELDS);
  const offsetAmount = firstMoney(closeout, OFFSET_FIELDS);
  const explicitCollected = firstMoney(closeout, COLLECTED_FIELDS);
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
  const cashAmount = firstMoney(order, CASH_FIELDS);
  const bankAmount = firstMoney(order, BANK_FIELDS);
  const rewardAmount = firstMoney(order, REWARD_FIELDS);
  const offsetAmount = firstMoney(order, OFFSET_FIELDS);
  const explicitCollected = firstMoney(order, COLLECTED_FIELDS);
  const breakdownCollected = cashAmount + bankAmount + rewardAmount + offsetAmount;
  return {
    cashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    collectedAmount: breakdownCollected || explicitCollected
  };
}

function moneyBreakdownForOrder(order = {}) {
  const closeoutBreakdown = closeoutMoneyBreakdown(closeoutOf(order));
  const orderBreakdown = deliveryOperationalMoneyBreakdown(order);
  let cashAmount = closeoutBreakdown.cashAmount || orderBreakdown.cashAmount;
  const bankAmount = closeoutBreakdown.bankAmount || orderBreakdown.bankAmount;
  const rewardAmount = closeoutBreakdown.rewardAmount || orderBreakdown.rewardAmount;
  const offsetAmount = closeoutBreakdown.offsetAmount || orderBreakdown.offsetAmount;
  const explicitCollected = closeoutBreakdown.collectedAmount || orderBreakdown.collectedAmount;
  let collectedAmount = cashAmount + bankAmount + rewardAmount + offsetAmount || explicitCollected;
  if (!cashAmount && !bankAmount && !rewardAmount && !offsetAmount && explicitCollected > 0) {
    cashAmount = explicitCollected;
    collectedAmount = explicitCollected;
  }
  return { cashAmount, bankAmount, rewardAmount, offsetAmount, collectedAmount };
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
  let query = ReturnOrder.find(match);
  query = applyProjection(query, RETURN_ORDER_HOT_PATH_PROJECTION);
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = query && typeof query.lean === 'function' ? await query.lean() : await query;
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
  let query = DeliveryCloseoutVersion.find(match);
  query = applyProjection(query, CLOSEOUT_VERSION_HOT_PATH_PROJECTION);
  if (query && typeof query.sort === 'function') query = query.sort({ closeoutVersion: -1, createdAt: -1 });
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = query && typeof query.lean === 'function' ? await query.lean() : await query;
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
    deliveryDate: dateOnly(row.deliveryDate),
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

async function loadCanonicalSalesOrders(query = {}, options = {}) {
  const modelSet = getModels();
  const result = await deliveryTodayCanonicalOrderReader.listSalesOrders(query, modelSet, options);
  return result;
}

async function loadDeliveryOperationalOrders(query = {}, options = {}) {
  // Compatibility wrapper for older tests/importers. The returned rows now come
  // from orders/salesOrders through the canonical reader, not from masterOrders.
  const result = await loadCanonicalSalesOrders(query, options);
  return result.orders || [];
}

async function loadSalesOrdersFallback(query = {}, options = {}) {
  const result = await loadCanonicalSalesOrders(query, options);
  return result.orders || [];
}


function allocationKeysForOrder(order = {}) {
  return Array.from(new Set([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderId,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.sourceId,
    order.sourceCode
  ].map(text).filter(Boolean)));
}

async function loadAllocationsForOrders(orders = [], options = {}) {
  const { OrderPaymentAllocation } = getModels();
  const keys = Array.from(new Set((orders || []).flatMap(allocationKeysForOrder).filter(Boolean)));
  if (!keys.length || !OrderPaymentAllocation || typeof OrderPaymentAllocation.find !== 'function') return new Map();
  const filter = {
    status: { $nin: ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted'] },
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { sourceId: { $in: keys } },
      { sourceCode: { $in: keys } }
    ]
  };
  let query = OrderPaymentAllocation.find(filter);
  query = applyProjection(query, PAYMENT_ALLOCATION_HOT_PATH_PROJECTION);
  if (query && typeof query.sort === 'function') query = query.sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1, createdAt: -1 });
  if (query && typeof query.limit === 'function') query = query.limit(5000);
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = query && typeof query.lean === 'function' ? await query.lean() : await query;
  const map = new Map();
  for (const row of rows || []) {
    for (const key of allocationKeysForOrder(row)) {
      if (!map.has(key)) map.set(key, row);
    }
  }
  return map;
}

function allocationForOrder(order = {}, allocationsByKey = new Map()) {
  for (const key of allocationKeysForOrder(order)) {
    const row = allocationsByKey.get(key);
    if (row) return row;
  }
  return null;
}

function allocationIsCurrentForVersion(allocation = null, latestVersion = null) {
  if (!allocation) return false;
  if (!latestVersion) return true;
  const allocationVersion = Number(allocation.sourceVersion || allocation.version || 0) || 0;
  const latestCorrectionVersion = Number(latestVersion.closeoutVersion || latestVersion.sourceVersion || latestVersion.version || 0) || 0;
  if (latestCorrectionVersion > allocationVersion) return false;
  return true;
}

function collectedAmount(order = {}) {
  const closeout = closeoutOf(order);
  return money(closeout.collectedAmount ?? order.collectedAmount ?? order.deliveryCollectedAmount ?? order.paidAmount ?? order.paymentAmount ?? 0);
}

function summarizeOrder(order = {}, returnsByKey = new Map(), versionsByKey = new Map(), allocationsByKey = new Map()) {
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
  const paymentState = DeliveryPaymentStateReadService.resolvePaymentStateForOrder(order, versionsByKey, allocationsByKey);
  const latestVersion = paymentState.latestVersion || null;
  const rawPostedAllocation = paymentState.rawPostedAllocation || null;
  const postedAllocation = paymentState.postedAllocation || null;
  const stalePaymentAllocation = paymentState.stalePaymentAllocationIgnored === true;
  const originalAmount = postedAllocation
    ? money(postedAllocation.receivableAmount)
    : money((latestVersion && (latestVersion.originalAmount ?? latestVersion.saleAmount)) ?? closeout.originalAmount ?? orderAmount(order));
  const legacyReturnedAmount = money(uniqueReturns.reduce((sum, row) => sum + money(row.amount), 0));
  const returnedAmount = postedAllocation ? money(postedAllocation.returnAmount) : money((latestVersion && (latestVersion.returnedAmount ?? latestVersion.returnAmount)) ?? legacyReturnedAmount);
  const adjustedCashAmount = money(paymentState.cashAmount);
  const bankAmount = money(paymentState.bankAmount);
  const rewardAmount = money(paymentState.rewardAmount);
  const offsetAmount = money(paymentState.offsetAmount);
  const collected = money(paymentState.collectedAmount || collectedAmount(order));
  const preferredDebtAmount = paymentState.debtAmount !== undefined
    ? money(paymentState.debtAmount)
    : (closeout.finalDebtAmount !== undefined ? money(closeout.finalDebtAmount) : undefined);
  const preferredDebtSource = paymentState.source && paymentState.source.paymentState !== 'orders.top-level'
    ? paymentState.source.paymentState
    : (closeout.finalDebtAmount !== undefined ? 'salesOrders.deliveryCloseout' : 'computed-formula');
  const kpi = calculateDeliveryTodayKpi({
    receivableAmount: originalAmount,
    cashAmount: adjustedCashAmount,
    bankAmount,
    rewardAmount,
    offsetAmount,
    returnAmount: returnedAmount,
    preferredDebtAmount,
    preferredDebtSource,
    returnHandling: 'subtractReturnInDebtFormula',
    warnings: stalePaymentAllocation ? [{ code: 'STALE_PAYMENT_ALLOCATION_IGNORED', allocationCode: text(rawPostedAllocation && rawPostedAllocation.allocationCode) }] : []
  });
  const debtCalculation = {
    receivableAmount: kpi.receivableAmount,
    cashAmount: kpi.cashAmount,
    bankAmount: kpi.bankAmount,
    rewardAmount: money(kpi.rewardAmount + kpi.offsetAmount),
    returnAmount: kpi.returnAmount,
    rawDebtAmount: kpi.rawComputedDebtAmount,
    debtAmount: kpi.computedDebtAmount
  };
  const rawFinalDebtAmount = kpi.rawComputedDebtAmount;
  const finalDebtAmount = kpi.finalDebtAmount;
  const computedDebtAmount = kpi.computedDebtAmount;
  const closeoutFinalDebt = finalDebtAmount;
  const confirmedCloseout = isConfirmedCloseout(order);
  const orderStatus = text(order.status || order.deliveryStatus || order.lifecycleStatus).toLowerCase();
  const cancelledOrDeleted = order.deleted === true
    || order.isDeleted === true
    || order.cancelled === true
    || order.canceled === true
    || ['cancelled', 'canceled', 'deleted', 'void', 'voided'].includes(orderStatus);
  const viewSelectable = !cancelledOrDeleted;
  const closeoutEligibility = evaluateCloseoutEligibility(order, { confirmedCloseout });
  const closeoutEligible = closeoutEligibility.eligible === true;
  const returnMutationLock = resolveDeliveryAccountingLockState({
    order,
    latestCloseoutVersion: latestVersion,
    allocation: postedAllocation
  });
  return {
    id: text(order.id || order._id),
    orderId: text(order.id || order._id),
    orderCode: orderCode(order),
    masterOrderId: text(order.masterOrderId || order.masterId),
    masterOrderCode: text(order.masterOrderCode || order.masterCode),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    deliveryDate: dateOnly(order.deliveryDate),
    deliveryDateDisplay: text(order.deliveryDateDisplay || dateUtil.displayDateFromDateKey(dateOnly(order.deliveryDate))),
    deliveryDateSource: text(order.deliveryDateSource || (dateOnly(order.deliveryDate) ? 'orders.deliveryDate' : '')),
    dateFilterMatched: order.dateFilterMatched !== false,
    dateWarnings: Array.isArray(order.dateWarnings) ? order.dateWarnings : (dateOnly(order.deliveryDate) ? [] : ['ORDER_MISSING_CANONICAL_DELIVERY_DATE']),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
    deliveryAssignmentSource: text(order.deliveryAssignmentSource || 'none'),
    deliveryAssignmentVerified: order.deliveryAssignmentVerified === true,
    masterMetadataBindingWarning: text(order.masterMetadataBindingWarning || ''),
    status: text(order.status || order.deliveryStatus || order.accountingStatus || 'draft'),
    items: compactOrderItems(order.items || order.orderItems || order.soldItems || order.products || order.lines || []),
    orderItems: compactOrderItems(order.orderItems || order.items || order.soldItems || order.products || order.lines || []),
    soldItems: compactOrderItems(order.soldItems || order.items || order.orderItems || order.products || order.lines || []),
    closeoutStatus: latestVersion ? text(latestVersion.status || 'corrected_confirmed') : closeoutStatus(order),
    deliveryCloseoutStatus: confirmedCloseout ? 'closed' : text(order.deliveryCloseoutStatus || closeout.deliveryCloseoutStatus || ''),
    accountingConfirmed: confirmedCloseout || returnMutationLock.locked,
    returnMutationLocked: returnMutationLock.locked,
    returnMutationLock,
    viewSelectable,
    closeoutEligible,
    closeoutEligibility,
    closeoutEligibilityCode: closeoutEligibility.code,
    adjustmentAllowed: viewSelectable,
    closeoutLocked: confirmedCloseout,
    canCloseout: closeoutEligible,
    canAdjust: viewSelectable,
    correctionVersionApplied: Boolean(latestVersion),
    paymentAllocationApplied: Boolean(postedAllocation),
    paymentAllocationCode: postedAllocation ? text(postedAllocation.allocationCode) : '',
    stalePaymentAllocationIgnored: stalePaymentAllocation,
    stalePaymentAllocationCode: stalePaymentAllocation ? text(rawPostedAllocation.allocationCode) : '',
    correctionId: latestVersion ? text(latestVersion.correctionId) : '',
    correctionCode: latestVersion ? text(latestVersion.correctionCode) : '',
    closeoutVersionId: latestVersion ? text(latestVersion.id || latestVersion.code) : '',
    returnAdjustmentAmount: latestVersion ? money(latestVersion.returnAdjustmentAmount) : 0,
    cashAdjustmentAmount: latestVersion ? money(latestVersion.totalCollectedDelta ?? latestVersion.cashAdjustmentAmount) : 0,
    cashDeltaAmount: latestVersion ? money(latestVersion.cashDeltaAmount) : 0,
    bankDeltaAmount: latestVersion ? money(latestVersion.bankDeltaAmount) : 0,
    rewardDeltaAmount: latestVersion ? money(latestVersion.rewardDeltaAmount) : 0,
    debtAdjustmentAmount: latestVersion ? money(latestVersion.debtDeltaAmount ?? latestVersion.debtAdjustmentAmount) : 0,
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
    rawFinalDebtAmount,
    computedDebtAmount,
    debtReconcileDiff: kpi.sourceBreakdown.debtReconcileDiff || 0,
    kpiWarnings: kpi.warnings || [],
    sourceBreakdown: kpi.sourceBreakdown,
    rawKpiSourceBreakdown: kpi.sourceBreakdown,
    closeoutFinalDebtAmount: closeoutFinalDebt,
    closeoutDelta: money(closeoutFinalDebt - finalDebtAmount),
    returnOrderIds: uniqueReturns.map((row) => row.id || row.code).filter(Boolean),
    paymentIds: Array.isArray(closeout.paymentIds) ? closeout.paymentIds : [],
    version: latestVersion ? Number(latestVersion.closeoutVersion || 0) : Number(closeout.version || (Array.isArray(closeout.versions) ? closeout.versions.length : 0) || 0),
    source: postedAllocation ? 'orderPaymentAllocations(current) + orders + returnOrders' : (latestVersion ? (stalePaymentAllocation ? 'deliveryCloseoutVersions(latest correction; stale orderPaymentAllocation ignored) + orders + returnOrders' : 'deliveryCloseoutVersions(latest correction) + orders + returnOrders') : 'orders + returnOrders'),
    correctionRequired: confirmedCloseout,
    correctionMessage: confirmedCloseout ? 'Đơn đã xác nhận kế toán: mọi sửa đổi phải qua correction flow.' : ''
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


function salesmanGroupKey(row = {}) {
  return text(row.salesStaffCode || row.salesmanCode || row.nvbhCode || row.salesStaffName || row.salesmanName || row.nvbhName || 'UNKNOWN_NVBH');
}

function summarizeGroups(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = salesmanGroupKey(row);
    if (!map.has(key)) {
      map.set(key, {
        key,
        salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
        salesStaffName: text(row.salesStaffName || row.salesmanName || row.nvbhName),
        deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
        deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName),
        orderCount: 0,
        totals: {
          originalAmount: 0,
          receivableAmount: 0,
          cashAmount: 0,
          bankAmount: 0,
          transferAmount: 0,
          rewardAmount: 0,
          offsetAmount: 0,
          returnedAmount: 0,
          returnAmount: 0,
          finalDebtAmount: 0,
          debtAmount: 0
        },
        orders: []
      });
    }
    const group = map.get(key);
    group.orderCount += 1;
    group.totals.originalAmount += money(row.originalAmount);
    group.totals.receivableAmount += money(row.originalAmount);
    group.totals.cashAmount += money(row.cashAmount);
    group.totals.bankAmount += money(row.bankAmount);
    group.totals.transferAmount += money(row.bankAmount);
    group.totals.rewardAmount += money(row.rewardAmount);
    group.totals.offsetAmount += money(row.offsetAmount);
    group.totals.returnedAmount += money(row.returnedAmount);
    group.totals.returnAmount += money(row.returnedAmount);
    group.totals.finalDebtAmount += money(row.finalDebtAmount);
    group.totals.debtAmount += money(row.finalDebtAmount);
    group.orders.push(row);
  }
  return Array.from(map.values()).sort((a, b) => String(a.salesStaffCode || a.salesStaffName || a.key).localeCompare(String(b.salesStaffCode || b.salesStaffName || b.key), 'vi'));
}

async function listOrders(query = {}, options = {}) {
  const startedAt = Date.now();
  if (!hasSearchCriteria(query)) {
    return emptyListResult(query);
  }
  const canonicalResult = await loadCanonicalSalesOrders(query, options);
  const orders = canonicalResult.orders || [];
  const readerDiagnostics = canonicalResult.diagnostics || {};
  const [returnsByKey, versionsByKey, allocationsByKey] = await Promise.all([
    loadReturnsForOrders(orders, options),
    loadLatestVersionsForOrders(orders, options),
    loadAllocationsForOrders(orders, options)
  ]);
  const rows = orders.map((order) => summarizeOrder(order, returnsByKey, versionsByKey, allocationsByKey));
  const summary = summarizeRows(rows);
  const groups = summarizeGroups(rows);
  const rowWarnings = rows.flatMap((row) => Array.isArray(row.kpiWarnings) ? row.kpiWarnings : []);
  const sourceWarnings = [
    ...(Array.isArray(readerDiagnostics.warnings) ? readerDiagnostics.warnings : []),
    ...rowWarnings.map((warning) => warning && warning.code ? warning.code : warning).filter(Boolean)
  ];
  const source = {
    primary: 'orders',
    service: 'DeliveryTodayNewService.listOrders',
    reader: 'deliveryTodayCanonicalOrderReader',
    metadataSources: ['masterOrders'],
    correctionSources: ['deliveryCloseoutVersions'],
    paymentSources: ['orderPaymentAllocations'],
    returnSources: ['returnOrders'],
    forbiddenSourcesUsed: [],
    warnings: Array.from(new Set(sourceWarnings.map((item) => String(item)).filter(Boolean)))
  };
  const sourceBreakdown = {
    kpiFormulaVersion: 'delivery-today-kpi-v3',
    debtFormula: 'CN = PT - TM - CK - TT - HT',
    orderSource: 'orders',
    primarySource: 'orders',
    reader: 'deliveryTodayCanonicalOrderReader',
    masterOrdersRole: 'metadata-only',
    allocationPolicy: 'current-only; mismatched debt displays computed formula with warning',
    closeoutVersionPolicy: 'latest-only',
    returnPolicy: 'valid-returnOrders-only',
    dateFilter: readerDiagnostics.dateFilter || null,
    readerDiagnostics
  };
  const sourceNote = buildSourceNote('delivery-today-orders', { filters: query, sourceWarnings });
  return {
    rows,
    orders: rows,
    summary,
    totals: summary,
    groups,
    requireFilter: false,
    source,
    sourceBreakdown,
    sourceNote,
    sourceNotes: buildDeliveryTodaySourceNotes(query),
    diagnostics: {
      source: 'delivery-today-new-v3-orders-canonical + masterOrders(metadata-only) + returnOrders + correction-versions + current-payment-allocations',
      endpoint: '/api/new/delivery-today/orders',
      primarySource: 'orders',
      reader: 'deliveryTodayCanonicalOrderReader',
      writePolicy: 'read-only list; closeout must use POST /api/new/delivery-today/closeout; confirmed orders require DeliveryCloseoutCorrectionService; current payment allocation comes from orderPaymentAllocations; latest correction comes from deliveryCloseoutVersions',
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      deliverySourceApplied: false,
      fallbackEnabled: false,
      hasSearchCriteria: hasSearchCriteria(query),
      requireFilter: false,
      performance: {
        durationMs: Math.max(0, Date.now() - startedAt),
        queryCount: Number(readerDiagnostics.queryCount || 0) + (orders.length ? 3 : 0),
        fixedQueryCount: true,
        nPlusOneGuard: 'orders-first plus three independent batch joins; no per-order query',
        parallelBatchReads: orders.length ? ['returnOrders', 'deliveryCloseoutVersions', 'orderPaymentAllocations'] : [],
        projections: [
          'sales-order-delivery-today-hot-path-v1',
          'master-order-delivery-metadata-v1',
          'return-order-delivery-today-hot-path-v1',
          'delivery-closeout-version-hot-path-v1',
          'order-payment-allocation-hot-path-v1'
        ]
      },
      matchKeys: Object.keys(buildOrderMatch(query)),
      source,
      sourceBreakdown
    }
  };
}


function suggestionLimit(value) {
  const n = Number(value || 10);
  return Math.max(1, Math.min(10, Number.isFinite(n) ? Math.round(n) : 10));
}

function staffSuggestionLimit(value) {
  const n = Number(value || 50);
  return Math.max(1, Math.min(50, Number.isFinite(n) ? Math.round(n) : 50));
}

function allowEmptySuggestion(query = {}) {
  return ['1', 'true', 'yes'].includes(String(query.allowEmpty ?? query.showOnFocus ?? query.initial ?? '').toLowerCase());
}

function staffDirectoryLabel(row = {}) {
  const code = text(row.code || row.staffCode || row.salesStaffCode || row.deliveryStaffCode || row.value);
  const name = text(row.name || row.fullName || row.salesStaffName || row.deliveryStaffName || row.businessStaffName);
  return [name, code].filter(Boolean).join(' - ');
}

async function staffDirectorySuggestions(query = {}, q = '', role = 'delivery', limit = 50, options = {}) {
  const isDelivery = ['delivery', 'deliverystaff', 'nvgh'].includes(text(role).toLowerCase());
  if (models) {
    return staffSuggestionItems(query, q, isDelivery ? 'delivery' : 'salesman', Math.min(limit, 10), options);
  }
  const rows = await searchService.searchStaffs({
    q,
    role: isDelivery ? 'delivery' : 'sales',
    allowEmpty: '1',
    active: query.active ?? '1',
    limit
  });
  const needle = text(q).toUpperCase();
  const items = (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      if (!needle) return true;
      return [row.code, row.staffCode, row.name, row.fullName, row.username].some((value) => text(value).toUpperCase().includes(needle));
    })
    .map((row) => {
      const code = text(isDelivery ? (row.deliveryStaffCode || row.code || row.staffCode) : (row.salesStaffCode || row.code || row.staffCode));
      const name = text(isDelivery ? (row.deliveryStaffName || row.name || row.fullName) : (row.salesStaffName || row.name || row.fullName));
      return {
        type: isDelivery ? 'delivery' : 'salesman',
        code,
        name,
        staffCode: code,
        deliveryStaffCode: isDelivery ? code : undefined,
        deliveryStaffName: isDelivery ? name : undefined,
        salesStaffCode: isDelivery ? undefined : code,
        salesStaffName: isDelivery ? undefined : name,
        label: staffDirectoryLabel({ code, name }),
        subLabel: isDelivery ? 'NVGH đang active' : 'NVBH đang active',
        _rank: needle && text(code).toUpperCase().startsWith(needle) ? 0 : (needle && text(name).toUpperCase().startsWith(needle) ? 1 : 2)
      };
    })
    .filter((row) => row.code || row.name)
    .sort((a, b) => (a._rank - b._rank) || String(a.label || '').localeCompare(String(b.label || ''), 'vi'))
    .slice(0, limit)
    .map(({ _rank, ...row }) => row);
  return {
    items,
    diagnostics: {
      source: 'delivery-today-new-staff-directory-search-service',
      endpoint: '/api/new/delivery-today/suggestions',
      type: isDelivery ? 'delivery' : 'salesman',
      limit,
      searchCriteriaRequired: false,
      openOnFocus: true,
      valueContract: 'UI shows name-code label; API uses staff code'
    }
  };
}

function emptySuggestionResult(type, reason = 'MIN_QUERY_LENGTH') {
  return {
    items: [],
    diagnostics: {
      source: 'delivery-today-new-suggestions-guarded-empty',
      endpoint: '/api/new/delivery-today/suggestions',
      type: text(type || ''),
      reason,
      minQueryLength: 2,
      limit: 10,
      searchCriteriaRequired: true,
      note: 'Customer/order search still requires typing; NVBH/NVGH support mouse-first openOnFocus.'
    }
  };
}

function suggestionTextMatches(value, q) {
  return text(value).toUpperCase().includes(text(q).toUpperCase());
}

function suggestionRank(code, label, q) {
  const needle = text(q).toUpperCase();
  if (text(code).toUpperCase().startsWith(needle)) return 0;
  if (text(label).toUpperCase().startsWith(needle)) return 1;
  return 2;
}

function sortSuggestions(items = []) {
  return items
    .sort((a, b) => (a._rank - b._rank) || String(a.label || '').localeCompare(String(b.label || ''), 'vi'))
    .map(({ _rank, ...row }) => row);
}

async function findSuggestionOrders(match = {}, limit = 80, options = {}) {
  const { SalesOrder } = getModels();
  const query = SalesOrder.find(match);
  if (typeof query.sort === 'function') query.sort({ deliveryDate: -1, orderDate: -1, createdAt: -1 });
  if (typeof query.limit === 'function') query.limit(Math.max(1, Math.min(120, Number(limit) || 80)));
  if (typeof query.lean === 'function') query.lean();
  if (options.session && typeof query.session === 'function') query.session(options.session);
  return query;
}

function buildSuggestionQuery(query = {}, q = '') {
  return {
    date: query.deliveryDate || query.date,
    delivery: query.deliveryStaffCode || query.delivery || query.nvgh,
    q
  };
}

async function orderCustomerSuggestions(query = {}, q = '', limit = 10, options = {}) {
  const rows = await findSuggestionOrders(buildOrderMatch(buildSuggestionQuery(query, q)), Math.max(50, limit * 10), options);
  const orderItems = [];
  const customerItems = [];
  const seenOrders = new Set();
  const seenCustomers = new Set();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = normalizeDeliveryOperationalRow(raw);
    const code = text(row.orderCode || row.orderId || raw.code || raw.id || raw._id);
    const customerCode = text(row.customerCode);
    const customerName = text(row.customerName);
    const phone = text(raw.phone || raw.customerPhone || raw.phoneNumber);
    const customerKey = (customerCode || customerName || phone).toUpperCase();
    const orderKey = (code || row.orderId).toUpperCase();
    if (orderKey && !seenOrders.has(orderKey) && (suggestionTextMatches(code, q) || suggestionTextMatches(customerCode, q) || suggestionTextMatches(customerName, q) || suggestionTextMatches(phone, q))) {
      orderItems.push({
        type: 'order',
        code,
        orderCode: code,
        customerCode,
        customerName,
        deliveryDate: row.deliveryDate,
        label: [code, customerName || customerCode].filter(Boolean).join(' - '),
        subLabel: [customerCode, row.deliveryDate ? `Ngày giao ${row.deliveryDate}` : '', row.deliveryStaffCode ? `NVGH ${row.deliveryStaffCode}` : ''].filter(Boolean).join(' · '),
        _rank: suggestionRank(code, [code, customerCode, customerName].filter(Boolean).join(' '), q)
      });
      seenOrders.add(orderKey);
    }
    if (customerKey && !seenCustomers.has(customerKey) && (suggestionTextMatches(customerCode, q) || suggestionTextMatches(customerName, q) || suggestionTextMatches(phone, q))) {
      customerItems.push({
        type: 'customer',
        code: customerCode,
        customerCode,
        name: customerName,
        phone,
        label: [customerCode, customerName].filter(Boolean).join(' - '),
        subLabel: [phone ? `SĐT: ${phone}` : '', row.deliveryDate ? `Ngày giao ${row.deliveryDate}` : ''].filter(Boolean).join(' · '),
        _rank: suggestionRank(customerCode, [customerCode, customerName, phone].filter(Boolean).join(' '), q)
      });
      seenCustomers.add(customerKey);
    }
  }
  return {
    items: sortSuggestions([...orderItems, ...customerItems]).slice(0, limit),
    diagnostics: {
      source: 'delivery-today-new-order-customer-suggestions-sales-orders',
      endpoint: '/api/new/delivery-today/suggestions',
      type: 'orderCustomer',
      limit,
      searchCriteriaRequired: false
    }
  };
}

async function staffSuggestionItems(query = {}, q = '', role = 'delivery', limit = 10, options = {}) {
  const isDelivery = ['delivery', 'deliverystaff', 'nvgh'].includes(text(role).toLowerCase());
  const matchQuery = buildSuggestionQuery({ deliveryDate: query.deliveryDate || query.date }, '');
  if (isDelivery) matchQuery.delivery = q;
  else {
    matchQuery.salesman = q;
    if (query.deliveryStaffCode || query.delivery || query.nvgh) matchQuery.delivery = query.deliveryStaffCode || query.delivery || query.nvgh;
  }
  const rows = await findSuggestionOrders(buildOrderMatch(matchQuery), Math.max(50, limit * 10), options);
  const map = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = normalizeDeliveryOperationalRow(raw);
    const code = text(isDelivery ? row.deliveryStaffCode : row.salesStaffCode);
    const name = text(isDelivery ? row.deliveryStaffName : row.salesStaffName);
    if (!code && !name) continue;
    if (!suggestionTextMatches(code, q) && !suggestionTextMatches(name, q)) continue;
    const key = (code || name).toUpperCase();
    const existing = map.get(key) || { code, name, orderCount: 0, amount: 0 };
    existing.orderCount += 1;
    existing.amount += money(row.originalAmount);
    map.set(key, existing);
  }
  const items = Array.from(map.values()).map((row) => ({
    type: isDelivery ? 'delivery' : 'salesman',
    code: row.code,
    name: row.name,
    label: [row.code, row.name].filter(Boolean).join(' - '),
    subLabel: `Đơn: ${row.orderCount} · PT: ${money(row.amount).toLocaleString('vi-VN')}`,
    orderCount: row.orderCount,
    _rank: suggestionRank(row.code, [row.code, row.name].filter(Boolean).join(' '), q)
  }));
  return {
    items: sortSuggestions(items).slice(0, limit),
    diagnostics: {
      source: 'delivery-today-new-staff-suggestions-sales-orders',
      endpoint: '/api/new/delivery-today/suggestions',
      type: isDelivery ? 'delivery' : 'salesman',
      limit,
      searchCriteriaRequired: false
    }
  };
}

async function suggestions(query = {}, options = {}) {
  const q = text(query.q || query.search || query.keyword);
  const type = text(query.type || 'orderCustomer').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const isDeliveryStaffType = ['delivery', 'deliverystaff', 'nvgh'].includes(type);
  const isSalesStaffType = ['salesman', 'sales', 'salesstaff', 'nvbh'].includes(type);
  if (isDeliveryStaffType || isSalesStaffType) {
    const limit = staffSuggestionLimit(query.limit);
    return staffDirectorySuggestions(query, q, isDeliveryStaffType ? 'delivery' : 'salesman', limit, options);
  }
  const limit = suggestionLimit(query.limit);
  if (q.length < 2 && !allowEmptySuggestion(query)) return emptySuggestionResult(query.type, 'MIN_QUERY_LENGTH');
  return orderCustomerSuggestions(query, q, limit, options);
}

module.exports = {
  listOrders,
  suggestions,
  hasSearchCriteria,
  buildOrderMatch,
  summarizeOrder,
  summarizeRows,
  summarizeGroups,
  setModelsForTest,
  setDeliveryListServiceForTest,
  _private: { money, suggestionLimit, staffSuggestionLimit, allowEmptySuggestion, emptySuggestionResult, normalizeDebtAmount, calculateDeliveryDebtAmount, DEBT_ZERO_TOLERANCE, truthyFlag, hasSearchCriteria, emptyListResult, normalizeQty, normalizeOrderItem, compactOrderItems, numberValue, orderBusinessIds, returnAmountFromItems, normalizeReturnItem, compactReturnItems, isValidReturn, normalizeReturn, normalizeDeliveryOperationalRow, loadCanonicalSalesOrders, loadDeliveryOperationalOrders, loadSalesOrdersFallback, loadReturnsForOrders, loadLatestVersionsForOrders, latestVersionForOrder, closeoutMoneyBreakdown, deliveryOperationalMoneyBreakdown, moneyBreakdownForOrder }
};
