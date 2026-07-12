'use strict';

const orderService = require('../services/orderService');
const SalesOrderDeletionService = require('../domain/lifecycle/SalesOrderDeletionService');
const { emitDomainEventSafe, eventContextFromRequest } = require('../services/events/domainEventBus');
const { EVENT_TYPES } = require('../services/events/domainEventTypes');


function text(value = '') { return String(value ?? '').trim(); }
function numberValue(value) { const n = Number(value || 0); return Number.isFinite(n) ? Math.round(n) : 0; }
function orderIdentity(order = {}) {
  return {
    id: text(order.id || order._id || order.salesOrderId || order.orderId),
    code: text(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id || order._id)
  };
}
function orderStaffMetadata(order = {}) {
  return {
    orderCode: orderIdentity(order).code,
    customerCode: text(order.customerCode || order.customerId),
    customerName: text(order.customerName || order.name),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName)
  };
}
function amountSnapshot(order = {}) {
  return {
    totalAmount: numberValue(order.totalAmount || order.amount || order.finalAmount),
    grossAmount: numberValue(order.grossAmount || order.beforePromotionAmount),
    discountAmount: numberValue(order.discountAmount),
    promotionAmount: numberValue(order.promotionAmount || order.rewardAmount),
    netAmount: numberValue(order.netAmount || order.totalAmount || order.finalAmount),
    paymentAmount: numberValue(order.paymentAmount || order.paidAmount),
    returnAmount: numberValue(order.returnAmount || order.returnedAmount)
  };
}
function diffNumbers(before = {}, after = {}) {
  const diff = {};
  for (const key of Object.keys({ ...before, ...after })) {
    const delta = numberValue(after[key]) - numberValue(before[key]);
    if (delta !== 0) diff[key] = delta;
  }
  return diff;
}
async function emitOrderChangeEvents(req = {}, before = {}, after = {}) {
  if (!before || !after) return;
  const ctx = eventContextFromRequest(req);
  const identity = orderIdentity(after || before);
  const beforeAmount = amountSnapshot(before);
  const afterAmount = amountSnapshot(after);
  const amountDiff = diffNumbers(beforeAmount, afterAmount);
  if (Object.keys(amountDiff).length) {
    await emitDomainEventSafe({
      eventType: EVENT_TYPES.ORDER_AMOUNT_CHANGED,
      entityId: identity.id,
      entityCode: identity.code,
      before: beforeAmount,
      after: afterAmount,
      diff: amountDiff,
      metadata: { ...orderStaffMetadata(after), oldOrderCode: orderIdentity(before).code },
      idempotencyKey: `ORDER_AMOUNT_CHANGED:${identity.id || identity.code}:${Date.now()}`,
      ...ctx
    });
  }
  const oldDelivery = text(before.deliveryStaffCode || before.deliveryCode || before.nvghCode);
  const newDelivery = text(after.deliveryStaffCode || after.deliveryCode || after.nvghCode);
  if (oldDelivery !== newDelivery) {
    await emitDomainEventSafe({
      eventType: EVENT_TYPES.ORDER_DELIVERY_STAFF_CHANGED,
      entityId: identity.id,
      entityCode: identity.code,
      before: { deliveryStaffCode: oldDelivery, deliveryStaffName: text(before.deliveryStaffName || before.deliveryName || before.nvghName) },
      after: { deliveryStaffCode: newDelivery, deliveryStaffName: text(after.deliveryStaffName || after.deliveryName || after.nvghName) },
      diff: { deliveryStaffCode: `${oldDelivery} -> ${newDelivery}` },
      metadata: { ...orderStaffMetadata(after), oldDeliveryStaffCode: oldDelivery, oldDeliveryStaffName: text(before.deliveryStaffName || before.deliveryName || before.nvghName) },
      idempotencyKey: `ORDER_DELIVERY_STAFF_CHANGED:${identity.id || identity.code}:${Date.now()}`,
      ...ctx
    });
  }
  const oldSales = text(before.salesStaffCode || before.salesmanCode || before.nvbhCode);
  const newSales = text(after.salesStaffCode || after.salesmanCode || after.nvbhCode);
  if (oldSales !== newSales) {
    await emitDomainEventSafe({
      eventType: EVENT_TYPES.ORDER_SALES_STAFF_CHANGED,
      entityId: identity.id,
      entityCode: identity.code,
      before: { salesStaffCode: oldSales, salesStaffName: text(before.salesStaffName || before.salesmanName || before.nvbhName) },
      after: { salesStaffCode: newSales, salesStaffName: text(after.salesStaffName || after.salesmanName || after.nvbhName) },
      diff: { salesStaffCode: `${oldSales} -> ${newSales}` },
      metadata: { ...orderStaffMetadata(after), oldSalesStaffCode: oldSales, oldSalesStaffName: text(before.salesStaffName || before.salesmanName || before.nvbhName) },
      idempotencyKey: `ORDER_SALES_STAFF_CHANGED:${identity.id || identity.code}:${Date.now()}`,
      ...ctx
    });
  }
}


function orderControllerErrorStatus(err, fallbackStatus = 500) {
  const explicit = Number(err && (err.status || err.statusCode));
  if (Number.isInteger(explicit) && explicit >= 400 && explicit <= 599) return explicit;
  const code = String(err && err.code || '').toUpperCase();
  if (code.includes('VALIDATION') || code.includes('INVALID') || code.includes('REQUIRED')) return 422;
  return fallbackStatus;
}

function sendOrderControllerError(res, err, fallbackMessage) {
  const status = orderControllerErrorStatus(err, 500);
  return res.status(status).json({
    ok: false,
    success: false,
    code: err && err.code,
    message: status >= 500 && process.env.NODE_ENV === 'production'
      ? fallbackMessage
      : ((err && err.message) || fallbackMessage)
  });
}

function handleServiceResult(res, result, successStatus = 200, successPayload = {}) {
  if (result && result.error) {
    return res.status(result.status || 400).json({ ok: false, success: false, code: result.code, message: result.error });
  }
  return res.status(successStatus).json({ ok: true, source: 'mongo-route', ...successPayload(result) });
}


async function search(req, res) {
  try {
    const result = await orderService.searchOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tìm kiếm được danh sách đơn bán', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function list(req, res) {
  try {
    const salesOrders = await orderService.listOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', salesOrders, orders: salesOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn bán từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function get(req, res) {
  try {
    const result = await orderService.getOrder(req.params.id);
    return handleServiceResult(res, result, 200, (r) => ({ salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được chi tiết đơn bán', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function create(req, res) {
  try {
    const result = await orderService.createOrder(req.body || {}, req.user || {});
    return handleServiceResult(res, result, 201, (r) => ({ message: `Đã tạo đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn bán' });
  }
}

async function update(req, res) {
  try {
    const beforeOrder = req.salesOrderMutation?.order || null;
    const result = await orderService.updateOrder(req.params.id, req.body || {}, {
      actor: req.user || {},
      order: beforeOrder,
      expectedVersion: req.salesOrderMutation?.expectedVersion
    });
    if (!result?.error && beforeOrder && result?.salesOrder) {
      await emitOrderChangeEvents(req, beforeOrder, result.salesOrder);
    }
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã cập nhật đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    return sendOrderControllerError(res, err, 'Không sửa được đơn bán');
  }
}

async function updateVatInvoiceSetting(req, res) {
  try {
    const result = await orderService.updateVatInvoiceSetting(req.params.id, req.body || {}, req.user || {});
    return handleServiceResult(res, result, 200, (r) => ({
      message: `Đã chuyển đơn ${r.salesOrder.code} sang ${r.salesOrder.vatInvoiceRequired ? 'xuất hóa đơn' : 'không xuất hóa đơn'}`,
      salesOrder: r.salesOrder,
      order: r.salesOrder
    }));
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được thiết lập hóa đơn VAT' });
  }
}

async function cancel(req, res) {
  try {
    const result = await orderService.cancelOrder(req.params.id, req.body || {}, {
      actor: req.user || {},
      order: req.salesOrderMutation?.order,
      expectedVersion: req.salesOrderMutation?.expectedVersion
    });
    return handleServiceResult(res, result, 200, (r) => ({ message: `Đã hủy đơn bán ${r.salesOrder.code}`, salesOrder: r.salesOrder, order: r.salesOrder }));
  } catch (err) {
    return sendOrderControllerError(res, err, 'Không hủy được đơn bán');
  }
}

async function remove(req, res) {
  try {
    const result = await SalesOrderDeletionService.deleteSalesOrder(req.params.id, {
      ...(req.body || {}),
      source: 'web-sales-history',
      user: req.user || {},
      actorCode: req.user?.code || req.user?.staffCode || '',
      actorName: req.user?.name || req.user?.fullName || req.user?.username || '',
      authorizedOrder: req.salesOrderMutation?.order,
      expectedVersion: req.salesOrderMutation?.expectedVersion
    });

    if (!result?.error && result?.salesOrder) {
      const ctx = eventContextFromRequest(req);
      const identity = orderIdentity(result.salesOrder);
      await emitDomainEventSafe({
        eventType: EVENT_TYPES.ORDER_DELETED,
        entityId: identity.id,
        entityCode: identity.code,
        before: amountSnapshot(result.salesOrder),
        after: { deleted: true },
        diff: { deleted: true },
        metadata: orderStaffMetadata(result.salesOrder),
        idempotencyKey: `ORDER_DELETED:${identity.id || identity.code}`,
        ...ctx
      });
    }

    return handleServiceResult(res, result, 200, (r) => ({
      message: r.message || `Đã xóa đơn bán ${r.salesOrder?.code || ''}`,
      mode: r.mode,
      hardDeleted: true,
      salesOrder: r.salesOrder,
      order: r.salesOrder
    }));
  } catch (err) {
    return sendOrderControllerError(res, err, 'Không xóa được đơn bán');
  }
}

module.exports = { list, search, get, create, update, updateVatInvoiceSetting, cancel, remove };
