'use strict';

const dateUtil = require('../../utils/date.util');
const orderRepository = require('../../repositories/orderRepository');
const auditService = require('../auditService');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { compactDeliveryOrderKeys } = require('../master-order/masterOrderIdentity.util');
const { findReturnOrdersForDeliveryChildren } = require('../master-order/masterOrderReturn.impl');
const DeliveryCloseoutService = require('./DeliveryCloseoutService');
const ArDebtOpenPostingService = require('./ArDebtOpenPostingService');

const CONFIRM_GUARD_TTL_MS = Math.max(1000, Number(process.env.CLOSEOUT_CONFIRM_GUARD_TTL_MS || 8000));
const inFlight = new Map();

function clean(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))];
}

function normalizeOrderIds(body = {}) {
  return unique(Array.isArray(body.orderIds) ? body.orderIds : [body.orderId, body.id, body.code]);
}

function isCompletedDelivery(order = {}) {
  return ['delivered', 'success', 'completed', 'done'].includes(clean(order.deliveryStatus || order.status).toLowerCase());
}

function guardKey(date, orderIds = [], actor = '') {
  return JSON.stringify({ date, actor: clean(actor).toLowerCase(), orderIds: unique(orderIds).sort() });
}

function cleanupGuards(now = Date.now()) {
  for (const [key, entry] of inFlight.entries()) {
    if (!entry || entry.expiresAt <= now) inFlight.delete(key);
  }
}

function groupReturnOrdersBySalesOrder(returnOrders = [], orders = []) {
  const result = new Map();
  for (const order of orders) {
    for (const key of compactDeliveryOrderKeys(order)) result.set(key, []);
  }
  for (const row of Array.isArray(returnOrders) ? returnOrders : []) {
    const rowKeys = unique([
      row.orderId,
      row.salesOrderId,
      row.sourceOrderId,
      row.deliveryOrderId,
      row.orderCode,
      row.salesOrderCode,
      row.sourceOrderCode,
      row.deliveryOrderCode
    ]);
    for (const key of rowKeys) {
      if (!result.has(key)) continue;
      result.get(key).push(row);
    }
  }
  return result;
}

function returnOrdersForOrder(order = {}, returnByKey = new Map()) {
  const used = new Set();
  const rows = [];
  for (const key of compactDeliveryOrderKeys(order)) {
    for (const row of returnByKey.get(key) || []) {
      const rowKey = clean(row.id || row.code || row._id || JSON.stringify(row));
      if (used.has(rowKey)) continue;
      used.add(rowKey);
      rows.push(row);
    }
  }
  return rows;
}

function stripOperationalDetails(closeout = {}) {
  const copy = { ...closeout };
  delete copy.activeReturnOrders;
  delete copy.paymentRows;
  return copy;
}

function buildConfirmedOrderPatch(order = {}, closeout = {}, actor = 'accountant') {
  const finalDebt = DeliveryCloseoutService.positiveMoney(closeout.finalDebtAmount);
  return {
    ...order,
    deliveryCloseout: stripOperationalDetails(closeout),
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingLocked: true,
    editLocked: true,
    deliveryLocked: true,
    accountingConfirmedAt: order.accountingConfirmedAt || closeout.confirmedAt || dateUtil.nowIso(),
    accountingConfirmedBy: order.accountingConfirmedBy || actor,
    debtAmount: finalDebt,
    debt: finalDebt,
    arBalance: finalDebt,
    arStatus: finalDebt > 0 ? 'ar_debt_opened' : 'paid',
    lifecycleStatus: finalDebt > 0 ? 'ar_debt_opened' : 'paid',
    updatedAt: dateUtil.nowIso()
  };
}

async function loadOrders(selectedOrderIds = []) {
  const rows = await orderRepository.findManyByIdentity(selectedOrderIds, {
    limit: Math.max(1, selectedOrderIds.length),
    projection: [
      'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
      'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt',
      'customerId', 'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address',
      'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
      'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
      'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed', 'accountingLocked',
      'cashClosed', 'cashSubmitted', 'dayLocked', 'periodLocked', 'settlementClosed', 'editLocked', 'deliveryLocked',
      'totalAmount', 'subtotal', 'discountAmount', 'finalAmount', 'payableAmount', 'debtBeforeCollection', 'debtAmount', 'debt', 'arBalance',
      'paidAmount', 'cashCollected', 'cashAmount', 'bankCollected', 'bankAmount', 'transferAmount',
      'returnAmount', 'returnedAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders',
      'paymentAllocations', 'deliveryPayment', 'deliveryPayments', 'payments', 'items', 'lines', 'products',
      'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode', 'masterId', 'masterCode',
      'deliveryCloseout', 'version', 'note', 'deliveryNote'
    ].join(' ')
  });
  return rows || [];
}

function orderIdentityValues(order = {}) {
  return unique([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.documentCode,
    order.invoiceCode,
    order.salesOrderId,
    order.salesOrderCode
  ]);
}

function orderMatchesInputId(order = {}, inputId = '') {
  const key = clean(inputId);
  return Boolean(key) && orderIdentityValues(order).includes(key);
}

function orderDeliveryDate(order = {}) {
  return dateUtil.toDateOnly(order.deliveryDate || order.date || order.orderDate || order.createdAt || '');
}

function orderDeliveryStaffCode(order = {}) {
  return clean(order.deliveryStaffCode || order.deliveryCode || order.nvghCode);
}

function orderSalesStaffCode(order = {}) {
  return clean(order.salesStaffCode || order.salesmanCode || order.nvbhCode);
}

function validateSelectedOrderScope(orders = [], body = {}, selectedOrderIds = []) {
  if (!Array.isArray(selectedOrderIds) || !selectedOrderIds.length) {
    return { error: 'Vui lòng chọn ít nhất một đơn để chốt sổ.', status: 400, code: 'ORDER_SELECTION_REQUIRED' };
  }
  const missing = selectedOrderIds.filter((id) => !orders.some((order) => orderMatchesInputId(order, id)));
  if (missing.length) {
    return { error: `Không tìm thấy hoặc không được phép chốt ${missing.length} đơn đã chọn.`, status: 404, code: 'ORDER_SELECTION_NOT_FOUND', missingOrderIds: missing };
  }

  const requestedDate = dateUtil.toDateOnly(body.deliveryDate || body.date || '');
  if (requestedDate) {
    const mismatched = orders.filter((order) => orderDeliveryDate(order) && orderDeliveryDate(order) !== requestedDate);
    if (mismatched.length) {
      return { error: 'Có đơn không thuộc đúng ngày giao đang chốt.', status: 400, code: 'ORDER_SELECTION_DATE_MISMATCH', orderIds: mismatched.map((order) => clean(order.id || order.code || order.orderCode)) };
    }
  }

  const requestedDelivery = clean(body.deliveryStaffCode || body.delivery || body.nvghCode);
  if (requestedDelivery) {
    const mismatched = orders.filter((order) => orderDeliveryStaffCode(order) && orderDeliveryStaffCode(order) !== requestedDelivery);
    if (mismatched.length) {
      return { error: 'Có đơn không thuộc đúng NVGH đang chốt.', status: 400, code: 'ORDER_SELECTION_DELIVERY_STAFF_MISMATCH', orderIds: mismatched.map((order) => clean(order.id || order.code || order.orderCode)) };
    }
  }

  const requestedSales = unique(Array.isArray(body.salesStaffCodes) ? body.salesStaffCodes : [body.salesStaffCode, body.salesman, body.nvbhCode]);
  if (requestedSales.length) {
    const mismatched = orders.filter((order) => {
      const code = orderSalesStaffCode(order);
      return code && !requestedSales.includes(code);
    });
    if (mismatched.length) {
      return { error: 'Có đơn không thuộc đúng NVBH đã chọn.', status: 400, code: 'ORDER_SELECTION_SALES_STAFF_MISMATCH', orderIds: mismatched.map((order) => clean(order.id || order.code || order.orderCode)) };
    }
  }

  return null;
}

async function confirmOneOrder(order = {}, returnOrders = [], options = {}) {
  const actor = clean(options.actor || 'accountant');
  if (!isCompletedDelivery(order)) return { skipped: true, reason: 'delivery_not_completed', orderId: DeliveryCloseoutService.orderId(order) };

  const existingCloseout = order.deliveryCloseout || {};
  const computed = DeliveryCloseoutService.buildCloseout(order, returnOrders, [], {
    actor,
    status: existingCloseout.status || 'pending_accounting',
    reason: clean(options.reason || options.closeoutReason || '')
  });

  if (DeliveryCloseoutService.hasReturnSignalWithoutReturnOrders(order, computed)) {
    const err = new Error('Đơn có số tiền hàng trả trên app/salesOrders nhưng chưa có returnOrders hợp lệ. Chặn xác nhận kế toán để tránh lệch tồn kho/công nợ.');
    err.code = 'ACCOUNTING_CONFIRM_BLOCKED_MISSING_RETURNORDERS';
    err.orderId = DeliveryCloseoutService.orderId(order);
    err.orderCode = DeliveryCloseoutService.orderCode(order);
    throw err;
  }

  const compare = DeliveryCloseoutService.compareCloseout(computed, existingCloseout);
  if (!compare.ok) {
    const err = new Error('deliveryCloseout hiện tại lệch với dữ liệu tính lại từ salesOrders/returnOrders/tiền giao hàng. Chặn xác nhận kế toán.');
    err.code = 'DELIVERY_CLOSEOUT_CALCULATION_MISMATCH';
    err.orderId = DeliveryCloseoutService.orderId(order);
    err.orderCode = DeliveryCloseoutService.orderCode(order);
    err.mismatches = compare.mismatches;
    throw err;
  }

  if (computed.finalDebtAmount < 0) {
    const err = new Error('finalDebtAmount âm: đưa vào exception/overpayment, không sinh công nợ âm.');
    err.code = 'DELIVERY_CLOSEOUT_OVERPAYMENT_EXCEPTION';
    err.orderId = DeliveryCloseoutService.orderId(order);
    err.orderCode = DeliveryCloseoutService.orderCode(order);
    err.finalDebtAmount = computed.finalDebtAmount;
    throw err;
  }

  if (existingCloseout.status === 'accounting_confirmed' || order.accountingConfirmed === true) {
    const postResult = await ArDebtOpenPostingService.postDebtOpen(order, existingCloseout, options);
    return { skipped: true, idempotent: true, orderId: DeliveryCloseoutService.orderId(order), closeout: existingCloseout, arDebtOpen: postResult };
  }

  const confirmedCloseout = DeliveryCloseoutService.confirmCloseout(order, computed, { actor, reason: clean(options.reason || options.closeoutReason || '') });
  const updatedOrder = buildConfirmedOrderPatch(order, confirmedCloseout, actor);
  await orderRepository.upsert(updatedOrder, options);
  const arResult = await ArDebtOpenPostingService.postDebtOpen(updatedOrder, confirmedCloseout, { ...options, note: clean(options.note || options.reason || `Mở công nợ cuối cùng từ chốt giao hàng ${DeliveryCloseoutService.orderCode(order)}`) });
  await auditService.log('ACCOUNTING_CONFIRM_DELIVERY_CLOSEOUT', {
    refType: 'SALES_ORDER',
    refId: DeliveryCloseoutService.orderId(order),
    refCode: DeliveryCloseoutService.orderCode(order),
    user: actor,
    note: `Xác nhận kế toán chốt giao hàng: finalDebt=${confirmedCloseout.finalDebtAmount}, AR=${arResult.posted ? 'AR-DEBT-OPEN' : arResult.reason || 'idempotent'}, reason=${clean(options.reason || options.closeoutReason || '')}`
  });
  return { confirmed: true, orderId: DeliveryCloseoutService.orderId(order), closeout: confirmedCloseout, arDebtOpen: arResult };
}

async function confirmDeliveryAccountingInternal(body = {}, normalized = {}) {
  const date = normalized.date || dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = normalized.selectedOrderIds || normalizeOrderIds(body);
  if (!selectedOrderIds.length) return { error: 'Vui lòng chọn ít nhất một đơn để xác nhận kế toán', status: 400 };
  const actor = clean(normalized.confirmedBy || body.confirmedBy || body.userName || body.accountantName || 'accountant');
  const reason = clean(normalized.reason || body.reason || body.note || 'Chốt sổ giao hàng cuối ngày');
  const orders = await loadOrders(selectedOrderIds);
  if (!orders.length) return { error: `Không tìm thấy đơn đã chọn trong ngày ${date} để kế toán xác nhận`, status: 404, code: 'ORDER_SELECTION_NOT_FOUND' };
  const scopeError = validateSelectedOrderScope(orders, body, selectedOrderIds);
  if (scopeError) return scopeError;
  const returnOrders = await findReturnOrdersForDeliveryChildren(orders);
  const returnByKey = groupReturnOrdersBySalesOrder(returnOrders, orders);

  const results = [];
  await withMongoTransaction(async (session) => {
    for (const order of orders) {
      const rows = returnOrdersForOrder(order, returnByKey);
      const result = await confirmOneOrder(order, rows, { session, actor, confirmedBy: actor, reason, note: reason });
      results.push(result);
    }
  });

  const confirmedOrders = results.filter((row) => row.confirmed).length;
  const skippedOrders = results.filter((row) => row.skipped).length;
  return {
    date,
    confirmedOrders,
    skippedOrders,
    totalOrders: orders.length,
    architecture: 'salesOrders.deliveryCloseout -> single AR-DEBT-OPEN',
    arPolicy: 'no AR-SALE / AR-RETURN / AR-RECEIPT from delivery accounting',
    results,
    reason,
    message: `Kế toán đã xác nhận ${confirmedOrders} đơn theo deliveryCloseout. Công nợ chỉ sinh AR-DEBT-OPEN nếu finalDebtAmount > 0 sau ngưỡng dung sai ±1.000.`
  };
}

async function confirmDeliveryAccounting(body = {}) {
  const date = dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = normalizeOrderIds(body);
  if (!selectedOrderIds.length) return { error: 'Vui lòng chọn ít nhất một đơn để xác nhận kế toán', status: 400 };
  const confirmedBy = clean(body.confirmedBy || body.userName || body.accountantName || 'accountant');
  const reason = clean(body.reason || body.note || 'Chốt sổ giao hàng cuối ngày');
  const now = Date.now();
  cleanupGuards(now);
  const key = guardKey(date, selectedOrderIds, confirmedBy);
  const existing = inFlight.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise.then((result) => ({ ...result, duplicateSubmitSuppressed: true }));
  }
  const promise = confirmDeliveryAccountingInternal(body, { date, selectedOrderIds, confirmedBy, reason });
  inFlight.set(key, { expiresAt: now + CONFIRM_GUARD_TTL_MS, promise });
  try {
    const result = await promise;
    inFlight.set(key, { expiresAt: Date.now() + CONFIRM_GUARD_TTL_MS, promise: Promise.resolve(result) });
    return result;
  } catch (err) {
    inFlight.delete(key);
    throw err;
  }
}

module.exports = {
  confirmDeliveryAccounting,
  confirmDeliveryAccountingInternal,
  confirmOneOrder,
  loadOrders,
  groupReturnOrdersBySalesOrder,
  returnOrdersForOrder,
  _internal: {
    normalizeOrderIds,
    validateSelectedOrderScope,
    orderDeliveryDate,
    orderDeliveryStaffCode,
    orderSalesStaffCode,
    isCompletedDelivery,
    buildConfirmedOrderPatch,
    guardKey,
    stripOperationalDetails
  }
};
