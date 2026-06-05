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
  return firstPositiveAmount(
    order.totalAmount,
    order.total,
    order.amount,
    order.grandTotal,
    order.payableAmount,
    order.orderAmount,
    order.debtBeforeCollection,
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

function deliveryLineCode(item = {}) {
  return String(item.productCode || item.code || item.productId || item.sku || '').trim();
}

function deliveryLineName(item = {}) {
  return item.productName || item.name || item.product || '';
}

function deliveryLineQty(item = {}) {
  return toNumber(item.deliveredQty ?? item.soldQty ?? item.quantitySold ?? item.orderQty ?? item.totalQty ?? item.qtySold ?? item.quantity ?? item.qty ?? 0);
}

function deliveryLineReturnQty(item = {}) {
  return toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? 0);
}

function deliveryLinePrice(item = {}) {
  return toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
}

function canonicalReturnItemFromLine(item = {}, fallback = {}) {
  const productCode = deliveryLineCode(item) || deliveryLineCode(fallback);
  const productName = deliveryLineName(item) || deliveryLineName(fallback);
  const deliveredQty = deliveryLineQty(fallback) || deliveryLineQty(item);
  const returnQty = deliveryLineReturnQty(item);
  const price = deliveryLinePrice(item) || deliveryLinePrice(fallback);
  const returnAmount = Math.max(0, Math.round(returnQty * price));
  return {
    ...fallback,
    ...item,
    productCode,
    productName,
    code: productCode,
    name: productName,
    deliveredQty,
    soldQty: deliveredQty,
    quantitySold: deliveredQty,
    qty: deliveredQty,
    quantity: deliveredQty,
    price,
    salePrice: price,
    unitPrice: price,
    returnQty,
    qtyReturn: returnQty,
    returnQuantity: returnQty,
    returnedQty: returnQty,
    returnAmount,
    amount: returnAmount
  };
}

function buildCanonicalDeliveryItems(order = {}, returnItems = []) {
  const returnByCode = new Map();
  for (const item of Array.isArray(returnItems) ? returnItems : []) {
    const code = deliveryLineCode(item);
    if (!code) continue;
    const prev = returnByCode.get(code);
    if (!prev) {
      returnByCode.set(code, canonicalReturnItemFromLine(item));
      continue;
    }
    const qty = deliveryLineReturnQty(item);
    const price = deliveryLinePrice(item) || deliveryLinePrice(prev);
    prev.returnQty += qty;
    prev.qtyReturn = prev.returnQty;
    prev.returnQuantity = prev.returnQty;
    prev.returnedQty = prev.returnQty;
    prev.price = price;
    prev.salePrice = price;
    prev.unitPrice = price;
    prev.returnAmount = Math.round(prev.returnQty * price);
    prev.amount = prev.returnAmount;
  }
  const soldItems = Array.isArray(order.items) ? order.items : [];
  const used = new Set();
  const merged = soldItems.map((sold, index) => {
    const code = deliveryLineCode(sold) || `SP${index + 1}`;
    const returned = returnByCode.get(code) || {};
    used.add(code);
    return canonicalReturnItemFromLine(returned, { ...sold, productCode: code });
  });
  for (const [code, item] of returnByCode.entries()) {
    if (!used.has(code)) merged.push(canonicalReturnItemFromLine(item));
  }
  return merged;
}

function buildCanonicalDeliveryAmounts(order = {}, returnAmountOverride = null) {
  const amount = buildDeliveryAmount(order, returnAmountOverride);
  const processed = Math.max(0, normalizeDebtAmount(Math.round(amount.cashAmount + amount.bankAmount + amount.bonusAmount + amount.returnAmount)));
  return {
    receivable: amount.totalReceivable,
    totalReceivable: amount.totalReceivable,
    cash: amount.cashAmount,
    cashAmount: amount.cashAmount,
    bank: amount.bankAmount,
    bankAmount: amount.bankAmount,
    reward: amount.bonusAmount,
    rewardAmount: amount.bonusAmount,
    bonusAmount: amount.bonusAmount,
    returnAmount: amount.returnAmount,
    processed,
    collectedAmount: processed,
    debt: amount.debtAmount,
    debtAmount: amount.debtAmount,
    remainingAmount: amount.debtAmount
  };
}

function buildCanonicalDeliveryOrder(order = {}, options = {}) {
  const returnItems = Array.isArray(options.returnItems) ? options.returnItems : (Array.isArray(order.deliveryReturnItems) ? order.deliveryReturnItems : (Array.isArray(order.returnItems) ? order.returnItems : []));
  const items = buildCanonicalDeliveryItems(order, returnItems);
  const returnAmount = options.returnAmountOverride == null
    ? items.reduce((sum, item) => sum + Math.max(0, Math.round(deliveryLineReturnQty(item) * deliveryLinePrice(item))), 0)
    : toNumber(options.returnAmountOverride);
  const amounts = buildCanonicalDeliveryAmounts(order, returnAmount);
  const orderCode = order.displayOrderCode || order.salesOrderCode || order.orderCode || order.code || order.id || '';
  const delivered = ['delivered', 'done', 'completed', 'paid'].includes(String(order.deliveryStatus || order.status || '').toLowerCase());
  return {
    ...order,
    orderId: order.id || order.orderId || order.salesOrderId || '',
    orderCode,
    salesOrderId: order.salesOrderId || order.id || order.orderId || '',
    salesOrderCode: order.salesOrderCode || order.orderCode || order.code || orderCode,
    displayOrderCode: orderCode,
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    deliveryDate: order.deliveryDate || order.date || '',
    salesStaffCode: order.salesStaffCode || order.salesmanCode || order.staffCode || '',
    deliveryStaffCode: order.deliveryStaffCode || '',
    items,
    returnItems: items,
    deliveryReturnItems: items,
    returnOrderItems: items,
    amounts,
    totalAmount: amounts.receivable,
    totalReceivable: amounts.receivable,
    debtBeforeCollection: amounts.receivable,
    cashAmount: amounts.cash,
    cashCollected: amounts.cash,
    bankAmount: amounts.bank,
    bankCollected: amounts.bank,
    transferAmount: amounts.bank,
    rewardAmount: amounts.reward,
    bonusAmount: amounts.reward,
    returnAmount: amounts.returnAmount,
    returnedAmount: amounts.returnAmount,
    returnAmountFromReturnOrders: amounts.returnAmount,
    processedAmount: amounts.processed,
    collectedAmount: amounts.processed,
    debtAmount: amounts.debt,
    debt: amounts.debt,
    remainingAmount: amounts.debt,
    statusInfo: {
      delivered,
      paymentStatus: amounts.debt <= 0 ? 'paid' : (amounts.processed > 0 ? 'partial' : 'unpaid'),
      returnStatus: amounts.returnAmount > 0 ? 'has_return' : 'none'
    }
  };
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
  calculateDeliveryDebt,
  deliveryLineCode,
  deliveryLineName,
  deliveryLineQty,
  deliveryLineReturnQty,
  deliveryLinePrice,
  buildCanonicalDeliveryItems,
  buildCanonicalDeliveryAmounts,
  buildCanonicalDeliveryOrder
};
