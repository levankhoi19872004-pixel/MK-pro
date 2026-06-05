'use strict';

const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  DELIVERED: 'delivered',
  ACCOUNTING_CONFIRMED: 'accounting_confirmed',
  CLOSED: 'closed',
  CANCELLED: 'cancelled'
});

const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

const AR_TYPES = Object.freeze({
  SALE: 'AR-SALE',
  RECEIPT: 'AR-RECEIPT',
  BONUS: 'AR-BONUS',
  DISCOUNT: 'AR-DISCOUNT',
  ALLOWANCE: 'AR-ALLOWANCE',
  OPENING: 'AR-OPENING'
});

const STAFF_ROLES = Object.freeze({
  SALES: ['sales', 'sale', 'NVBH', 'nvbh', 'salesStaff', 'sales_staff'],
  DELIVERY: ['delivery', 'shipper', 'NVGH', 'nvgh', 'deliveryStaff', 'delivery_staff']
});

const WAREHOUSE_TYPES = Object.freeze({
  DEFAULT: 'MAIN',
  HC: 'KHO_HC',
  PC: 'KHO_PC'
});

const IMPORT_STATUS = Object.freeze({
  PREVIEW: 'preview',
  VALID: 'valid',
  INVALID: 'invalid',
  COMMITTED: 'committed',
  CANCELLED: 'cancelled'
});

module.exports = {
  ORDER_STATUS,
  DELIVERY_STATUS,
  AR_TYPES,
  STAFF_ROLES,
  WAREHOUSE_TYPES,
  IMPORT_STATUS
};
