'use strict';

const { toNumber } = require('./common.util');
const { normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../constants/finance.constants');
const { isActiveLedgerDoc } = require('./arLedgerStatus.util');
const {
  isDefaultDebitArLedger,
  normalizeArLedgerAmounts,
  firstPositiveMoney: firstPositiveArMoney
} = require('./arLedgerCategoryEffect.util');

function normalizeArKey(value) {
  return String(value || '').trim();
}

function orderKeysFrom(value = {}) {
  return [
    value.orderId,
    value.orderCode,
    value.salesOrderId,
    value.salesOrderCode,
    value.refId,
    value.refCode,
    value.id,
    value.code
  ].map(normalizeArKey).filter(Boolean);
}

function entryMatchesAnyOrderKey(entry = {}, keys = []) {
  const keySet = new Set((keys || []).map(normalizeArKey).filter(Boolean));
  if (!keySet.size) return false;
  return orderKeysFrom(entry).some((key) => keySet.has(key));
}

function isSaleLikeArEntry(entry = {}) {
  return isDefaultDebitArLedger(entry);
}

function firstPositiveMoney(...values) {
  return firstPositiveArMoney(...values);
}

/**
 * Chuẩn hóa các dòng AR legacy. Một số dữ liệu cũ chỉ có `amount` mà chưa có
 * `debit`/`credit`. Quy tắc này phải giống báo cáo công nợ:
 * - SALE/EXTERNAL_DEBT/AR-RETURN-REVERSAL: amount là debit fallback.
 * - RECEIPT/RETURN/BONUS/...: amount là credit fallback.
 */
function effectiveArDebit(entry = {}) {
  return normalizeArLedgerAmounts(entry).debit;
}

function effectiveArCredit(entry = {}) {
  return normalizeArLedgerAmounts(entry).credit;
}

function arEntryBalanceEffect(entry = {}) {
  return effectiveArDebit(entry) - effectiveArCredit(entry);
}

function isActiveArEntry(entry = {}) {
  return isActiveLedgerDoc(entry, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] });
}

function arBalance(entries = [], keys = []) {
  return normalizeDebtAmount((Array.isArray(entries) ? entries : [])
    .filter(isActiveArEntry)
    .filter((entry) => entryMatchesAnyOrderKey(entry, keys))
    .reduce((sum, entry) => sum + arEntryBalanceEffect(entry), 0));
}

function normalizeAllocations(value) {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch (_) { rows = []; }
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    orderId: normalizeArKey(row.orderId || row.salesOrderId || row.id),
    orderCode: normalizeArKey(row.orderCode || row.salesOrderCode || row.code),
    amount: toNumber(row.amount ?? row.allocatedAmount ?? row.paymentAmount)
  })).filter((row) => (row.orderId || row.orderCode) && row.amount > 0);
}

function groupAllocationAmountByOrder(allocations = []) {
  const grouped = new Map();
  for (const row of normalizeAllocations(allocations)) {
    const key = row.orderId || row.orderCode;
    const existing = grouped.get(key) || { orderId: row.orderId, orderCode: row.orderCode, amount: 0 };
    existing.amount += toNumber(row.amount);
    grouped.set(key, existing);
  }
  return [...grouped.values()];
}

async function validateAllocationsDoNotOverpay(allocations = [], paymentRepository, options = {}) {
  const grouped = groupAllocationAmountByOrder(allocations);
  if (!grouped.length || !paymentRepository || typeof paymentRepository.findAll !== 'function') {
    return { ok: true, rows: [] };
  }

  const allKeys = [...new Set(grouped.flatMap((row) => [row.orderId, row.orderCode]).map(normalizeArKey).filter(Boolean))];
  if (!allKeys.length) return { ok: true, rows: [] };

  const ledgerRows = await paymentRepository.findAll({
    $or: [
      { orderId: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { salesOrderId: { $in: allKeys } },
      { salesOrderCode: { $in: allKeys } },
      { refId: { $in: allKeys } },
      { refCode: { $in: allKeys } }
    ]
  }, options);

  for (const row of grouped) {
    const keys = [row.orderId, row.orderCode].map(normalizeArKey).filter(Boolean);
    const openDebt = arBalance(ledgerRows, keys);
    if (row.amount - openDebt > DEBT_ZERO_TOLERANCE) {
      return {
        ok: false,
        status: 400,
        error: `Số tiền phân bổ cho đơn ${row.orderCode || row.orderId} vượt công nợ còn lại`,
        detail: { orderId: row.orderId, orderCode: row.orderCode, allocatedAmount: row.amount, openDebt }
      };
    }
  }

  return { ok: true, rows: grouped };
}

module.exports = {
  normalizeArKey,
  orderKeysFrom,
  entryMatchesAnyOrderKey,
  isSaleLikeArEntry,
  effectiveArDebit,
  effectiveArCredit,
  arEntryBalanceEffect,
  isActiveArEntry,
  arBalance,
  normalizeAllocations,
  groupAllocationAmountByOrder,
  validateAllocationsDoNotOverpay
};
