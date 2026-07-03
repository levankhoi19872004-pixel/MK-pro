'use strict';

const ReturnOrder = require('../../models/ReturnOrder');
const DeliveryCloseoutVersion = require('../../models/DeliveryCloseoutVersion');
const arBalanceService = require('../accounting/arBalanceService');
const { toNumber } = require('../../utils/common.util');
const { normalizeDebtAmount, calculateDeliveryDebtAmount } = require('../../constants/finance.constants');

const INACTIVE_STATUSES = ['cancelled', 'canceled', 'void', 'voided', 'deleted', 'removed', 'rejected', 'duplicate_cancelled'];
const CONFIRMED_STATUSES = ['confirmed', 'posted', 'locked', 'accounting_confirmed', 'completed', 'closed'];

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean)));
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function firstMoney(source = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    if (source[key] === undefined || source[key] === null || source[key] === '') continue;
    const value = money(source[key]);
    if (value !== 0) return value;
  }
  return 0;
}

function firstNumber(source = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    if (source[key] === undefined || source[key] === null || source[key] === '') continue;
    return money(source[key]);
  }
  return 0;
}

function orderIdentityValues(order = {}) {
  return unique([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.salesOrderId,
    order.orderId,
    order.sourceOrderId,
    order.sourceId,
    order.refId
  ]);
}

function orderPrimaryKey(order = {}) {
  return text(order.id || order.code || order.orderCode || order.salesOrderCode || order._id);
}

function orderDisplayCode(order = {}) {
  return text(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id || order._id);
}

function orderTotalAmount(order = {}) {
  return firstNumber(order, [
    'payableAmount',
    'finalAmount',
    'finalTotalAmount',
    'netAmount',
    'totalPayable',
    'totalAmount',
    'amount',
    'total',
    'grandTotal',
    'orderAmount'
  ]);
}

function orderMasterCode(order = {}) {
  return text(order.masterOrderCode || order.masterOrderNo || order.deliveryMasterCode || order.masterCode || '');
}

function deliveryStaffCode(order = {}) {
  return text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode || order.deliveryStaff?.code || '');
}

function deliveryStaffName(order = {}) {
  return text(order.deliveryStaffName || order.deliveryName || order.nvghName || order.deliveryStaff?.name || order.deliveryStaff?.fullName || '');
}

function salesStaffCode(order = {}) {
  return text(order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH || order.salesStaff?.code || '');
}

function salesStaffName(order = {}) {
  return text(order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName || order.salesStaff?.name || order.salesStaff?.fullName || '');
}

function isInactive(row = {}) {
  const status = lower(row.status || row.returnStatus || row.returnState || row.accountingStatus);
  return INACTIVE_STATUSES.includes(status) || row.deleted === true || row.isDeleted === true || Boolean(row.deletedAt);
}

function isConfirmedStatus(value = '') {
  const status = lower(value);
  return CONFIRMED_STATUSES.includes(status) || status === 'accounting_confirmed';
}

function isAccountingConfirmed(order = {}, latestVersion = null) {
  const accountingStatus = lower(order.accountingStatus || order.arStatus || '');
  const lifecycleStatus = lower(order.lifecycleStatus || '');
  const closeoutStatus = lower(order.deliveryCloseout?.status || order.deliveryCloseoutStatus || '');
  const versionStatus = lower(latestVersion?.accountingStatus || latestVersion?.status || latestVersion?.closeoutStatus || '');
  return order.accountingConfirmed === true
    || isConfirmedStatus(accountingStatus)
    || lifecycleStatus === 'accounting_confirmed'
    || closeoutStatus === 'accounting_confirmed'
    || isConfirmedStatus(versionStatus);
}

function lineReturnAmount(item = {}) {
  const qty = money(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.actualReturnQty ?? item.quantity ?? item.qty ?? 0);
  const price = money(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice ?? 0);
  const explicit = item.returnAmount ?? item.amount ?? item.lineTotal ?? item.totalAmount;
  const explicitMoney = explicit === undefined || explicit === null || explicit === '' ? 0 : money(explicit);
  return explicitMoney || Math.round(qty * price);
}

function returnOrderAmount(row = {}) {
  const direct = money(row.totalReturnAmount ?? row.returnAmount ?? row.totalAmount ?? row.amount ?? row.debtReduction ?? 0);
  if (direct > 0) return direct;
  return (Array.isArray(row.items) ? row.items : []).reduce((sum, item) => sum + lineReturnAmount(item), 0);
}

function returnOrderKeys(row = {}) {
  return unique([
    row.salesOrderId,
    row.salesOrderCode,
    row.orderId,
    row.orderCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    row.deliveryOrderId,
    row.deliveryOrderCode
  ]);
}

function deliveryCloseout(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

const CASH_FIELDS = ['cashAmount', 'cashCollectedAmount', 'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash', 'collectedCash', 'deliveryCashAmount', 'cashCollected', 'cash'];
const BANK_FIELDS = ['bankAmount', 'transferAmount', 'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount', 'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount', 'deliveryBankAmount', 'bankCollected', 'bankCollectedAmount', 'transferCollectedAmount'];
const BONUS_FIELDS = ['rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount'];
const OFFSET_FIELDS = ['offsetAmount', 'debtOffsetAmount', 'otherOffsetAmount', 'deliveryOffsetAmount'];

function orderMoneyBreakdown(order = {}) {
  const closeout = deliveryCloseout(order);
  const cashAmount = firstMoney(closeout, CASH_FIELDS) || firstMoney(order, CASH_FIELDS);
  const bankAmount = firstMoney(closeout, BANK_FIELDS) || firstMoney(order, BANK_FIELDS);
  const bonusAmount = firstMoney(closeout, BONUS_FIELDS) || firstMoney(order, BONUS_FIELDS);
  const offsetAmount = firstMoney(closeout, OFFSET_FIELDS) || firstMoney(order, OFFSET_FIELDS);
  const explicitCollected = firstMoney(closeout, ['collectedAmount', 'cashCollectedTotal', 'paidAmount', 'paymentAmount', 'deliveryCollectedAmount'])
    || firstMoney(order, ['collectedAmount', 'cashCollectedTotal', 'paidAmount', 'paymentAmount', 'deliveryCollectedAmount', 'paidAmount']);
  let collectedAmount = cashAmount + bankAmount;
  let nextCashAmount = cashAmount;
  if (!collectedAmount && explicitCollected > 0) {
    nextCashAmount = explicitCollected;
    collectedAmount = explicitCollected;
  }
  return {
    cashAmount: nextCashAmount,
    bankAmount,
    bonusAmount: bonusAmount + offsetAmount,
    collectedAmount
  };
}

function latestVersionMoney(latestVersion = null, fallback = {}) {
  if (!latestVersion) return fallback;
  const cashAmount = firstNumber(latestVersion, ['cashAmount', 'newCashAmount', 'cashCollectedAmount', 'newCashCollectedAmount', 'cashCollected']) || money(fallback.cashAmount);
  const bankAmount = firstNumber(latestVersion, ['bankAmount', 'newBankAmount', 'bankCollectedAmount', 'newBankCollectedAmount', 'transferAmount']) || money(fallback.bankAmount);
  const bonusAmount = firstNumber(latestVersion, ['rewardAmount', 'newRewardAmount', 'bonusAmount', 'newBonusAmount']) || money(fallback.bonusAmount);
  const explicitCollected = firstNumber(latestVersion, ['collectedAmount', 'newCollectedAmount', 'cashCollectedAmount', 'newCashCollectedAmount']);
  return {
    cashAmount,
    bankAmount,
    bonusAmount,
    collectedAmount: explicitCollected || cashAmount + bankAmount
  };
}

async function loadReturnsByOrderKey(orders = [], options = {}) {
  const allKeys = unique(orders.flatMap(orderIdentityValues));
  if (!allKeys.length) return new Map();
  const match = {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { salesOrderId: { $in: allKeys } },
      { orderId: { $in: allKeys } },
      { sourceOrderId: { $in: allKeys } },
      { deliveryOrderId: { $in: allKeys } },
      { salesOrderCode: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { sourceOrderCode: { $in: allKeys } },
      { deliveryOrderCode: { $in: allKeys } }
    ]
  };
  let query = ReturnOrder.find(match).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const rows = (await query).filter((row) => !isInactive(row));
  const map = new Map();
  for (const row of rows) {
    const keys = returnOrderKeys(row);
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
}

function deliveryCloseoutVersionKeys(row = {}) {
  return unique([
    row.salesOrderId,
    row.salesOrderCode,
    row.orderId,
    row.orderCode,
    row.originalCloseoutId,
    row.originalCloseoutCode,
    row.closeoutId,
    row.closeoutCode
  ]);
}

function isInactiveDeliveryCloseoutVersion(row = {}) {
  return isInactive(row) || lower(row.status || row.accountingStatus || row.closeoutStatus).includes('cancel');
}

function deliveryCloseoutVersionRank(row = {}) {
  return isConfirmedStatus(row.accountingStatus || row.status || row.closeoutStatus) ? 2 : 1;
}

function deliveryCloseoutVersionTime(row = {}) {
  const value = Date.parse(row.updatedAt || row.createdAt || row.deliveredAt || row.accountingConfirmedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function isBetterDeliveryCloseoutVersion(candidate = {}, current = null) {
  if (!current) return true;
  const rankDiff = deliveryCloseoutVersionRank(candidate) - deliveryCloseoutVersionRank(current);
  if (rankDiff !== 0) return rankDiff > 0;
  const versionDiff = Number(candidate.closeoutVersion || candidate.originalCloseoutVersion || 0) - Number(current.closeoutVersion || current.originalCloseoutVersion || 0);
  if (versionDiff !== 0) return versionDiff > 0;
  return deliveryCloseoutVersionTime(candidate) > deliveryCloseoutVersionTime(current);
}

async function loadLatestVersionsByOrderKey(orders = [], options = {}) {
  const allKeys = unique(orders.flatMap(orderIdentityValues));
  if (!allKeys.length) return new Map();
  const match = {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { salesOrderId: { $in: allKeys } },
      { salesOrderCode: { $in: allKeys } },
      { orderId: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { originalCloseoutId: { $in: allKeys } },
      { originalCloseoutCode: { $in: allKeys } },
      { closeoutId: { $in: allKeys } },
      { closeoutCode: { $in: allKeys } }
    ]
  };
  let query = DeliveryCloseoutVersion.find(match).sort({ closeoutVersion: -1, updatedAt: -1, createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const rows = (await query).filter((row) => !isInactiveDeliveryCloseoutVersion(row));
  const map = new Map();
  for (const row of rows || []) {
    for (const key of deliveryCloseoutVersionKeys(row)) {
      const current = map.get(key);
      if (isBetterDeliveryCloseoutVersion(row, current)) map.set(key, row);
    }
  }
  return map;
}

function rowsForOrder(order = {}, byKey = new Map()) {
  const seen = new Set();
  const rows = [];
  for (const key of orderIdentityValues(order)) {
    for (const row of byKey.get(key) || []) {
      const rowKey = text(row.id || row.code || row._id || JSON.stringify(returnOrderKeys(row)));
      if (rowKey && seen.has(rowKey)) continue;
      if (rowKey) seen.add(rowKey);
      rows.push(row);
    }
  }
  return rows;
}

function firstByOrderKeys(order = {}, byKey = new Map()) {
  for (const key of orderIdentityValues(order)) {
    const value = byKey.get(key);
    if (value) return value;
  }
  return null;
}

function arBalanceForOrder(order = {}, arBalanceMap = new Map()) {
  for (const key of orderIdentityValues(order)) {
    if (arBalanceMap.has(key)) return Math.max(0, normalizeDebtAmount(arBalanceMap.get(key)));
  }
  return null;
}

function hasDeliveryOperationalState(order = {}, summary = {}) {
  const deliveryStatus = lower(order.deliveryStatus || order.lifecycleStatus || order.status || '');
  if (['assigned', 'delivering', 'delivered', 'completed', 'done', 'accounting_confirmed'].includes(deliveryStatus)) return true;
  if (orderMasterCode(order)) return true;
  return ['cashAmount', 'bankAmount', 'bonusAmount', 'returnAmount', 'collectedAmount'].some((key) => money(summary[key]) > 0);
}

function buildMobileSalesOrderTrackingSummary(order = {}, context = {}) {
  const returnRows = rowsForOrder(order, context.returnsByKey);
  const latestVersion = firstByOrderKeys(order, context.versionsByKey);
  const confirmed = isAccountingConfirmed(order, latestVersion);

  // orders/salesOrders remain the primary source for the original order identity and payable amount.
  // deliveryCloseoutVersions only overlays actual delivery money; returnOrders is the return SSoT.
  const totalAmount = orderTotalAmount(order) || money(latestVersion?.originalAmount ?? latestVersion?.saleAmount ?? 0);
  const moneySource = latestVersionMoney(latestVersion, orderMoneyBreakdown(order));
  const returnFromRows = returnRows.reduce((sum, row) => sum + returnOrderAmount(row), 0);
  const returnAmount = returnRows.length
    ? money(returnFromRows)
    : money(latestVersion?.returnedAmount ?? latestVersion?.returnAmount ?? order.returnAmount ?? order.returnedAmount ?? 0);

  const calculatedDebt = calculateDeliveryDebtAmount({
    receivableAmount: totalAmount,
    cashAmount: moneySource.cashAmount,
    bankAmount: moneySource.bankAmount,
    rewardAmount: moneySource.bonusAmount,
    returnAmount
  }).debtAmount;
  const arDebt = confirmed ? arBalanceForOrder(order, context.arBalanceMap) : null;
  const remainingDebt = arDebt !== null
    ? arDebt
    : Math.max(0, normalizeDebtAmount(calculatedDebt));

  const closeout = deliveryCloseout(order);
  const source = confirmed && arDebt !== null
    ? 'accounting_confirmed_ar_ledger'
    : (latestVersion ? (confirmed ? 'delivery_closeout_accounting_confirmed' : 'delivery_pending_accounting')
      : (hasDeliveryOperationalState(order, { ...moneySource, returnAmount }) ? 'delivery_pending_accounting' : 'sales_order_snapshot'));

  return {
    masterOrderCode: orderMasterCode(order) || text(latestVersion?.masterOrderCode || latestVersion?.masterOrderNo || ''),
    deliveryStaffCode: deliveryStaffCode(order) || text(latestVersion?.deliveryStaffCode || ''),
    deliveryStaffName: deliveryStaffName(order) || text(latestVersion?.deliveryStaffName || ''),
    salesStaffCode: salesStaffCode(order) || text(latestVersion?.salesStaffCode || ''),
    salesStaffName: salesStaffName(order) || text(latestVersion?.salesStaffName || ''),
    deliveryStatus: text(latestVersion?.deliveryStatus || latestVersion?.closeoutStatus || order.deliveryStatus || order.lifecycleStatus || order.status || 'pending'),
    accountingStatus: confirmed ? 'accounting_confirmed' : text(latestVersion?.accountingStatus || order.accountingStatus || closeout.status || 'pending'),
    accountingConfirmed: confirmed,
    totalAmount,
    collectedAmount: money(moneySource.collectedAmount),
    cashAmount: money(moneySource.cashAmount),
    bankAmount: money(moneySource.bankAmount),
    bonusAmount: money(moneySource.bonusAmount),
    rewardAmount: money(moneySource.bonusAmount),
    returnAmount,
    remainingDebt,
    deliveredAt: text(latestVersion?.deliveredAt || order.deliveredAt || closeout.deliveredAt || closeout.closedAt || ''),
    accountingConfirmedAt: text(latestVersion?.accountingConfirmedAt || order.accountingConfirmedAt || closeout.accountingConfirmedAt || ''),
    returnOrderCount: returnRows.length,
    returnOrderCodes: unique(returnRows.map((row) => row.code || row.id)),
    source
  };
}

async function buildMobileSalesOrderTrackingSummaries(orders = [], options = {}) {
  const rows = Array.isArray(orders) ? orders : [];
  if (!rows.length) return new Map();
  const [returnsByKey, versionsByKey, arBalanceMap] = await Promise.all([
    loadReturnsByOrderKey(rows, options),
    loadLatestVersionsByOrderKey(rows, options),
    arBalanceService.loadOrderBalances(rows, options)
  ]);
  const map = new Map();
  for (const order of rows) {
    const summary = buildMobileSalesOrderTrackingSummary(order, {
      returnsByKey,
      versionsByKey,
      arBalanceMap
    });
    for (const key of orderIdentityValues(order)) map.set(key, summary);
  }
  return map;
}

function resolveMobileSalesOrderPrintUrl(order = {}) {
  const key = encodeURIComponent(orderPrimaryKey(order) || orderDisplayCode(order));
  return key ? `/api/mobile/sales/orders/${key}/print.pdf` : '';
}

function decorateMobileSalesOrderForTracking(order = {}, tracking = null) {
  const editable = order.canEdit === undefined ? !order.editLockReason : Boolean(order.canEdit);
  const summary = tracking || buildMobileSalesOrderTrackingSummary(order);
  return {
    ...order,
    orderId: order.id || text(order._id || ''),
    orderCode: orderDisplayCode(order),
    locked: !editable,
    editable,
    canEdit: editable,
    lockedReason: editable ? '' : text(order.lockedReason || order.editLockReason || 'Đã khóa sửa'),
    editLockReason: editable ? '' : text(order.editLockReason || order.lockedReason || 'Đã khóa sửa'),
    deliveryTracking: summary,
    printUrl: resolveMobileSalesOrderPrintUrl(order),
    collectedAmount: summary.collectedAmount,
    cashAmount: summary.cashAmount,
    bankAmount: summary.bankAmount,
    bonusAmount: summary.bonusAmount,
    rewardAmount: summary.rewardAmount,
    returnAmount: summary.returnAmount,
    remainingDebt: summary.remainingDebt,
    orderRemainingDebt: summary.remainingDebt
  };
}

module.exports = {
  buildMobileSalesOrderTrackingSummary,
  buildMobileSalesOrderTrackingSummaries,
  decorateMobileSalesOrderForTracking,
  resolveMobileSalesOrderPrintUrl,
  orderIdentityValues,
  _internal: {
    money,
    unique,
    orderTotalAmount,
    orderMoneyBreakdown,
    returnOrderAmount,
    deliveryCloseoutVersionKeys,
    isInactiveDeliveryCloseoutVersion,
    isBetterDeliveryCloseoutVersion,
    isAccountingConfirmed,
    hasDeliveryOperationalState
  }
};
