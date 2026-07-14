'use strict';

const { toNumber } = require('../../utils/common.util');

const CLOSEOUT_VERSION_HOT_PATH_PROJECTION = [
  '_id', 'id', 'code',
  'salesOrderId', 'salesOrderCode', 'orderId', 'orderCode', 'originalCloseoutId', 'originalCloseoutCode',
  'closeoutVersion', 'sourceVersion', 'version', 'status', 'createdAt',
  'originalAmount', 'saleAmount', 'returnedAmount', 'returnAmount',
  'cashAmount', 'newCashAmount', 'cashCollectedAmount',
  'bankAmount', 'newBankAmount', 'rewardAmount', 'newRewardAmount',
  'collectedAmount', 'newCollectedAmount', 'finalDebtAmount', 'debtAmount',
  'correctionId', 'correctionCode'
].join(' ');

const PAYMENT_ALLOCATION_HOT_PATH_PROJECTION = [
  '_id', 'id', 'allocationCode',
  'orderId', 'orderCode', 'salesOrderId', 'salesOrderCode', 'sourceId', 'sourceCode',
  'status', 'active', 'sourceVersion', 'version', 'postedAt', 'updatedAt', 'createdAt',
  'receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'returnAmount',
  'debtAmount', 'normalizedDebtAmount', 'rawDebtAmount'
].join(' ');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function hasOwn(source = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(source, key)
    && source[key] !== undefined
    && source[key] !== null
    && source[key] !== '';
}

function firstDefinedMoney(source = {}, keys = []) {
  for (const key of keys) {
    if (hasOwn(source, key)) return money(source[key]);
  }
  return 0;
}

const CASH_FIELDS = ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash', 'collectedCash', 'deliveryCashAmount', 'cashCollected', 'cash', 'cashInAmount', 'cashPaymentAmount'];
const BANK_FIELDS = ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount', 'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount', 'deliveryBankAmount', 'bankCollected', 'bankCollectedAmount', 'transferCollectedAmount', 'bankPaymentAmount'];
const REWARD_FIELDS = ['rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount'];
const OFFSET_FIELDS = ['offsetAmount', 'debtOffsetAmount', 'otherOffsetAmount', 'deliveryOffsetAmount'];
const COLLECTED_FIELDS = ['collectedAmount', 'cashCollectedTotal', 'paidAmount', 'paymentAmount', 'deliveryCollectedAmount'];

function orderBusinessIds(order = {}) {
  return [
    text(order.id),
    text(order._id),
    text(order.code),
    text(order.orderCode),
    text(order.salesOrderId),
    text(order.salesOrderCode),
    text(order.documentCode),
    text(order.invoiceCode),
    text(order.sourceId),
    text(order.sourceCode)
  ].filter(Boolean);
}

function closeoutOf(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

function closeoutMoneyBreakdown(closeout = {}) {
  const cashAmount = firstDefinedMoney(closeout, CASH_FIELDS);
  const bankAmount = firstDefinedMoney(closeout, BANK_FIELDS);
  const rewardAmount = firstDefinedMoney(closeout, REWARD_FIELDS);
  const offsetAmount = firstDefinedMoney(closeout, OFFSET_FIELDS);
  const explicitCollected = firstDefinedMoney(closeout, COLLECTED_FIELDS);
  const breakdownCollected = cashAmount + bankAmount + rewardAmount + offsetAmount;
  return { cashAmount, bankAmount, rewardAmount, offsetAmount, collectedAmount: breakdownCollected || explicitCollected };
}

function deliveryOperationalMoneyBreakdown(order = {}) {
  const cashAmount = firstDefinedMoney(order, CASH_FIELDS);
  const bankAmount = firstDefinedMoney(order, BANK_FIELDS);
  const rewardAmount = firstDefinedMoney(order, REWARD_FIELDS);
  const offsetAmount = firstDefinedMoney(order, OFFSET_FIELDS);
  const explicitCollected = firstDefinedMoney(order, COLLECTED_FIELDS);
  const breakdownCollected = cashAmount + bankAmount + rewardAmount + offsetAmount;
  return { cashAmount, bankAmount, rewardAmount, offsetAmount, collectedAmount: breakdownCollected || explicitCollected };
}

function moneyBreakdownForOrder(order = {}) {
  const closeoutBreakdown = closeoutMoneyBreakdown(closeoutOf(order));
  const orderBreakdown = deliveryOperationalMoneyBreakdown(order);
  const closeoutHasPayment = ['cashAmount', 'bankAmount', 'rewardAmount', 'offsetAmount', 'collectedAmount']
    .some((key) => closeoutBreakdown[key] !== 0);
  const chosen = closeoutHasPayment ? closeoutBreakdown : orderBreakdown;
  let cashAmount = chosen.cashAmount;
  const bankAmount = chosen.bankAmount;
  const rewardAmount = chosen.rewardAmount;
  const offsetAmount = chosen.offsetAmount;
  let collectedAmount = cashAmount + bankAmount + rewardAmount + offsetAmount || chosen.collectedAmount;
  if (!cashAmount && !bankAmount && !rewardAmount && !offsetAmount && chosen.collectedAmount > 0) {
    cashAmount = chosen.collectedAmount;
    collectedAmount = chosen.collectedAmount;
  }
  return { cashAmount, bankAmount, rewardAmount, offsetAmount, collectedAmount };
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

function applyProjection(query, projection) {
  if (query && projection && typeof query.select === 'function') return query.select(projection);
  return query;
}

function defaultModels() {
  return {
    DeliveryCloseoutVersion: require('../../models/DeliveryCloseoutVersion'),
    OrderPaymentAllocation: require('../../models/OrderPaymentAllocation')
  };
}

async function runLean(query) {
  return query && typeof query.lean === 'function' ? await query.lean() : await query;
}

async function loadLatestVersionsForOrders(orders = [], options = {}) {
  const ids = Array.from(new Set((orders || []).flatMap(orderBusinessIds).filter(Boolean)));
  if (!ids.length) return new Map();
  const modelSet = options.models || defaultModels();
  const DeliveryCloseoutVersion = modelSet.DeliveryCloseoutVersion;
  if (!DeliveryCloseoutVersion || typeof DeliveryCloseoutVersion.find !== 'function') return new Map();
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
  if (query && typeof query.sort === 'function') query = query.sort({ closeoutVersion: -1, sourceVersion: -1, version: -1, createdAt: -1 });
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = await runLean(query);
  const map = new Map();
  for (const row of rows || []) {
    const keys = [row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode, row.originalCloseoutId, row.originalCloseoutCode].map(text).filter(Boolean);
    for (const key of keys) {
      const current = map.get(key);
      const rowVersion = Number(row.closeoutVersion || row.sourceVersion || row.version || 0) || 0;
      const currentVersion = Number(current && (current.closeoutVersion || current.sourceVersion || current.version) || 0) || 0;
      if (!current || rowVersion > currentVersion) map.set(key, row);
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

async function loadAllocationsForOrders(orders = [], options = {}) {
  const keys = Array.from(new Set((orders || []).flatMap(allocationKeysForOrder).filter(Boolean)));
  if (!keys.length) return new Map();
  const modelSet = options.models || defaultModels();
  const OrderPaymentAllocation = modelSet.OrderPaymentAllocation;
  if (!OrderPaymentAllocation || typeof OrderPaymentAllocation.find !== 'function') return new Map();
  const filter = {
    status: { $nin: ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted'] },
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { sourceId: { $in: keys } },
      { sourceCode: { $in: keys } }
    ]
  };
  let query = OrderPaymentAllocation.find(filter);
  query = applyProjection(query, PAYMENT_ALLOCATION_HOT_PATH_PROJECTION);
  if (query && typeof query.sort === 'function') query = query.sort({ sourceVersion: -1, version: -1, postedAt: -1, updatedAt: -1, createdAt: -1 });
  if (query && typeof query.limit === 'function') query = query.limit(5000);
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = await runLean(query);
  const map = new Map();
  for (const row of rows || []) {
    if (row.active === false) continue;
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
  return latestCorrectionVersion <= allocationVersion;
}

function resolvePaymentStateForOrder(order = {}, versionsByKey = new Map(), allocationsByKey = new Map()) {
  const latestVersion = latestVersionForOrder(order, versionsByKey);
  const rawPostedAllocation = allocationForOrder(order, allocationsByKey);
  const postedAllocation = allocationIsCurrentForVersion(rawPostedAllocation, latestVersion) ? rawPostedAllocation : null;
  const stalePaymentAllocationIgnored = Boolean(rawPostedAllocation && !postedAllocation && latestVersion);
  const baseBreakdown = moneyBreakdownForOrder(order);

  if (postedAllocation) {
    return {
      orderId: text(order.id || order._id || postedAllocation.orderId || postedAllocation.salesOrderId),
      orderCode: text(order.code || order.orderCode || order.salesOrderCode || postedAllocation.orderCode || postedAllocation.salesOrderCode),
      cashAmount: money(postedAllocation.cashAmount),
      bankAmount: money(postedAllocation.bankAmount),
      rewardAmount: money(postedAllocation.rewardAmount),
      offsetAmount: 0,
      collectedAmount: money(money(postedAllocation.cashAmount) + money(postedAllocation.bankAmount) + money(postedAllocation.rewardAmount)),
      receivableAmount: money(postedAllocation.receivableAmount),
      returnAmount: money(postedAllocation.returnAmount),
      debtAmount: money(postedAllocation.debtAmount ?? postedAllocation.normalizedDebtAmount ?? postedAllocation.rawDebtAmount),
      source: { paymentState: 'orderPaymentAllocations.current' },
      latestCorrectionVersion: latestVersion ? Number(latestVersion.closeoutVersion || latestVersion.sourceVersion || latestVersion.version || 0) || 0 : 0,
      paymentAllocationCode: text(postedAllocation.allocationCode || postedAllocation.code || postedAllocation.id),
      stalePaymentAllocationIgnored,
      latestVersion,
      rawPostedAllocation,
      postedAllocation
    };
  }

  if (latestVersion) {
    const cashAmount = money(latestVersion.cashAmount ?? latestVersion.newCashAmount ?? latestVersion.cashCollectedAmount ?? baseBreakdown.cashAmount);
    const bankAmount = money(latestVersion.bankAmount ?? latestVersion.newBankAmount ?? baseBreakdown.bankAmount);
    const rewardAmount = money(latestVersion.rewardAmount ?? latestVersion.newRewardAmount ?? baseBreakdown.rewardAmount);
    return {
      orderId: text(order.id || order._id || latestVersion.orderId || latestVersion.salesOrderId),
      orderCode: text(order.code || order.orderCode || order.salesOrderCode || latestVersion.orderCode || latestVersion.salesOrderCode),
      cashAmount,
      bankAmount,
      rewardAmount,
      offsetAmount: 0,
      collectedAmount: money(latestVersion.collectedAmount ?? latestVersion.newCollectedAmount ?? (cashAmount + bankAmount + rewardAmount)),
      receivableAmount: money(latestVersion.originalAmount ?? latestVersion.saleAmount),
      returnAmount: money(latestVersion.returnedAmount ?? latestVersion.returnAmount),
      debtAmount: money(latestVersion.finalDebtAmount ?? latestVersion.debtAmount),
      source: { paymentState: 'deliveryCloseoutVersions.latest' },
      latestCorrectionVersion: Number(latestVersion.closeoutVersion || latestVersion.sourceVersion || latestVersion.version || 0) || 0,
      paymentAllocationCode: '',
      stalePaymentAllocationIgnored,
      latestVersion,
      rawPostedAllocation,
      postedAllocation: null
    };
  }

  const closeout = closeoutOf(order);
  const closeoutHasPayment = Object.keys(closeout).length > 0
    && ['cashAmount', 'cashCollectedAmount', 'bankAmount', 'rewardAmount', 'collectedAmount'].some((key) => hasOwn(closeout, key));
  return {
    orderId: text(order.id || order._id),
    orderCode: text(order.code || order.orderCode || order.salesOrderCode),
    cashAmount: baseBreakdown.cashAmount,
    bankAmount: baseBreakdown.bankAmount,
    rewardAmount: baseBreakdown.rewardAmount,
    offsetAmount: baseBreakdown.offsetAmount,
    collectedAmount: baseBreakdown.collectedAmount,
    receivableAmount: 0,
    returnAmount: 0,
    debtAmount: closeout.finalDebtAmount !== undefined ? money(closeout.finalDebtAmount) : undefined,
    source: { paymentState: closeoutHasPayment ? 'salesOrders.deliveryCloseout' : 'orders.top-level' },
    latestCorrectionVersion: 0,
    paymentAllocationCode: '',
    stalePaymentAllocationIgnored,
    latestVersion: null,
    rawPostedAllocation,
    postedAllocation: null
  };
}

function stateIdentityKeys(state = {}) {
  return [state.orderId, state.orderCode].map(text).filter(Boolean);
}

function stateForOrder(order = {}, statesByIdentity = new Map()) {
  for (const key of orderBusinessIds(order)) {
    const state = statesByIdentity.get(key);
    if (state) return state;
  }
  return resolvePaymentStateForOrder(order);
}

async function resolvePaymentStatesForOrders(orders = [], options = {}) {
  const [versionsByKey, allocationsByKey] = await Promise.all([
    loadLatestVersionsForOrders(orders, options),
    loadAllocationsForOrders(orders, options)
  ]);
  const states = (orders || []).map((order) => resolvePaymentStateForOrder(order, versionsByKey, allocationsByKey));
  const statesByIdentity = new Map();
  for (const state of states) {
    for (const key of stateIdentityKeys(state)) statesByIdentity.set(key, state);
  }
  return { states, statesByIdentity, versionsByKey, allocationsByKey };
}

module.exports = {
  resolvePaymentStatesForOrders,
  resolvePaymentStateForOrder,
  stateForOrder,
  loadLatestVersionsForOrders,
  latestVersionForOrder,
  loadAllocationsForOrders,
  allocationForOrder,
  allocationIsCurrentForVersion,
  moneyBreakdownForOrder,
  orderBusinessIds,
  allocationKeysForOrder,
  _private: {
    money,
    text,
    firstDefinedMoney,
    closeoutMoneyBreakdown,
    deliveryOperationalMoneyBreakdown
  }
};
