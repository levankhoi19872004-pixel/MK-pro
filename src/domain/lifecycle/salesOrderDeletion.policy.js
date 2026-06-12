'use strict';

const INACTIVE_STATUSES = new Set([
  'void',
  'deleted',
  'removed',
  'cancelled',
  'canceled'
]);

function text(value) {
  return String(value || '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function isInactiveOrder(order = {}) {
  return INACTIVE_STATUSES.has(lower(order.status)) || Boolean(order.deletedAt || order.isDeleted || order.deleted);
}

function isMergedOrder(order = {}) {
  return Boolean(order.masterOrderId || order.masterOrderCode || order.masterOrderNo)
    || lower(order.mergeStatus) === 'merged';
}

function isDeliveredOrAccountingLocked(order = {}) {
  const status = lower(order.status);
  const deliveryStatus = lower(order.deliveryStatus);
  const accountingStatus = lower(order.accountingStatus || order.arStatus);

  return Boolean(order.accountingConfirmed)
    || ['confirmed', 'locked', 'posted'].includes(accountingStatus)
    || ['delivered', 'success', 'completed', 'done'].includes(deliveryStatus)
    || ['delivered', 'completed', 'done'].includes(status);
}

function isStockPosted(order = {}) {
  const stockStatus = lower(order.stockStatus || order.inventoryStatus);
  return Boolean(order.stockPosted) || ['posted', 'confirmed', 'locked'].includes(stockStatus);
}

function hasLockedReturn(related = {}) {
  return Boolean(related.activeReturnLocked || related.activeReturnHasValue);
}

function hasFinancialDependency(related = {}) {
  return Boolean(
    related.hasArLedger ||
    related.hasReceipt ||
    related.hasCashbook ||
    related.hasBankbook ||
    related.hasFundLedger
  );
}

function decideSalesOrderDeletion(order = {}, related = {}, command = {}) {
  if (!order) {
    return {
      allowed: false,
      status: 404,
      code: 'ORDER_NOT_FOUND',
      message: 'Không tìm thấy đơn bán'
    };
  }

  if (isInactiveOrder(order)) {
    return {
      allowed: true,
      mode: 'NOOP_ALREADY_DELETED',
      message: 'Đơn đã được xóa/hủy trước đó'
    };
  }

  if (!text(command.reason)) {
    return {
      allowed: false,
      status: 400,
      code: 'DELETE_REASON_REQUIRED',
      message: 'Cần nhập lý do xóa đơn'
    };
  }

  if (isMergedOrder(order)) {
    return {
      allowed: false,
      status: 409,
      code: 'ORDER_ALREADY_MERGED',
      message: 'Đơn đã nằm trong đơn tổng. Cần hủy/tách khỏi đơn tổng trước khi xóa đơn con.'
    };
  }

  if (hasLockedReturn(related)) {
    return {
      allowed: false,
      status: 409,
      code: 'RETURN_ORDER_LOCKED',
      message: 'Đơn đã có phiếu trả hàng có giá trị hoặc đã khóa, không được xóa trực tiếp.'
    };
  }

  const stockPosted = isStockPosted(order);
  const accountingLocked = isDeliveredOrAccountingLocked(order);
  const financialDependency = hasFinancialDependency(related);

  if (accountingLocked || financialDependency) {
    return {
      allowed: true,
      mode: 'SOFT_VOID_WITH_REVERSAL',
      reverseStock: stockPosted,
      reverseAr: Boolean(related.hasArLedger),
      cancelReturnDraft: Boolean(related.hasReturnDraft),
      hardDelete: false,
      message: 'Đơn đã phát sinh nghiệp vụ, hệ thống sẽ xóa mềm/void để giữ audit.'
    };
  }

  if (stockPosted) {
    return {
      allowed: true,
      mode: 'HARD_DELETE_WITH_TOMBSTONE_AND_STOCK_REVERSAL',
      reverseStock: true,
      reverseAr: false,
      cancelReturnDraft: Boolean(related.hasReturnDraft),
      hardDelete: true,
      archiveTombstone: true,
      message: 'Đơn chưa phát sinh kế toán nhưng đã trừ tồn, hệ thống sẽ đảo tồn rồi xóa khỏi danh sách.'
    };
  }

  return {
    allowed: true,
    mode: 'HARD_DELETE_DRAFT',
    reverseStock: false,
    reverseAr: false,
    cancelReturnDraft: Boolean(related.hasReturnDraft),
    hardDelete: true,
    archiveTombstone: true,
    message: 'Đơn nháp chưa phát sinh nghiệp vụ, được xóa hẳn khỏi danh sách.'
  };
}

module.exports = {
  decideSalesOrderDeletion,
  isInactiveOrder,
  isMergedOrder,
  isDeliveredOrAccountingLocked,
  isStockPosted
};
