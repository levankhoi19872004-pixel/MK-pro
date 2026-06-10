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

const STOCK_WAREHOUSE_CODE = 'MAIN';
const STOCK_WAREHOUSE_NAME = 'Kho chính';
const PRINT_GROUP_HC = 'KHO_HC';
const PRINT_GROUP_PC = 'KHO_PC';

// Quy tắc nghiệp vụ: tồn kho chỉ có 1 kho chính.
// KHO_HC/KHO_PC chỉ là nhóm in/gộp đơn, không phải kho tồn.
const WAREHOUSE_TYPES = Object.freeze({
  DEFAULT: STOCK_WAREHOUSE_CODE,
  HC: PRINT_GROUP_HC,
  PC: PRINT_GROUP_PC
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
  STOCK_WAREHOUSE_CODE,
  STOCK_WAREHOUSE_NAME,
  PRINT_GROUP_HC,
  PRINT_GROUP_PC,
  WAREHOUSE_TYPES,
  IMPORT_STATUS
};
