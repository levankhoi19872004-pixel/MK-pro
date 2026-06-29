'use strict';

const dateUtil = require('./date.util');
const { toNumber } = require('./common.util');

const VALID_SALES_ORDER_ID_RE = /^SO\d+$/i;

const LEGACY_MASTER_CHILD_REF_FIELDS = [
  'children',
  'childOrders',
  'orderIds',
  'salesOrderIds',
  'salesOrders',
  'orderCodes',
  'salesOrderCodes'
];

const DETACHED_SALES_ORDER_UNSET_FIELDS = [
  'masterOrderId',
  'masterOrderCode',
  'masterOrderNo',
  'masterId',
  'masterCode',
  'deliveryMasterId',
  'deliveryMasterCode',
  'deliveryStaffId',
  'deliveryStaffCode',
  'deliveryStaffName',
  'deliveryCode',
  'deliveryName',
  'shipperCode',
  'shipperName',
  'nvghCode',
  'nvghName',
  'staffDeliveryCode',
  'staffDeliveryName',
  'driverId',
  'driverCode',
  'driverName',
  'deliveryDate',
  'routeName',
  'deliveryRoute'
];

function normalizeSalesOrderIds(ids = []) {
  return Array.from(new Set((ids || [])
    .map((value) => String(value || '').trim())
    .filter((value) => VALID_SALES_ORDER_ID_RE.test(value))));
}

function buildDetachedSalesOrderMongoUpdate(now = dateUtil.nowIso()) {
  return {
    $set: {
      mergeStatus: 'unmerged',
      status: 'pending',
      lifecycleStatus: 'pending',
      deliveryStatus: 'pending',
      arStatus: 'pending',
      accountingStatus: 'pending',
      accountingConfirmed: false,
      updatedAt: now
    },
    $unset: Object.fromEntries(DETACHED_SALES_ORDER_UNSET_FIELDS.map((field) => [field, '']))
  };
}

function hasDeliveryOperationalData(order = {}) {
  const deliveryStatus = String(order.deliveryStatus || order.status || '').trim().toLowerCase();
  const accountingStatus = String(order.accountingStatus || '').trim().toLowerCase();
  if (['delivered', 'completed', 'done', 'paid'].includes(deliveryStatus)) return true;
  if (order.accountingConfirmed === true || ['confirmed', 'posted', 'locked'].includes(accountingStatus)) return true;

  const moneyTouched = [
    order.cashCollected,
    order.cashAmount,
    order.bankCollected,
    order.bankAmount,
    order.transferAmount,
    order.rewardAmount,
    order.bonusAmount,
    order.returnAmount,
    order.returnedAmount
  ].some((value) => Math.abs(toNumber(value)) > 0);
  if (moneyTouched) return true;

  return Boolean(order.deliveryPayment)
    || (Array.isArray(order.paymentAllocations) && order.paymentAllocations.length > 0)
    || (Array.isArray(order.debtCollectionAllocations) && order.debtCollectionAllocations.length > 0)
    || (Array.isArray(order.returnItems) && order.returnItems.some((item) => toNumber(item.returnQty ?? item.qtyReturn ?? item.quantity) > 0));
}

function normalizeChildOrderRefs(children = []) {
  return Array.from(new Set((children || [])
    .map((order) => {
      if (!order || typeof order !== 'object') return String(order || '').trim();
      return String(
        order.id ||
        order.code ||
        order.documentCode ||
        order.orderCode ||
        order.salesOrderId ||
        order.salesOrderCode ||
        ''
      ).trim();
    })
    .filter(Boolean)));
}

function canonicalMasterChildReferencePatch(children = []) {
  const childRefs = normalizeChildOrderRefs(children);
  const patch = {
    // childOrderIds là nguồn chính cho cả đơn SO nội bộ và mã BO/DMS.
    // Không lọc chỉ SO*, nếu không các đơn BO sẽ tạo được master nhưng mất liên kết child.
    childOrderIds: childRefs,
    children: []
  };
  for (const field of LEGACY_MASTER_CHILD_REF_FIELDS) {
    if (field !== 'childOrderIds') patch[field] = [];
  }
  return patch;
}

module.exports = {
  LEGACY_MASTER_CHILD_REF_FIELDS,
  DETACHED_SALES_ORDER_UNSET_FIELDS,
  buildDetachedSalesOrderMongoUpdate,
  hasDeliveryOperationalData,
  normalizeChildOrderRefs,
  canonicalMasterChildReferencePatch
};
