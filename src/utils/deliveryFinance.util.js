'use strict';

const { toNumber } = require('./common.util');
const { normalizeDebtAmount } = require('../constants/finance.constants');
const { readDeliveryMoney } = require('./deliveryMoney.util');

function firstPositiveAmount(...values) {
  for (const value of values) {
    const n = toNumber(value);
    if (n > 0) return n;
  }
  return 0;
}

function deliveryDebtBase(order = {}) {
  // V45 accounting rule:
  // AR-SALE phải lấy theo tổng phải thu ban đầu của đơn giao, không lấy theo còn nợ.
  // Nhiều đơn thu đủ có debtAmount = 0 nhưng vẫn bắt buộc phải post AR-SALE + các dòng credit
  // để màn Công nợ có lịch sử đủ và đối soát về 0.
  return firstPositiveAmount(
    order.totalReceivable,
    order.receivableAmount,
    order.debtBeforeCollection,
    order.totalAmount,
    order.total,
    order.amount,
    order.grandTotal,
    order.payableAmount,
    order.orderAmount,
    order.originalAmount,
    order.invoiceAmount,
    // debtAmount/debt chỉ là fallback cuối cho dữ liệu cũ thiếu tổng phải thu.
    order.debtAmount,
    order.debt
  );
}

function lineReturnAmount(item = {}) {
  const qty = toNumber(item.qtyReturn ?? item.returnQty ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
  const price = toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
  const explicit = item.returnAmount ?? item.amount;
  const amount = explicit === undefined || explicit === null || explicit === '' ? NaN : toNumber(explicit);
  return Number.isFinite(amount) && amount !== 0 ? amount : Math.round(qty * price);
}

function amountFromReturnOrder(returnOrder = {}) {
  const directTotal = toNumber(returnOrder.totalReturnAmount ?? returnOrder.returnAmount ?? returnOrder.totalAmount ?? returnOrder.amount ?? 0);
  if (directTotal > 0) return Math.round(directTotal);
  const items = Array.isArray(returnOrder.items) ? returnOrder.items : [];
  return Math.round(items.reduce((sum, item) => sum + lineReturnAmount(item), 0));
}

function deliveryReturnAmount(order = {}) {
  if (order.returnAmountFromReturnOrders !== undefined && order.returnAmountFromReturnOrders !== null) {
    return Math.round(toNumber(order.returnAmountFromReturnOrders));
  }
  const returnItems = Array.isArray(order.deliveryReturnItems)
    ? order.deliveryReturnItems
    : (Array.isArray(order.returnItems) ? order.returnItems : null);
  if (Array.isArray(returnItems)) {
    return Math.round(returnItems.reduce((sum, item) => sum + lineReturnAmount(item), 0));
  }
  if (order.returnOrder) return amountFromReturnOrder(order.returnOrder);
  return Math.round(toNumber(order.returnAmount ?? order.totalReturnAmount ?? order.returnedAmount ?? 0));
}

function isDeliveryArLedgerSynced(order = {}) {
  return order?.arLedgerSynced === true || String(order?.debtSource || '').toLowerCase() === 'ar_ledger';
}

function deliveryArLedgerDebt(order = {}) {
  return Math.round(toNumber(order.arDebtAmount ?? order.arBalance ?? order.debtAmount ?? order.debt ?? 0));
}

function buildDeliveryAmount(order = {}, returnAmountOverride = null) {
  const totalReceivable = Math.max(0, normalizeDebtAmount(Math.round(deliveryDebtBase(order))));
  const money = readDeliveryMoney(order);
  const cashAmount = Math.max(0, normalizeDebtAmount(Math.round(money.cashAmount)));
  const bankAmount = Math.max(0, normalizeDebtAmount(Math.round(money.bankAmount)));
  const bonusAmount = Math.max(0, normalizeDebtAmount(Math.round(money.rewardAmount)));
  const returnAmount = Math.max(0, normalizeDebtAmount(Math.round(returnAmountOverride == null ? deliveryReturnAmount(order) : toNumber(returnAmountOverride))));
  const debtAmount = Math.max(0, normalizeDebtAmount(Math.round(totalReceivable - cashAmount - bankAmount - bonusAmount - returnAmount)));
  return { totalReceivable, cashAmount, bankAmount, bonusAmount, returnAmount, debtAmount };
}

function calculateDeliveryDebt(order = {}, options = {}) {
  if (options.useArLedgerIfSynced && isDeliveryArLedgerSynced(order)) return deliveryArLedgerDebt(order);
  return buildDeliveryAmount(order, options.returnAmountOverride).debtAmount;
}

module.exports = {
  firstPositiveAmount,
  deliveryDebtBase,
  lineReturnAmount,
  amountFromReturnOrder,
  deliveryReturnAmount,
  isDeliveryArLedgerSynced,
  deliveryArLedgerDebt,
  buildDeliveryAmount,
  calculateDeliveryDebt
};
