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

function canonicalMasterChildReferencePatch(children = []) {
  const patch = {
    childOrderIds: normalizeSalesOrderIds((children || []).map((order) => order?.id || order)),
    children: []
  };
  for (const field of LEGACY_MASTER_CHILD_REF_FIELDS) patch[field] = [];
  return patch;
}

module.exports = {
  LEGACY_MASTER_CHILD_REF_FIELDS,
  DETACHED_SALES_ORDER_UNSET_FIELDS,
  buildDetachedSalesOrderMongoUpdate,
  hasDeliveryOperationalData,
  canonicalMasterChildReferencePatch
};
