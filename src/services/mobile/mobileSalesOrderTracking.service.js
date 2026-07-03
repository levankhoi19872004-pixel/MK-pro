'use strict';

const ReturnOrder = require('../../models/ReturnOrder');
const FundLedger = require('../../models/FundLedger');
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
  return money(order.totalAmount ?? order.amount ?? order.total ?? order.grandTotal ?? order.payableAmount ?? order.orderAmount);
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

function isAccountingConfirmed(order = {}, latestVersion = null) {
  const accountingStatus = lower(order.accountingStatus || order.arStatus || '');
  const lifecycleStatus = lower(order.lifecycleStatus || '');
  const closeoutStatus = lower(order.deliveryCloseout?.status || order.deliveryCloseoutStatus || '');
  const versionStatus = lower(latestVersion?.status || latestVersion?.accountingStatus || '');
  return order.accountingConfirmed === true
    || CONFIRMED_STATUSES.includes(accountingStatus)
    || lifecycleStatus === 'accounting_confirmed'
    || closeoutStatus === 'accounting_confirmed'
    || versionStatus === 'accounting_confirmed';
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
  const cashAmount = money(latestVersion.cashAmount ?? latestVersion.newCashAmount ?? latestVersion.cashCollectedAmount ?? fallback.cashAmount);
  const bankAmount = money(latestVersion.bankAmount ?? latestVersion.newBankAmount ?? latestVersion.bankCollectedAmount ?? fallback.bankAmount);
  const bonusAmount = money(latestVersion.rewardAmount ?? latestVersion.newRewardAmount ?? latestVersion.bonusAmount ?? fallback.bonusAmount);
  const collectedAmount = money(latestVersion.collectedAmount ?? latestVersion.newCollectedAmount ?? (cashAmount + bankAmount));
  return {
    cashAmount,
    bankAmount,
    bonusAmount,
    collectedAmount: collectedAmount || cashAmount + bankAmount
  };
}

function fundLedgerKeys(row = {}) {
  return unique([
    row.orderId,
    row.orderCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.refId,
    row.refCode,
    row.referenceId,
    row.referenceCode,
    row.sourceId,
    row.sourceCode,
    row.originalSourceId
  ]);
}

function isActiveFundLedger(row = {}) {
  if (row.isDeleted === true || row.deleted === true || row.deletedAt) return false;
  const status = lower(row.status || row.accountingStatus || '');
  if (INACTIVE_STATUSES.includes(status)) return false;
  return true;
}

function fundLedgerSignedAmount(row = {}) {
  const amount = money(row.amount);
  const direction = lower(row.direction || 'in');
  if (row.isReversal === true || direction === 'out' || direction === 'cash_out') return -amount;
  return amount;
}

function applyFundLedgerRow(target, row = {}) {
  const amount = fundLedgerSignedAmount(row);
  const fundType = lower(row.fundType || row.account || row.paymentMethod || row.method || 'cash');
  if (fundType.includes('bank') || fundType.includes('transfer') || fundType.includes('ck')) target.bankAmount += amount;
  else target.cashAmount += amount;
  target.collectedAmount = target.cashAmount + target.bankAmount;
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

async function loadLatestVersionsByOrderKey(orders = [], options = {}) {
  const allKeys = unique(orders.flatMap(orderIdentityValues));
  if (!allKeys.length) return new Map();
  const match = {
    $or: [
      { salesOrderId: { $in: allKeys } },
      { salesOrderCode: { $in: allKeys } },
      { orderId: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { originalCloseoutId: { $in: allKeys } },
      { originalCloseoutCode: { $in: allKeys } }
    ]
  };
  let query = DeliveryCloseoutVersion.find(match).sort({ closeoutVersion: -1, createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const rows = await query;
  const map = new Map();
  for (const row of rows || []) {
    const keys = unique([row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode, row.originalCloseoutId, row.originalCloseoutCode]);
    for (const key of keys) {
      const current = map.get(key);
      if (!current || Number(row.closeoutVersion || 0) > Number(current.closeoutVersion || 0)) map.set(key, row);
    }
  }
  return map;
}

async function loadFundLedgersByOrderKey(orders = [], options = {}) {
  const allKeys = unique(orders.flatMap(orderIdentityValues));
  if (!allKeys.length) return new Map();
  const match = {
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    $or: [
      { orderId: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { salesOrderId: { $in: allKeys } },
      { salesOrderCode: { $in: allKeys } },
      { refId: { $in: allKeys } },
      { refCode: { $in: allKeys } },
      { referenceId: { $in: allKeys } },
      { referenceCode: { $in: allKeys } },
      { sourceId: { $in: allKeys } },
      { sourceCode: { $in: allKeys } },
      { originalSourceId: { $in: allKeys } }
    ]
  };
  let query = FundLedger.find(match).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const rows = (await query).filter(isActiveFundLedger);
  const map = new Map();
  for (const row of rows) {
    for (const key of fundLedgerKeys(row)) {
      if (!map.has(key)) map.set(key, { cashAmount: 0, bankAmount: 0, collectedAmount: 0 });
      applyFundLedgerRow(map.get(key), row);
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
  const fundBreakdown = firstByOrderKeys(order, context.fundLedgersByKey);
  const confirmed = isAccountingConfirmed(order, latestVersion);
  const baseMoney = latestVersionMoney(latestVersion, orderMoneyBreakdown(order));
  const moneySource = confirmed && fundBreakdown && (money(fundBreakdown.cashAmount) || money(fundBreakdown.bankAmount))
    ? { ...baseMoney, cashAmount: money(fundBreakdown.cashAmount), bankAmount: money(fundBreakdown.bankAmount), collectedAmount: money(fundBreakdown.cashAmount) + money(fundBreakdown.bankAmount) }
    : baseMoney;
  const returnFromRows = returnRows.reduce((sum, row) => sum + returnOrderAmount(row), 0);
  const returnAmount = money(latestVersion?.returnedAmount ?? latestVersion?.returnAmount ?? returnFromRows ?? order.returnAmount ?? order.returnedAmount ?? 0);
  const totalAmount = money(latestVersion?.originalAmount ?? latestVersion?.saleAmount ?? orderTotalAmount(order));
  const calculatedDebt = calculateDeliveryDebtAmount({
    receivableAmount: totalAmount,
    cashAmount: moneySource.cashAmount,
    bankAmount: moneySource.bankAmount,
    rewardAmount: moneySource.bonusAmount,
    returnAmount
  }).debtAmount;
  const arDebt = confirmed ? arBalanceForOrder(order, context.arBalanceMap) : null;
  const remainingDebt = arDebt !== null ? arDebt : Math.max(0, normalizeDebtAmount(latestVersion?.finalDebtAmount ?? latestVersion?.debtAmount ?? calculatedDebt));
  const closeout = deliveryCloseout(order);
  const source = confirmed && arDebt !== null
    ? 'accounting_confirmed_ar_ledger'
    : (latestVersion ? 'delivery_closeout_version' : (hasDeliveryOperationalState(order, { ...moneySource, returnAmount }) ? 'delivery_pending_accounting' : 'sales_order_snapshot'));

  return {
    masterOrderCode: orderMasterCode(order),
    deliveryStaffCode: deliveryStaffCode(order),
    deliveryStaffName: deliveryStaffName(order),
    salesStaffCode: salesStaffCode(order),
    salesStaffName: salesStaffName(order),
    deliveryStatus: text(order.deliveryStatus || order.lifecycleStatus || order.status || 'pending'),
    accountingStatus: confirmed ? 'accounting_confirmed' : text(order.accountingStatus || closeout.status || 'pending'),
    accountingConfirmed: confirmed,
    totalAmount,
    collectedAmount: money(moneySource.collectedAmount),
    cashAmount: money(moneySource.cashAmount),
    bankAmount: money(moneySource.bankAmount),
    bonusAmount: money(moneySource.bonusAmount),
    rewardAmount: money(moneySource.bonusAmount),
    returnAmount,
    remainingDebt,
    deliveredAt: text(order.deliveredAt || closeout.deliveredAt || closeout.closedAt || ''),
    accountingConfirmedAt: text(order.accountingConfirmedAt || closeout.accountingConfirmedAt || latestVersion?.createdAt || ''),
    returnOrderCount: returnRows.length,
    returnOrderCodes: unique(returnRows.map((row) => row.code || row.id)),
    source
  };
}

async function buildMobileSalesOrderTrackingSummaries(orders = [], options = {}) {
  const rows = Array.isArray(orders) ? orders : [];
  if (!rows.length) return new Map();
  const [returnsByKey, versionsByKey, fundLedgersByKey, arBalanceMap] = await Promise.all([
    loadReturnsByOrderKey(rows, options),
    loadLatestVersionsByOrderKey(rows, options),
    loadFundLedgersByOrderKey(rows, options),
    arBalanceService.loadOrderBalances(rows, options)
  ]);
  const map = new Map();
  for (const order of rows) {
    const summary = buildMobileSalesOrderTrackingSummary(order, {
      returnsByKey,
      versionsByKey,
      fundLedgersByKey,
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
    isAccountingConfirmed,
    hasDeliveryOperationalState
  }
};
