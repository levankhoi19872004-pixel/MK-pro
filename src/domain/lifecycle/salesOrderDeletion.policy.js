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
  return INACTIVE_STATUSES.has(lower(order.status))
    || Boolean(order.deletedAt || order.deleted || order.isDeleted);
}

function isMergedOrder(order = {}) {
  return Boolean(order.masterOrderId || order.masterOrderCode || order.masterOrderNo)
    || lower(order.mergeStatus) === 'merged';
}

function isStockPosted(order = {}) {
  const stockStatus = lower(order.stockStatus || order.inventoryStatus);
  return Boolean(order.stockPosted)
    || ['posted', 'confirmed', 'locked'].includes(stockStatus);
}

function isAccountingLocked(order = {}) {
  const status = lower(order.status);
  const deliveryStatus = lower(order.deliveryStatus);
  const accountingStatus = lower(order.accountingStatus || order.arStatus);

  return Boolean(order.accountingConfirmed)
    || ['confirmed', 'locked', 'posted'].includes(accountingStatus)
    || ['delivered', 'success', 'completed', 'done'].includes(deliveryStatus)
    || ['delivered', 'completed', 'done'].includes(status);
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

function hasReturnDependency(related = {}) {
  return Boolean(related.activeReturnLocked || related.activeReturnHasValue);
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
      mode: 'ALREADY_DELETED',
      hardDelete: false,
      message: 'Đơn đã được xóa/hủy trước đó'
    };
  }

  if (isMergedOrder(order)) {
    return {
      allowed: false,
      status: 409,
      code: 'ORDER_ALREADY_MERGED',
      message: 'Đơn đã nằm trong đơn tổng. Cần hủy/tách khỏi đơn tổng trước khi xóa.'
    };
  }

  if (hasReturnDependency(related)) {
    return {
      allowed: false,
      status: 409,
      code: 'RETURN_DEPENDENCY_EXISTS',
      message: 'Đơn đã có trả hàng. Cần xử lý phiếu trả hàng trước khi xóa đơn.'
    };
  }

  if (isAccountingLocked(order) || hasFinancialDependency(related)) {
    return {
      allowed: false,
      status: 409,
      code: 'FINANCIAL_DEPENDENCY_EXISTS',
      message: 'Đơn đã phát sinh công nợ/thu tiền/kế toán. Không được xóa thường.'
    };
  }

  if (isStockPosted(order)) {
    return {
      allowed: true,
      mode: 'REVERSE_STOCK_THEN_HARD_DELETE',
      reverseStock: true,
      hardDelete: true,
      message: 'Đơn đã trừ tồn. Hệ thống sẽ đảo tồn rồi xóa đơn.'
    };
  }

  return {
    allowed: true,
    mode: 'HARD_DELETE',
    reverseStock: false,
    hardDelete: true,
    message: 'Đã xóa đơn.'
  };
}

module.exports = {
  decideSalesOrderDeletion,
  isInactiveOrder,
  isMergedOrder,
  isStockPosted,
  isAccountingLocked
};
