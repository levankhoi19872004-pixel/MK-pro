'use strict';

const dateUtil = require('../utils/date.util');
const { normalizeDebtAmount } = require('../constants/finance.constants');
const { DeliveryEngine } = require('../engines/delivery.engine');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const ArLedger = require('../models/ArLedger');
const FundLedger = require('../models/FundLedger');
const DebtCollection = require('../models/DebtCollection');
const User = require('../models/User');

const INACTIVE_STATUSES = ['cancelled', 'canceled', 'void', 'deleted', 'removed'];
const DELIVERED_STATUSES = ['delivered', 'success', 'done', 'completed'];
const PENDING_COLLECTION_STATUSES = ['submitted', 'pending', 'pending_accounting', 'accounting_pending'];

function text(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value));
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeDate(value) {
  return dateUtil.toDateOnly(value || dateUtil.todayVN()) || dateUtil.todayVN();
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startsWithDateClause(fields = [], date = '') {
  const normalized = normalizeDate(date);
  const rx = new RegExp(`^${escapeRegex(normalized)}`);
  return { $or: fields.map((field) => ({ [field]: rx })) };
}

function staffCodeVariants(value) {
  const raw = text(value);
  if (!raw) return [];
  return unique([raw, raw.toLowerCase(), raw.toUpperCase()]);
}

function deliveryStaffClause(deliveryStaffCode = '') {
  const values = staffCodeVariants(deliveryStaffCode);
  if (!values.length) return null;
  return {
    $or: [
      { deliveryStaffCode: { $in: values } },
      { deliveryCode: { $in: values } },
      { nvghCode: { $in: values } },
      { collectorCode: { $in: values } },
      { staffCode: { $in: values } }
    ]
  };
}

function activeClause(statusFields = ['status']) {
  return {
    $and: statusFields.map((field) => ({
      $or: [
        { [field]: { $exists: false } },
        { [field]: '' },
        { [field]: { $nin: INACTIVE_STATUSES } }
      ]
    }))
  };
}

function orderKeys(order = {}) {
  return unique([
    order.orderId,
    order.salesOrderId,
    order.id,
    order._id,
    order.orderCode,
    order.salesOrderCode,
    order.code
  ]);
}

function orderKeyClauses(orders = []) {
  const values = unique((orders || []).flatMap(orderKeys));
  if (!values.length) return [];
  return [
    { salesOrderId: { $in: values } },
    { orderId: { $in: values } },
    { sourceOrderId: { $in: values } },
    { deliveryOrderId: { $in: values } },
    { salesOrderCode: { $in: values } },
    { orderCode: { $in: values } },
    { sourceOrderCode: { $in: values } },
    { deliveryOrderCode: { $in: values } },
    { refId: { $in: values } },
    { refCode: { $in: values } },
    { sourceId: { $in: values } },
    { sourceCode: { $in: values } },
    { id: { $in: values } },
    { code: { $in: values } }
  ];
}

function deliveryStatusOf(order = {}) {
  const status = order.status && typeof order.status === 'object' ? order.status : {};
  return lower(status.deliveryStatus || order.deliveryStatus || order.status || 'pending');
}

function isDelivered(order = {}) {
  return DELIVERED_STATUSES.includes(deliveryStatusOf(order));
}

function orderAmount(order = {}, key = '') {
  const amounts = order.amounts || {};
  if (key === 'gross') return roundMoney(amounts.receivable ?? amounts.totalReceivable ?? order.totalAmount ?? order.amount ?? order.total);
  if (key === 'return') return roundMoney(amounts.returnAmount ?? order.returnAmount ?? order.returnedAmount);
  if (key === 'cash') return roundMoney(amounts.cash ?? order.cashCollected ?? order.cashAmount);
  if (key === 'transfer') return roundMoney(amounts.bank ?? order.bankCollected ?? order.bankAmount ?? order.transferAmount);
  if (key === 'reward') return roundMoney(amounts.reward ?? order.rewardAmount ?? order.bonusAmount);
  if (key === 'debt') return roundMoney(amounts.debt ?? amounts.debtAmount ?? order.debtAmount ?? order.debt);
  return 0;
}

function collectionStatus(row = {}) {
  return lower(row.status || 'submitted') || 'submitted';
}

function isPendingCollection(row = {}) {
  return PENDING_COLLECTION_STATUSES.includes(collectionStatus(row));
}

function collectionAmount(row = {}) {
  return roundMoney(row.amount || row.collectedAmount || row.receiptAmount);
}

function fundLedgerAmount(row = {}) {
  const direction = lower(row.direction || 'in');
  const amount = roundMoney(row.amount);
  return direction === 'out' ? -amount : amount;
}

function ledgerDelta(row = {}) {
  return roundMoney(row.debit) - roundMoney(row.credit);
}

function ledgerKeys(row = {}) {
  return unique([
    row.orderId,
    row.orderCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.refId,
    row.refCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    row.referenceId,
    row.referenceCode,
    row.sourceId,
    row.sourceCode
  ]);
}

function buildArBalanceByOrder(arLedgers = []) {
  const balances = new Map();
  for (const row of Array.isArray(arLedgers) ? arLedgers : []) {
    const delta = ledgerDelta(row);
    for (const key of ledgerKeys(row)) {
      balances.set(key, roundMoney((balances.get(key) || 0) + delta));
    }
  }
  return balances;
}

function arBalanceForOrder(order = {}, balances = new Map()) {
  for (const key of orderKeys(order)) {
    if (balances.has(key)) return Math.max(0, normalizeDebtAmount(balances.get(key)));
  }
  return normalizeDebtAmount(orderAmount(order, 'debt'));
}

function buildOrderReportRow(order = {}, arBalanceByOrder = new Map()) {
  const grossAmount = orderAmount(order, 'gross');
  const returnAmount = orderAmount(order, 'return');
  const collectedCash = orderAmount(order, 'cash');
  const collectedTransfer = orderAmount(order, 'transfer');
  const rewardAmount = orderAmount(order, 'reward');
  const remainingDebt = arBalanceForOrder(order, arBalanceByOrder);
  const mustCollect = Math.max(0, roundMoney(grossAmount - returnAmount - rewardAmount));
  const difference = roundMoney(grossAmount - returnAmount - rewardAmount - collectedCash - collectedTransfer - remainingDebt);
  return {
    id: text(order.orderId || order.salesOrderId || order.id || order._id),
    code: text(order.orderCode || order.salesOrderCode || order.code),
    orderId: text(order.orderId || order.salesOrderId || order.id || order._id),
    orderCode: text(order.orderCode || order.salesOrderCode || order.code),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName),
    deliveryStatus: deliveryStatusOf(order),
    delivered: isDelivered(order),
    grossAmount,
    returnAmount,
    rewardAmount,
    mustCollect,
    collectedCash,
    collectedTransfer,
    collectedAmount: roundMoney(collectedCash + collectedTransfer),
    remainingDebt,
    difference,
    note: text(order.deliveryNote || order.note || order.remark)
  };
}

function normalizeReturnDocument(row = {}) {
  const items = Array.isArray(row.items) ? row.items : [];
  const itemAmount = items.reduce((sum, item) => {
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice);
    return sum + roundMoney(qty > 0 && price > 0 ? qty * price : item.returnAmount ?? item.amount);
  }, 0);
  return {
    id: text(row.id || row._id || row.code),
    code: text(row.code || row.id || row._id),
    date: text(row.date || row.documentDate || row.returnDate || row.deliveryDate),
    orderId: text(row.orderId || row.salesOrderId || row.sourceOrderId || row.deliveryOrderId),
    orderCode: text(row.orderCode || row.salesOrderCode || row.sourceOrderCode || row.deliveryOrderCode),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName),
    status: text(row.status || row.returnStatus || row.returnState),
    totalQuantity: toNumber(row.totalQuantity || row.quantity || row.qty || items.reduce((sum, item) => sum + toNumber(item.returnQty ?? item.qtyReturn ?? item.quantity ?? item.qty), 0)),
    amount: roundMoney(row.totalAmount ?? row.totalReturnAmount ?? row.returnAmount ?? row.amount ?? row.debtReduction ?? itemAmount),
    items
  };
}

function normalizeCollection(row = {}) {
  return {
    id: text(row.id || row._id || row.code),
    code: text(row.code || row.id || row._id),
    status: collectionStatus(row),
    submittedAt: text(row.submittedAt || row.createdAt),
    accountingConfirmedAt: text(row.accountingConfirmedAt),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    collectorType: text(row.collectorType),
    collectorCode: text(row.collectorCode || row.deliveryStaffCode),
    collectorName: text(row.collectorName || row.deliveryStaffName),
    amount: collectionAmount(row),
    paymentMethod: text(row.paymentMethod),
    pendingAccounting: isPendingCollection(row),
    allocations: Array.isArray(row.allocations) ? row.allocations : []
  };
}

function normalizeFundLedger(row = {}) {
  return {
    id: text(row.id || row._id || row.code),
    code: text(row.code || row.id || row._id),
    date: text(row.date || row.deliveryDate || row.createdAt),
    sourceType: text(row.sourceType || row.refType || row.referenceType),
    sourceCode: text(row.sourceCode || row.refCode || row.referenceCode),
    fundType: text(row.fundType || row.account),
    direction: text(row.direction),
    amount: fundLedgerAmount(row),
    deliveryStaffCode: text(row.deliveryStaffCode || row.collectorCode),
    deliveryStaffName: text(row.deliveryStaffName || row.collectorName),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    note: text(row.note)
  };
}

function summarizeReconciliation({ orders = [], returns = [], collections = [], fundLedgers = [] } = {}) {
  const summary = {
    assignedOrders: orders.length,
    deliveredOrders: orders.filter((row) => row.delivered).length,
    pendingOrders: orders.filter((row) => !row.delivered).length,
    grossAmount: 0,
    returnAmount: 0,
    rewardAmount: 0,
    mustCollect: 0,
    collectedCash: 0,
    collectedTransfer: 0,
    collectedAmount: 0,
    remainingDebt: 0,
    pendingDebtCollections: 0,
    pendingDebtCollectionAmount: 0,
    submittedDebtCollections: 0,
    submittedDebtCollectionAmount: 0,
    confirmedDebtCollections: 0,
    confirmedDebtCollectionAmount: 0,
    confirmedFundIn: 0,
    difference: 0,
    hasMismatch: false
  };

  for (const order of orders) {
    summary.grossAmount += roundMoney(order.grossAmount);
    summary.returnAmount += roundMoney(order.returnAmount);
    summary.rewardAmount += roundMoney(order.rewardAmount);
    summary.mustCollect += roundMoney(order.mustCollect);
    summary.collectedCash += roundMoney(order.collectedCash);
    summary.collectedTransfer += roundMoney(order.collectedTransfer);
    summary.collectedAmount += roundMoney(order.collectedAmount);
    summary.remainingDebt += roundMoney(order.remainingDebt);
  }

  for (const collection of collections) {
    summary.submittedDebtCollections += 1;
    summary.submittedDebtCollectionAmount += roundMoney(collection.amount);
    if (collection.pendingAccounting) {
      summary.pendingDebtCollections += 1;
      summary.pendingDebtCollectionAmount += roundMoney(collection.amount);
    } else if (['accounting_confirmed', 'confirmed', 'posted', 'completed'].includes(collection.status)) {
      summary.confirmedDebtCollections += 1;
      summary.confirmedDebtCollectionAmount += roundMoney(collection.amount);
    }
  }

  for (const ledger of fundLedgers) {
    if (roundMoney(ledger.amount) > 0) summary.confirmedFundIn += roundMoney(ledger.amount);
  }

  summary.difference = roundMoney(summary.grossAmount - summary.returnAmount - summary.rewardAmount - summary.collectedCash - summary.collectedTransfer - summary.remainingDebt);
  summary.hasMismatch = Math.abs(summary.difference) > 1000;
  return summary;
}

function buildMatchFilter({ date, deliveryStaffCode, orderKeyOr = [], dateFields = [], statusFields = ['status'] } = {}) {
  const match = [];
  const staff = deliveryStaffClause(deliveryStaffCode);
  const dateClause = dateFields.length ? startsWithDateClause(dateFields, date) : null;
  const dateAndStaff = [];
  if (dateClause) dateAndStaff.push(dateClause);
  if (staff) dateAndStaff.push(staff);
  if (dateAndStaff.length) match.push({ $and: dateAndStaff });
  if (orderKeyOr.length) match.push({ $or: orderKeyOr });
  const and = [activeClause(statusFields)];
  if (match.length) and.push({ $or: match });
  return { $and: and };
}

async function safeFind(model, filter, options = {}) {
  if (!model || typeof model.find !== 'function') return [];
  let query = model.find(filter || {});
  if (options.select && query && typeof query.select === 'function') query = query.select(options.select);
  if (options.sort && query && typeof query.sort === 'function') query = query.sort(options.sort);
  if (options.limit && query && typeof query.limit === 'function') query = query.limit(options.limit);
  if (query && typeof query.lean === 'function') return query.lean();
  return query;
}

async function fetchReturnDocuments({ date, deliveryStaffCode, orders, models }) {
  const filter = buildMatchFilter({
    date,
    deliveryStaffCode,
    orderKeyOr: orderKeyClauses(orders),
    dateFields: ['date', 'documentDate', 'deliveryDate', 'returnDate', 'createdAt'],
    statusFields: ['status', 'returnStatus']
  });
  const docs = await safeFind(models.ReturnOrder, filter, { sort: { date: -1, createdAt: -1, code: -1 }, limit: 2000 });
  return (docs || []).map(normalizeReturnDocument).filter((row) => roundMoney(row.amount) > 0 || toNumber(row.totalQuantity) > 0);
}

async function fetchArLedgers({ date, deliveryStaffCode, orders, models }) {
  const filter = buildMatchFilter({
    date,
    deliveryStaffCode,
    orderKeyOr: orderKeyClauses(orders),
    dateFields: ['date', 'deliveryDate', 'createdAt'],
    statusFields: ['status', 'accountingStatus']
  });
  return safeFind(models.ArLedger, filter, { sort: { date: -1, createdAt: -1, code: -1 }, limit: 5000 });
}

async function fetchDebtCollections({ date, deliveryStaffCode, models }) {
  const filter = buildMatchFilter({
    date,
    deliveryStaffCode,
    dateFields: ['submittedAt', 'createdAt', 'accountingConfirmedAt'],
    statusFields: ['status']
  });
  const and = Array.isArray(filter.$and) ? filter.$and : [];
  and.push({ $or: [{ collectorType: 'delivery' }, { collectorType: 'NVGH' }, { deliveryStaffCode: { $exists: true } }] });
  filter.$and = and;
  const docs = await safeFind(models.DebtCollection, filter, { sort: { submittedAt: -1, createdAt: -1, code: -1 }, limit: 2000 });
  return (docs || []).map(normalizeCollection);
}

async function fetchFundLedgers({ date, deliveryStaffCode, models }) {
  const filter = buildMatchFilter({
    date,
    deliveryStaffCode,
    dateFields: ['date', 'deliveryDate', 'createdAt'],
    statusFields: ['status']
  });
  const and = Array.isArray(filter.$and) ? filter.$and : [];
  and.push({
    $or: [
      { sourceType: { $in: ['DEBT_COLLECTION', 'DEBTCOLLECTION', 'DELIVERY_CASH_SUBMISSION'] } },
      { refType: { $in: ['DEBT_COLLECTION', 'DEBTCOLLECTION', 'DELIVERY_CASH_SUBMISSION'] } },
      { referenceType: { $in: ['DEBT_COLLECTION', 'DEBTCOLLECTION', 'DELIVERY_CASH_SUBMISSION'] } },
      { collectorType: 'delivery' }
    ]
  });
  filter.$and = and;
  const docs = await safeFind(models.FundLedger, filter, { sort: { date: -1, createdAt: -1, code: -1 }, limit: 2000 });
  return (docs || []).map(normalizeFundLedger);
}

function normalizeQuery(query = {}) {
  const date = normalizeDate(query.date || query.deliveryDate || query.documentDate);
  return {
    ...query,
    date,
    deliveryDate: date,
    statusFilter: query.statusFilter || query.status || 'all'
  };
}

async function buildDeliveryReconciliationReport(query = {}, dependencies = {}) {
  const models = {
    SalesOrder,
    MasterOrder,
    ReturnOrder,
    StockTransaction,
    ArLedger,
    FundLedger,
    DebtCollection,
    User,
    ...(dependencies.models || {})
  };
  const normalizedQuery = normalizeQuery(query);
  const engine = dependencies.engine || new DeliveryEngine(models);
  const orderResult = await engine.listOrders({ ...normalizedQuery, statusFilter: 'all' });
  const canonicalOrders = Array.isArray(orderResult.rows) ? orderResult.rows : [];

  const [arLedgers, returns, collections, fundLedgers] = await Promise.all([
    fetchArLedgers({ date: normalizedQuery.date, deliveryStaffCode: normalizedQuery.deliveryStaffCode, orders: canonicalOrders, models }),
    fetchReturnDocuments({ date: normalizedQuery.date, deliveryStaffCode: normalizedQuery.deliveryStaffCode, orders: canonicalOrders, models }),
    fetchDebtCollections({ date: normalizedQuery.date, deliveryStaffCode: normalizedQuery.deliveryStaffCode, models }),
    fetchFundLedgers({ date: normalizedQuery.date, deliveryStaffCode: normalizedQuery.deliveryStaffCode, models })
  ]);

  const arBalanceByOrder = buildArBalanceByOrder(arLedgers);
  const orders = canonicalOrders.map((order) => buildOrderReportRow(order, arBalanceByOrder));
  const summary = summarizeReconciliation({ orders, returns, collections, fundLedgers });
  const deliveryStaffCode = text(normalizedQuery.deliveryStaffCode || (orders[0] && orders[0].deliveryStaffCode));
  const deliveryStaffName = text(normalizedQuery.deliveryStaffName || (orders[0] && orders[0].deliveryStaffName));

  return {
    date: normalizedQuery.date,
    deliveryStaffCode,
    deliveryStaffName,
    source: {
      orders: 'salesOrders/master_orders via DeliveryEngine',
      returns: 'returnOrders',
      ar: 'arLedgers',
      collections: 'debtCollections',
      fund: 'fundLedgers'
    },
    summary,
    orders,
    returns,
    collections,
    fundLedgers,
    arLedgers: arLedgers || [],
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildDeliveryReconciliationReport,
  helpers: {
    normalizeDate,
    buildOrderReportRow,
    summarizeReconciliation,
    buildArBalanceByOrder,
    arBalanceForOrder,
    normalizeReturnDocument,
    normalizeCollection,
    normalizeFundLedger
  }
};
