'use strict';

const ACCOUNTING_LOCKED_STATUSES = Object.freeze([
  'confirmed',
  'locked',
  'posted',
  'accounting_confirmed',
  'closed',
  'corrected_confirmed'
]);

const CLOSEOUT_LOCKED_STATUSES = Object.freeze([
  'confirmed',
  'locked',
  'posted',
  'accounting_confirmed',
  'closed',
  'corrected_confirmed'
]);

const PAYMENT_ALLOCATION_LOCKED_STATUSES = Object.freeze([
  'confirmed',
  'locked',
  'posted',
  'accounting_confirmed',
  'closed',
  'corrected_confirmed'
]);

const WAREHOUSE_LOCKED_STATUSES = Object.freeze([
  'matched',
  'confirmed',
  'discrepancy'
]);

const STOCK_LOCKED_STATUSES = Object.freeze([
  'ready',
  'ready_to_stock_in',
  'posted',
  'stock_posted'
]);

const RETURN_ORDER_LOCK_PROJECTION_FIELDS = Object.freeze([
  '_id',
  'id',
  'code',
  'salesOrderId',
  'salesOrderCode',
  'orderId',
  'orderCode',
  'status',
  'returnStatus',
  'returnState',
  'warehouseStatus',
  'warehouseReceiveStatus',
  'warehouseCheckStatus',
  'warehouseConfirmed',
  'warehouseChecked',
  'warehouseCheckedAt',
  'stockInStatus',
  'inventoryStatus',
  'inventoryPosted',
  'inventoryPostingId',
  'inventoryTransactionId',
  'stockPosted',
  'stockTransactionId',
  'stockTransactionIds',
  'accountingStatus',
  'accountingConfirmed',
  'active',
  'isCurrentVersion',
  'version',
  '__v',
  'updatedAt'
]);

module.exports = {
  ACCOUNTING_LOCKED_STATUSES,
  CLOSEOUT_LOCKED_STATUSES,
  PAYMENT_ALLOCATION_LOCKED_STATUSES,
  WAREHOUSE_LOCKED_STATUSES,
  STOCK_LOCKED_STATUSES,
  RETURN_ORDER_LOCK_PROJECTION_FIELDS,
  RETURN_ORDER_LOCK_PROJECTION: RETURN_ORDER_LOCK_PROJECTION_FIELDS.join(' ')
};
