'use strict';

const DeliveryCloseoutVersion = require('../../models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../../models/OrderPaymentAllocation');
const {
  ACCOUNTING_LOCKED_STATUSES,
  CLOSEOUT_LOCKED_STATUSES,
  PAYMENT_ALLOCATION_LOCKED_STATUSES,
  WAREHOUSE_LOCKED_STATUSES,
  STOCK_LOCKED_STATUSES,
  RETURN_ORDER_LOCK_PROJECTION_FIELDS,
  RETURN_ORDER_LOCK_PROJECTION
} = require('./returnLockStatusContract');

const ACCOUNTING_LOCKED_STATUS_SET = new Set(ACCOUNTING_LOCKED_STATUSES);
const CLOSEOUT_LOCKED_STATUS_SET = new Set(CLOSEOUT_LOCKED_STATUSES);
const PAYMENT_ALLOCATION_LOCKED_STATUS_SET = new Set(PAYMENT_ALLOCATION_LOCKED_STATUSES);
const WAREHOUSE_LOCKED_STATUS_SET = new Set(WAREHOUSE_LOCKED_STATUSES);
const STOCK_LOCKED_STATUS_SET = new Set(STOCK_LOCKED_STATUSES);
const ITEM_MUTATION_OPERATIONS = new Set([
  'create_return',
  'update_return',
  'update_return_items',
  'delivery_save_return',
  'mobile_delivery_save_return',
  'legacy_delivery_save_return',
  'closeout_return_adjustment',
  'cancel_return',
  'clear_return',
  'restore_return'
]);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function getId(value) {
  if (!value) return '';
  return text(value._id || value.id || value.code || value);
}

function closeoutOf(order = {}) {
  return order && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
}

function orderIds(order = {}) {
  return unique([
    order.id,
    order._id,
    order.orderId,
    order.salesOrderId,
    order.sourceOrderId
  ]);
}

function orderCodes(order = {}) {
  return unique([
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.sourceOrderCode
  ]);
}

function resolveDeliveryAccountingLockState({ order = {}, latestCloseoutVersion = null, allocation = null } = {}) {
  const closeout = closeoutOf(order);
  const accountingStatus = lower(order.accountingStatus || (order.status && order.status.accountingStatus));
  const inlineCloseoutStatus = lower(closeout.status || order.deliveryCloseoutStatus || order.closeoutStatus);
  const latestCloseoutStatus = lower(latestCloseoutVersion && latestCloseoutVersion.status);
  const allocationStatus = lower(allocation && allocation.status);
  const accountingConfirmed = Boolean(order.accountingConfirmed === true || order.accountingLocked === true);

  let locked = false;
  let reason = '';
  if (accountingConfirmed) {
    locked = true;
    reason = 'accounting_confirmed';
  } else if (ACCOUNTING_LOCKED_STATUS_SET.has(accountingStatus)) {
    locked = true;
    reason = 'accounting_status_locked';
  } else if (CLOSEOUT_LOCKED_STATUS_SET.has(inlineCloseoutStatus)) {
    locked = true;
    reason = 'delivery_closeout_locked';
  } else if (CLOSEOUT_LOCKED_STATUS_SET.has(latestCloseoutStatus)) {
    locked = true;
    reason = 'latest_closeout_version_locked';
  } else if (PAYMENT_ALLOCATION_LOCKED_STATUS_SET.has(allocationStatus)) {
    locked = true;
    reason = 'payment_allocation_locked';
  }

  const closeoutStatus = latestCloseoutStatus || inlineCloseoutStatus || '';
  return {
    locked,
    reason,
    accountingConfirmed,
    accountingStatus,
    closeoutStatus,
    closeoutVersionId: getId(latestCloseoutVersion) || text(closeout.versionId || closeout.closeoutVersionId),
    lockedAt: text(order.accountingConfirmedAt || closeout.confirmedAt || closeout.closedAt || (latestCloseoutVersion && (latestCloseoutVersion.updatedAt || latestCloseoutVersion.createdAt)) || (allocation && (allocation.postedAt || allocation.updatedAt))),
    lockedBy: text(order.accountingConfirmedBy || closeout.confirmedBy || closeout.closedBy || (latestCloseoutVersion && (latestCloseoutVersion.updatedBy || latestCloseoutVersion.createdBy)) || (allocation && (allocation.postedBy || allocation.updatedBy)))
  };
}

function resolveReturnWarehouseLockState(returnOrder = {}) {
  const warehouseCheckStatus = lower(returnOrder.warehouseCheckStatus || returnOrder.warehouseStatus || returnOrder.warehouseReceiveStatus);
  const stockInStatus = lower(returnOrder.stockInStatus || returnOrder.inventoryStatus);
  const inventoryPosted = Boolean(returnOrder.inventoryPosted || returnOrder.inventoryPostingId || returnOrder.inventoryTransactionId);
  const stockPosted = Boolean(returnOrder.stockPosted || returnOrder.stockTransactionId || (Array.isArray(returnOrder.stockTransactionIds) && returnOrder.stockTransactionIds.length));
  const warehouseConfirmed = Boolean(returnOrder.warehouseConfirmed || returnOrder.warehouseChecked || returnOrder.warehouseCheckedAt);
  const locked = Boolean(
    WAREHOUSE_LOCKED_STATUS_SET.has(warehouseCheckStatus)
    || warehouseConfirmed
    || STOCK_LOCKED_STATUS_SET.has(stockInStatus)
    || inventoryPosted
    || stockPosted
  );
  return {
    locked,
    reason: locked ? 'warehouse_or_stock_locked' : '',
    warehouseCheckStatus,
    stockInStatus,
    inventoryPosted,
    stockPosted,
    warehouseConfirmed
  };
}

function returnMutationDiagnostics({
  code,
  order = {},
  returnOrder = {},
  operation = '',
  source = '',
  accountingLock = {},
  warehouseLock = {}
} = {}) {
  return {
    code,
    orderId: text(order.id || order._id || order.orderId || order.salesOrderId),
    orderCode: text(order.code || order.orderCode || order.salesOrderCode),
    returnOrderId: text(returnOrder.id || returnOrder._id || returnOrder.returnOrderId),
    returnOrderCode: text(returnOrder.code || returnOrder.returnOrderCode),
    operation: text(operation),
    source: text(source),
    accountingConfirmed: Boolean(accountingLock.accountingConfirmed),
    accountingStatus: text(accountingLock.accountingStatus),
    closeoutStatus: text(accountingLock.closeoutStatus),
    warehouseCheckStatus: text(warehouseLock.warehouseCheckStatus),
    stockInStatus: text(warehouseLock.stockInStatus),
    inventoryPosted: Boolean(warehouseLock.inventoryPosted),
    stockPosted: Boolean(warehouseLock.stockPosted),
    reason: text(accountingLock.reason || warehouseLock.reason)
  };
}

function createLockedError({ code, message, diagnostics }) {
  const err = new Error(message);
  err.status = 409;
  err.code = code;
  err.data = diagnostics;
  return err;
}

function assertReturnMutationAllowed({
  order = {},
  returnOrder = null,
  latestCloseoutVersion = null,
  allocation = null,
  source = '',
  operation = '',
  accountingLock = null,
  warehouseLock = null
} = {}) {
  const resolvedAccountingLock = accountingLock || resolveDeliveryAccountingLockState({ order, latestCloseoutVersion, allocation });
  const resolvedWarehouseLock = warehouseLock || resolveReturnWarehouseLockState(returnOrder || {});

  if (resolvedAccountingLock.locked) {
    const code = 'DELIVERY_RETURN_LOCKED_AFTER_ACCOUNTING_CLOSEOUT';
    throw createLockedError({
      code,
      message: 'Đơn đã được kế toán chốt. Không được tạo hoặc thay đổi hàng trả.',
      diagnostics: returnMutationDiagnostics({ code, order, returnOrder: returnOrder || {}, operation, source, accountingLock: resolvedAccountingLock, warehouseLock: resolvedWarehouseLock })
    });
  }

  if (returnOrder && ITEM_MUTATION_OPERATIONS.has(text(operation)) && resolvedWarehouseLock.locked) {
    const code = 'RETURN_ORDER_WAREHOUSE_VERIFICATION_LOCKED';
    throw createLockedError({
      code,
      message: 'Phiếu trả đã được thủ kho kiểm hoặc đã sẵn sàng nhập kho. Không được thay đổi trực tiếp.',
      diagnostics: returnMutationDiagnostics({ code, order, returnOrder, operation, source, accountingLock: resolvedAccountingLock, warehouseLock: resolvedWarehouseLock })
    });
  }

  return { accountingLock: resolvedAccountingLock, warehouseLock: resolvedWarehouseLock };
}

function buildOrderLookupOr(order = {}) {
  const ids = orderIds(order);
  const codes = orderCodes(order);
  const closeout = closeoutOf(order);
  const closeoutIds = unique([closeout.id, closeout.closeoutId, closeout.originalCloseoutId]);
  const closeoutCodes = unique([closeout.code, closeout.closeoutCode, closeout.originalCloseoutCode]);
  const or = [];
  if (ids.length) {
    or.push({ salesOrderId: { $in: ids } }, { orderId: { $in: ids } });
  }
  if (codes.length) {
    or.push({ salesOrderCode: { $in: codes } }, { orderCode: { $in: codes } });
  }
  if (closeoutIds.length) {
    or.push({ originalCloseoutId: { $in: closeoutIds } }, { closeoutId: { $in: closeoutIds } });
  }
  if (closeoutCodes.length) {
    or.push({ originalCloseoutCode: { $in: closeoutCodes } }, { closeoutCode: { $in: closeoutCodes } });
  }
  return or;
}

async function loadLatestCloseoutVersionForOrder(order = {}, options = {}) {
  const or = buildOrderLookupOr(order);
  if (!or.length) return null;
  let query = DeliveryCloseoutVersion.findOne({ $or: or }).sort({ closeoutVersion: -1, createdAt: -1, updatedAt: -1 }).lean();
  if (options.session) query = query.session(options.session);
  return query;
}

async function loadLatestAllocationForOrder(order = {}, options = {}) {
  const ids = orderIds(order);
  const codes = orderCodes(order);
  const or = [];
  if (ids.length) or.push({ orderId: { $in: ids } });
  if (codes.length) or.push({ orderCode: { $in: codes } });
  if (!or.length) return null;
  let query = OrderPaymentAllocation.findOne({ $or: or }).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1 }).lean();
  if (options.session) query = query.session(options.session);
  return query;
}

async function loadReturnMutationContext({ order = {}, returnOrder = null, options = {} } = {}) {
  const [latestCloseoutVersion, allocation] = await Promise.all([
    loadLatestCloseoutVersionForOrder(order, options),
    loadLatestAllocationForOrder(order, options)
  ]);
  return {
    latestCloseoutVersion,
    allocation,
    accountingLock: resolveDeliveryAccountingLockState({ order, latestCloseoutVersion, allocation }),
    warehouseLock: resolveReturnWarehouseLockState(returnOrder || {})
  };
}

function returnMutationErrorResult(err) {
  return {
    error: err && err.message ? err.message : 'Không được thay đổi phiếu trả.',
    message: err && err.message ? err.message : 'Không được thay đổi phiếu trả.',
    code: err && err.code ? err.code : 'RETURN_MUTATION_REJECTED',
    status: Number(err && err.status) || 409,
    data: err && err.data ? err.data : undefined
  };
}

module.exports = {
  ACCOUNTING_LOCKED_STATUSES,
  CLOSEOUT_LOCKED_STATUSES,
  PAYMENT_ALLOCATION_LOCKED_STATUSES,
  WAREHOUSE_LOCKED_STATUSES,
  STOCK_LOCKED_STATUSES,
  RETURN_ORDER_LOCK_PROJECTION_FIELDS,
  RETURN_ORDER_LOCK_PROJECTION,
  resolveDeliveryAccountingLockState,
  resolveReturnWarehouseLockState,
  assertReturnMutationAllowed,
  loadLatestCloseoutVersionForOrder,
  loadLatestAllocationForOrder,
  loadReturnMutationContext,
  returnMutationDiagnostics,
  returnMutationErrorResult
};
