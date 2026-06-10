'use strict';

function assertCanCancel(order = {}) {
  const status = String(order.status || '').toLowerCase();
  if (['cancelled', 'canceled', 'void'].includes(status)) throw new Error('Đơn đã hủy trước đó');
  if (order.accountingLocked === true) throw new Error('Đơn đã khóa kế toán, không được hủy trực tiếp');
  return true;
}

function assertCanAssignDelivery(order = {}, deliveryStaff = {}) {
  if (!deliveryStaff.code && !deliveryStaff.staffCode && !deliveryStaff.id) throw new Error('Thiếu NVGH để gán đơn');
  const status = String(order.status || '').toLowerCase();
  if (['delivered', 'cancelled', 'canceled'].includes(status)) throw new Error('Không được đổi NVGH cho đơn đã giao/hủy');
  return true;
}

function assertStockNotExceeded(items = [], stockMap = new Map()) {
  const violations = [];
  for (const item of items) {
    const code = String(item.productCode || item.code || '').trim();
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const available = Number(stockMap.get(code) ?? 0);
    if (code && qty > available) violations.push({ productCode: code, requestedQty: qty, availableQty: available });
  }
  if (violations.length) {
    const err = new Error('Đơn vượt tồn kho');
    err.violations = violations;
    throw err;
  }
  return true;
}

module.exports = { assertCanCancel, assertCanAssignDelivery, assertStockNotExceeded };
