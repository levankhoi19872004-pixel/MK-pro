'use strict';

function clean(value = '') {
  return String(value ?? '').trim();
}

const COMPLETED_DELIVERY_STATUSES = new Set(['delivered', 'success', 'completed', 'done']);
const INACTIVE_STATUSES = new Set(['cancelled', 'canceled', 'deleted', 'void', 'voided']);

function sourceDeliveryStatus(order = {}) {
  return clean(order.deliveryStatus || order.status || order.lifecycleStatus).toLowerCase();
}

function isCompletedDeliveryStatus(status = '') {
  return COMPLETED_DELIVERY_STATUSES.has(clean(status).toLowerCase());
}

function isInactiveOrder(order = {}) {
  const status = sourceDeliveryStatus(order);
  return order.deleted === true
    || order.isDeleted === true
    || order.cancelled === true
    || order.canceled === true
    || INACTIVE_STATUSES.has(status);
}

function isAccountingConfirmedOrder(order = {}, context = {}) {
  if (context.confirmedCloseout === true) return true;
  const accountingStatus = clean(order.accountingStatus).toLowerCase();
  const closeoutStatus = clean(order.deliveryCloseout?.status || order.closeoutStatus || order.deliveryCloseoutStatus).toLowerCase();
  return order.accountingConfirmed === true
    || accountingStatus === 'confirmed'
    || closeoutStatus === 'accounting_confirmed'
    || closeoutStatus === 'corrected_confirmed'
    || closeoutStatus === 'closed';
}

function evaluateCloseoutEligibility(order = {}, context = {}) {
  const sourceStatus = sourceDeliveryStatus(order);
  if (!order || typeof order !== 'object') {
    return { eligible: false, code: 'ORDER_MISSING', reasonCode: 'ORDER_MISSING', message: 'Khong tim thay don can chot so.', sourceStatus };
  }
  if (isInactiveOrder(order)) {
    return { eligible: false, code: 'ORDER_INACTIVE', reasonCode: 'ORDER_INACTIVE', message: 'Don da bi huy/xoa hoac khong con hop le de chot so.', sourceStatus };
  }
  if (isAccountingConfirmedOrder(order, context)) {
    return { eligible: false, code: 'ALREADY_ACCOUNTING_CONFIRMED', reasonCode: 'ALREADY_ACCOUNTING_CONFIRMED', message: 'Don da duoc ke toan chot truoc do.', sourceStatus };
  }
  if (!isCompletedDeliveryStatus(sourceStatus)) {
    return { eligible: false, code: 'DELIVERY_NOT_COMPLETED', reasonCode: 'DELIVERY_NOT_COMPLETED', message: 'Don chua hoan tat giao hang nen khong the chot so.', sourceStatus };
  }
  return { eligible: true, code: 'ELIGIBLE', reasonCode: 'ELIGIBLE', message: '', sourceStatus };
}

module.exports = {
  evaluateCloseoutEligibility,
  isCompletedDeliveryStatus
};
