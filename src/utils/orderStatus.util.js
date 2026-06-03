'use strict';

const dateUtil = require('./date.util');

const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
});

const MERGE_STATUS = Object.freeze({
  UNMERGED: 'unmerged',
  MERGED: 'merged'
});

const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

const ACCOUNTING_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed'
});

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOrderSource(value) {
  const raw = clean(value);
  if (!raw) return 'manual';
  if (raw.includes('dms')) return 'dms';
  if (raw === 's3' || raw.includes('s3')) return 's3';
  if (raw.includes('mobile') || raw.includes('app') || raw.includes('nvbh') || raw.includes('sales')) return 'sales_app';
  return raw.replace(/\s+/g, '_');
}

function normalizeOrderStatus(order = {}) {
  const raw = clean(order.status || order.lifecycleStatus || order.deliveryStatus);
  if (['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(raw)) return ORDER_STATUS.CANCELLED;
  if (['delivered', 'success', 'completed', 'done'].includes(raw) || clean(order.deliveryStatus) === 'delivered') return ORDER_STATUS.DELIVERED;
  if (order.masterOrderId || order.masterOrderCode || ['merged', 'mastered', 'grouped'].includes(clean(order.mergeStatus))) return ORDER_STATUS.ASSIGNED;
  if (['assigned', 'assigned_delivery', 'waiting', 'posted'].includes(raw)) return raw === 'posted' ? ORDER_STATUS.PENDING : ORDER_STATUS.ASSIGNED;
  return ORDER_STATUS.PENDING;
}

function normalizeMergeStatus(order = {}) {
  if (order.masterOrderId || order.masterOrderCode || order.masterOrderNo) return MERGE_STATUS.MERGED;
  return ['merged', 'mastered', 'grouped'].includes(clean(order.mergeStatus)) ? MERGE_STATUS.MERGED : MERGE_STATUS.UNMERGED;
}

function normalizeDeliveryStatus(order = {}) {
  const raw = clean(order.deliveryStatus || order.status);
  if (['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(raw)) return DELIVERY_STATUS.CANCELLED;
  if (['delivered', 'success', 'completed', 'done'].includes(raw)) return DELIVERY_STATUS.DELIVERED;
  if (['failed', 'fail', 'not_delivered', 'undelivered'].includes(raw)) return DELIVERY_STATUS.FAILED;
  return DELIVERY_STATUS.PENDING;
}

function normalizeAccountingStatus(order = {}) {
  const raw = clean(order.accountingStatus || order.arStatus);
  if (order.accountingConfirmed || ['confirmed', 'locked', 'posted'].includes(raw)) return ACCOUNTING_STATUS.CONFIRMED;
  return ACCOUNTING_STATUS.PENDING;
}

function isInactiveOrder(order = {}) {
  return normalizeOrderStatus(order) === ORDER_STATUS.CANCELLED || Boolean(order.deletedAt || order.isDeleted || order.deleted);
}

function isOrderVisibleInHistory(order = {}, filter = {}) {
  if (!order || !Object.keys(order).length) return false;
  const includeCancelled = String(filter.includeCancelled || filter.excludeInactive || '0') === '1' || clean(filter.status) === 'cancelled';
  return includeCancelled || !isInactiveOrder(order);
}

function isOrderUnmerged(order = {}) {
  return normalizeMergeStatus(order) === MERGE_STATUS.UNMERGED && !isInactiveOrder(order);
}

function isOrderDeliverable(order = {}) {
  return normalizeMergeStatus(order) === MERGE_STATUS.MERGED && !isInactiveOrder(order) && normalizeDeliveryStatus(order) !== DELIVERY_STATUS.DELIVERED;
}

function lifecyclePatch(order = {}, defaults = {}) {
  const orderDate = dateUtil.toDateOnly(order.orderDate || order.date || order.createdAt || defaults.orderDate || defaults.date) || '';
  const deliveryDate = dateUtil.toDateOnly(order.deliveryDate || defaults.deliveryDate || orderDate) || orderDate;
  const merged = Boolean(order.masterOrderId || order.masterOrderCode || order.masterOrderNo);
  const mergeStatus = order.mergeStatus || (merged ? MERGE_STATUS.MERGED : MERGE_STATUS.UNMERGED);
  const status = normalizeOrderStatus({ ...order, mergeStatus });
  return {
    orderDate,
    date: dateUtil.toDateOnly(order.date || orderDate) || orderDate,
    deliveryDate,
    source: normalizeOrderSource(order.source || order.orderSource || defaults.source || 'manual'),
    status,
    lifecycleStatus: status,
    mergeStatus: normalizeMergeStatus({ ...order, mergeStatus }),
    deliveryStatus: normalizeDeliveryStatus(order),
    accountingStatus: normalizeAccountingStatus(order),
    accountingConfirmed: normalizeAccountingStatus(order) === ACCOUNTING_STATUS.CONFIRMED
  };
}

module.exports = {
  ORDER_STATUS,
  MERGE_STATUS,
  DELIVERY_STATUS,
  ACCOUNTING_STATUS,
  normalizeOrderSource,
  normalizeOrderStatus,
  normalizeMergeStatus,
  normalizeDeliveryStatus,
  normalizeAccountingStatus,
  isInactiveOrder,
  isOrderVisibleInHistory,
  isOrderUnmerged,
  isOrderDeliverable,
  lifecyclePatch
};
