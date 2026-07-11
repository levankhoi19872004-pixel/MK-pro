'use strict';

const orderRepository = require('../../../repositories/orderRepository');
const DeliveryCloseoutService = require('../DeliveryCloseoutService');
const { findReturnOrdersForDeliveryChildren } = require('../../master-order/masterOrderReturn.impl');
const { compactDeliveryOrderKeys } = require('../../master-order/masterOrderIdentity.util');
const closeoutQueryAudit = require('../../../observability/closeoutQueryAudit');

const CLOSEOUT_ORDER_PROJECTION = [
  'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt',
  'customerId', 'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed', 'accountingLocked',
  'cashClosed', 'cashSubmitted', 'dayLocked', 'periodLocked', 'settlementClosed', 'editLocked', 'deliveryLocked',
  'totalAmount', 'subtotal', 'discountAmount', 'finalAmount', 'payableAmount', 'debtBeforeCollection', 'debtAmount', 'debt', 'arBalance',
  'paidAmount', 'cashCollected', 'cashAmount', 'bankCollected', 'bankAmount', 'transferAmount',
  'returnAmount', 'returnedAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders',
  'rewardAmount', 'bonusAmount', 'allowanceAmount', 'promotionRewardAmount', 'displayRewardAmount', 'bonusReturnAmount', 'rewardOffsetAmount', 'promotionOffsetAmount', 'offsetAmount', 'debtOffsetAmount',
  'paymentAllocations', 'deliveryPayment', 'deliveryPayments', 'payments', 'items', 'lines', 'products',
  'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode', 'masterId', 'masterCode',
  'deliveryCloseout', 'version', 'note', 'deliveryNote'
].join(' ');

function orderIdentity(order = {}) {
  return String(
    DeliveryCloseoutService.orderId(order)
    || DeliveryCloseoutService.orderCode(order)
    || order.id
    || order.code
    || order.orderCode
    || ''
  ).trim();
}

function orderIdentityValues(order = {}) {
  return Array.from(new Set([
    ...compactDeliveryOrderKeys(order),
    orderIdentity(order)
  ].map((value) => String(value || '').trim()).filter(Boolean)));
}

async function loadCriticalOrder(order = {}, options = {}) {
  const identity = orderIdentity(order);
  if (!identity) return null;
  return orderRepository.findByIdOrCode(identity, {
    session: options.session,
    projection: options.projection || CLOSEOUT_ORDER_PROJECTION
  });
}

async function loadCriticalOrderAndReturns(order = {}, options = {}) {
  const criticalOrder = await loadCriticalOrder(order, options);
  if (!criticalOrder) {
    const err = new Error('Khong the doc lai don trong transaction truoc khi chot so.');
    err.code = 'CLOSEOUT_CRITICAL_ORDER_NOT_FOUND';
    err.orderId = orderIdentity(order);
    throw err;
  }
  const returnOrders = await findReturnOrdersForDeliveryChildren([criticalOrder], {
    session: options.session
  });
  return { order: criticalOrder, returnOrders };
}

async function loadCriticalOrdersAndReturns(orders = [], options = {}) {
  const preflightOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
  const identityValues = Array.from(new Set(preflightOrders.flatMap(orderIdentityValues)));
  const criticalOrders = identityValues.length
    ? await closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.orders', () => orderRepository.findManyByIdentity(identityValues, {
      session: options.session,
      projection: options.projection || CLOSEOUT_ORDER_PROJECTION,
      limit: Math.max(1, identityValues.length)
    }))
    : [];
  const criticalByKey = new Map();
  for (const order of criticalOrders || []) {
    for (const key of orderIdentityValues(order)) {
      if (!criticalByKey.has(key)) criticalByKey.set(key, order);
    }
  }
  const orderedCritical = preflightOrders.map((order) => {
    for (const key of orderIdentityValues(order)) {
      const critical = criticalByKey.get(key);
      if (critical) return critical;
    }
    const err = new Error('Khong the doc lai don trong transaction truoc khi chot so.');
    err.code = 'CLOSEOUT_CRITICAL_ORDER_NOT_FOUND';
    err.orderId = orderIdentity(order);
    throw err;
  });
  const returnOrders = await closeoutQueryAudit.withCloseoutAuditStage('transaction.critical.returnOrders', () => findReturnOrdersForDeliveryChildren(orderedCritical, {
    session: options.session
  }));
  return { orders: orderedCritical, returnOrders };
}

module.exports = {
  CLOSEOUT_ORDER_PROJECTION,
  loadCriticalOrder,
  loadCriticalOrderAndReturns,
  loadCriticalOrdersAndReturns,
  _internal: { orderIdentity, orderIdentityValues }
};
