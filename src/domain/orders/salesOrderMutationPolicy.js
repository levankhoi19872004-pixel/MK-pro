'use strict';

const ALLOWED_ROLES = new Set(['admin', 'manager', 'accountant', 'sales']);
const INACTIVE_STATUSES = new Set(['cancelled', 'canceled', 'deleted', 'removed', 'void', 'voided']);
const LOCKED_STATUSES = new Set(['delivered', 'completed', 'done', 'closed', 'accounting_confirmed']);
const ACCOUNTING_LOCKS = new Set(['confirmed', 'locked', 'posted', 'accounting_confirmed']);
const COMMANDS = new Set(['update', 'cancel', 'delete']);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function normalizeRole(actor = {}) {
  return lower(actor.role || actor.userRole || actor.type);
}

function actorSalesStaffCode(actor = {}) {
  return text(
    actor.salesStaffCode ||
    actor.salesmanCode ||
    actor.nvbhCode ||
    actor.staffCode ||
    actor.code
  ).toUpperCase();
}

function orderSalesStaffCode(order = {}) {
  return text(
    order.salesStaffCode ||
    order.salesmanCode ||
    order.nvbhCode
  ).toUpperCase();
}

function isMerged(order = {}) {
  return Boolean(order.masterOrderId || order.masterOrderCode || order.masterOrderNo)
    || lower(order.mergeStatus) === 'merged';
}

function isInactive(order = {}) {
  return INACTIVE_STATUSES.has(lower(order.status || order.lifecycleStatus || order.deliveryStatus))
    || order.deleted === true
    || order.isDeleted === true
    || Boolean(order.deletedAt);
}

function isAccountingOrDeliveryLocked(order = {}) {
  const statuses = [
    order.status,
    order.lifecycleStatus,
    order.deliveryStatus,
    order.closeoutStatus,
    order.deliveryCloseoutStatus,
    order.deliveryCloseout && order.deliveryCloseout.status
  ].map(lower).filter(Boolean);
  const accountingStatuses = [order.accountingStatus, order.arStatus].map(lower).filter(Boolean);
  return order.accountingConfirmed === true
    || statuses.some((status) => LOCKED_STATUSES.has(status))
    || accountingStatuses.some((status) => ACCOUNTING_LOCKS.has(status));
}

function normalizeExpectedVersion(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(String(value).replace(/^W\//i, '').replace(/^"|"$/g, ''));
  return Number.isFinite(normalized) ? normalized : null;
}

function decision(allowed, status, code, message, details = {}) {
  return { allowed, status, code, message, ...details };
}

function canMutateSalesOrder({ actor, order, command, expectedVersion } = {}) {
  const normalizedCommand = lower(command);
  if (!actor || typeof actor !== 'object' || !Object.keys(actor).length) {
    return decision(false, 401, 'AUTH_REQUIRED', 'Bạn chưa đăng nhập');
  }

  const role = normalizeRole(actor);
  if (!role) return decision(false, 401, 'AUTH_REQUIRED', 'Bạn chưa đăng nhập');
  if (!ALLOWED_ROLES.has(role)) {
    return decision(false, 403, 'ORDER_MUTATION_ROLE_FORBIDDEN', 'Bạn không có quyền thay đổi đơn bán');
  }
  if (!order) return decision(false, 404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn bán');
  if (!COMMANDS.has(normalizedCommand)) {
    return decision(false, 422, 'ORDER_MUTATION_COMMAND_INVALID', 'Lệnh thay đổi đơn bán không hợp lệ');
  }

  const actorCode = actorSalesStaffCode(actor);
  const ownerCode = orderSalesStaffCode(order);
  if (role === 'sales') {
    if (!actorCode || !ownerCode || actorCode !== ownerCode) {
      return decision(false, 403, 'ORDER_OWNERSHIP_FORBIDDEN', 'Đơn bán không thuộc phạm vi nhân viên bán hàng', { actorCode, ownerCode });
    }
  }

  const expected = normalizeExpectedVersion(expectedVersion);
  const actualVersion = normalizeExpectedVersion(order.version);
  if (expected !== null && actualVersion !== null && expected !== actualVersion) {
    return decision(false, 409, 'ORDER_VERSION_CONFLICT', 'Đơn đã thay đổi. Vui lòng tải lại trước khi thao tác.', { expectedVersion: expected, actualVersion });
  }

  if (isMerged(order)) {
    return decision(false, 409, 'ORDER_ALREADY_MERGED', 'Đơn đã nằm trong đơn tổng. Cần tách khỏi đơn tổng trước khi thay đổi.');
  }

  if (isAccountingOrDeliveryLocked(order)) {
    return decision(false, 409, 'ORDER_ACCOUNTING_LOCKED', 'Đơn đã giao/chốt sổ/xác nhận kế toán. Hãy dùng luồng điều chỉnh nghiệp vụ.');
  }

  // Delete giữ tính idempotent của deletion service cho đơn đã hủy/xóa, nhưng
  // update/cancel không được chạy lại trên trạng thái inactive.
  if (isInactive(order) && normalizedCommand !== 'delete') {
    return decision(false, 409, 'ORDER_INACTIVE', 'Đơn đã hủy hoặc không còn hiệu lực.');
  }

  return decision(true, 200, 'ORDER_MUTATION_ALLOWED', 'Được phép thay đổi đơn bán', {
    role,
    actorCode,
    ownerCode,
    command: normalizedCommand
  });
}

function assertCanMutateSalesOrder(input = {}) {
  const result = canMutateSalesOrder(input);
  if (result.allowed) return result;
  const error = new Error(result.message);
  error.status = result.status;
  error.statusCode = result.status;
  error.code = result.code;
  error.details = result;
  throw error;
}

module.exports = {
  canMutateSalesOrder,
  assertCanMutateSalesOrder,
  actorSalesStaffCode,
  orderSalesStaffCode,
  normalizeExpectedVersion,
  isMerged,
  isInactive,
  isAccountingOrDeliveryLocked
};
