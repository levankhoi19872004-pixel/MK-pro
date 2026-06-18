'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const deliveryFinance = require('../../utils/deliveryFinance.util');
const reportService = require('../reportService');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');

const buildDeliveryAmount = lazyFunction('./masterOrderReturn.impl', 'buildDeliveryAmount');

function statusForDeliveryRow(order = {}) {
  const raw = String(order.deliveryStatus || order.status || 'pending').toLowerCase();
  const debt = deliveryFinance.calculateDeliveryDebt(order);
  if (['delivered', 'done', 'completed', 'paid'].includes(raw)) return hasOpenDebt(debt) ? 'unpaid' : 'delivered';
  if (['delivering', 'shipping', 'on_route'].includes(raw)) return 'delivering';
  if (['returned', 'partial_return'].includes(raw)) return raw;
  return 'waiting';
}

function masterDeliveryDebtMapKey(value) {
  return String(value || '').trim();
}

function masterDeliveryOrderKeys(...sources) {
  return [...new Set(sources.flatMap((source) => [
    source?.id,
    source?.code,
    source?.orderId,
    source?.orderCode,
    source?.salesOrderId,
    source?.salesOrderCode,
    source?.refId,
    source?.refCode
  ]).map(masterDeliveryDebtMapKey).filter(Boolean))];
}

function masterDeliveryPutDebtMapEntry(map, row = {}) {
  masterDeliveryOrderKeys(row).forEach((key) => map.set(key, row));
}

async function buildMasterDeliveryArDebtMap(orders = []) {
  const map = new Map();
  const wanted = new Set();
  (orders || []).forEach((order) => masterDeliveryOrderKeys(order).forEach((key) => wanted.add(key)));
  if (!wanted.size) return map;
  try {
    const report = await reportService.debtReport({ includePaid: '1', status: 'all' });
    const rows = Array.isArray(report?.debts) ? report.debts : [];
    rows.forEach((row) => {
      const keys = masterDeliveryOrderKeys(row);
      if (keys.some((key) => wanted.has(key))) masterDeliveryPutDebtMapEntry(map, row);
    });
  } catch (err) {
    // Nếu AR Ledger lỗi, màn giao hàng vẫn fallback về cache order để không vỡ giao diện.
  }
  return map;
}

function findMasterDeliveryArDebtRow(arDebtMap, ...sources) {
  if (!arDebtMap || !arDebtMap.size) return null;
  for (const key of masterDeliveryOrderKeys(...sources)) {
    const row = arDebtMap.get(key);
    if (row) return row;
  }
  return null;
}

function deliveryGroupKey(value, fallback) {
  const key = String(value || '').trim();
  return key || fallback;
}

function deliveryRowCollectedAmount(row = {}) {
  return toNumber(row.cashCollected || 0)
    + toNumber(row.bankCollected || 0)
    + toNumber(row.rewardAmount || 0)
    + deliveryFinance.deliveryReturnAmount(row);
}

function buildDeliverySummaryAccumulator(row = {}) {
  return {
    orderCount: 0,
    deliveredCount: 0,
    deliveringCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalReceivable: 0,
    totalAmount: 0,
    deliveredAmount: 0,
    cashAmount: 0,
    bankAmount: 0,
    bonusAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    collectedAmount: 0,
    debtAmount: 0,
    remainingAmount: 0,
    _salesStaffCodes: []
  };
}

function addDeliveryRowToSummary(acc, row = {}) {
  const visual = String(row.visualStatus || row.deliveryStatus || '').toLowerCase();
  const delivered = ['delivered', 'done', 'completed'].includes(visual);
  const failed = ['failed', 'cancelled', 'canceled', 'returned', 'delivery_failed'].includes(visual);
  const delivering = ['delivering', 'in_progress', 'on_route', 'shipping'].includes(visual);
  acc.orderCount += 1;
  if (delivered) acc.deliveredCount += 1;
  else if (failed) acc.failedCount += 1;
  else {
    // Giữ pendingCount tương thích với màn giao hàng cũ; deliveringCount là field
    // bổ sung để Dashboard có thể tách "đang giao" khỏi "chưa giao".
    acc.pendingCount += 1;
    if (delivering) acc.deliveringCount += 1;
  }
  const amount = buildDeliveryAmount(row, row.returnAmount);
  acc.totalReceivable += amount.totalReceivable;
  acc.totalAmount += amount.totalReceivable;
  if (delivered) acc.deliveredAmount += amount.totalReceivable;
  acc.cashAmount += amount.cashAmount;
  acc.bankAmount += amount.bankAmount;
  acc.bonusAmount += amount.bonusAmount;
  acc.rewardAmount += amount.bonusAmount;
  acc.returnAmount += amount.returnAmount;
  acc.collectedAmount += amount.collectedAmount;
  acc.debtAmount += amount.debtAmount;
  acc.remainingAmount += amount.debtAmount;
  const salesStaffCode = String(row.salesStaffCode || '').trim();
  if (salesStaffCode && !acc._salesStaffCodes.includes(salesStaffCode)) acc._salesStaffCodes.push(salesStaffCode);
  return acc;
}

function finalizeDeliverySummaryRow(row = {}) {
  const roundKeys = ['totalReceivable', 'totalAmount', 'deliveredAmount', 'cashAmount', 'bankAmount', 'bonusAmount', 'rewardAmount', 'returnAmount', 'collectedAmount', 'debtAmount', 'remainingAmount'];
  for (const key of roundKeys) row[key] = Math.max(0, normalizeDebtAmount(Math.round(toNumber(row[key]))));
  row.salesStaffCount = Array.isArray(row._salesStaffCodes) ? row._salesStaffCodes.length : 0;
  delete row._salesStaffCodes;
  return row;
}

module.exports = {
  statusForDeliveryRow,
  masterDeliveryDebtMapKey,
  masterDeliveryOrderKeys,
  masterDeliveryPutDebtMapEntry,
  buildMasterDeliveryArDebtMap,
  findMasterDeliveryArDebtRow,
  deliveryGroupKey,
  deliveryRowCollectedAmount,
  buildDeliverySummaryAccumulator,
  addDeliveryRowToSummary,
  finalizeDeliverySummaryRow
};