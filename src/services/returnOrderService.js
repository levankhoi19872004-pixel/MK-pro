'use strict';

const returnOrderRepository = require('../repositories/returnOrderRepository');
const orderRepository = require('../repositories/orderRepository');
const customerRepository = require('../repositories/customerRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const inventoryService = require('./inventoryService');

function today() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }

function buildReturnCode(existingOrders = []) {
  const max = existingOrders.reduce((result, order) => {
    const match = String(order.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `THH${String(max + 1).padStart(5, '0')}`;
}

function toClient(order) {
  return {
    ...order,
    id: order.id || order.code,
    code: order.code || order.id,
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount)
  };
}

async function listReturnOrders(query = {}) {
  const q = normalizeText(query.q);
  const orders = await returnOrderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return orders
    .map(toClient)
    .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.salesOrderCode, order.staffName, order.note].some((value) => normalizeText(value).includes(q)));
}

async function resolveSalesOrder(body = {}) {
  const key = String(body.salesOrderId || body.salesOrderCode || body.orderId || body.orderCode || '').trim();
  return key ? orderRepository.findByIdOrCode(key) : null;
}

async function resolveCustomer(body = {}, salesOrder = null) {
  const key = String(body.customerId || body.customerCode || body.customerName || salesOrder?.customerId || salesOrder?.customerCode || '').trim();
  return key ? customerRepository.findByIdOrCode(key) : null;
}

function normalizeItems(rawItems = [], salesOrder = null) {
  const salesItems = new Map((salesOrder?.items || []).map((item) => [String(item.productCode || item.code || item.productId || '').trim(), item]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productCode = String(raw.productCode || raw.code || raw.productId || '').trim();
      const original = salesItems.get(productCode) || {};
      const quantity = toNumber(raw.quantity ?? raw.qty ?? raw.returnQuantity);
      const price = toNumber(raw.price ?? raw.salePrice ?? raw.unitPrice ?? original.price ?? original.salePrice ?? 0);
      return {
        ...original,
        ...raw,
        productId: raw.productId || original.productId || productCode,
        productCode: productCode || original.productCode || original.code || '',
        productName: raw.productName || raw.name || original.productName || original.name || '',
        quantity,
        qty: quantity,
        price,
        salePrice: price,
        amount: toNumber(raw.amount ?? quantity * price)
      };
    })
    .filter((item) => item.quantity > 0 || item.productCode || item.productName);
}

async function createReturnOrder(body = {}) {
  const salesOrder = await resolveSalesOrder(body);
  const customer = await resolveCustomer(body, salesOrder);
  if (!customer && !body.customerName && !salesOrder?.customerName) return { error: 'Không tìm thấy khách hàng', status: 404 };
  const items = normalizeItems(body.items, salesOrder);
  if (!items.length) return { error: 'Phiếu trả hàng chưa có dòng hàng', status: 400 };
  const existingOrders = await returnOrderRepository.findAll();
  const totalAmount = toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const returnOrder = {
    ...body,
    id: String(body.id || makeId('RO')).trim(),
    code: String(body.code || buildReturnCode(existingOrders)).trim(),
    date: String(body.date || today()).slice(0, 10),
    salesOrderId: salesOrder?.id || body.salesOrderId || body.orderId || '',
    salesOrderCode: salesOrder?.code || body.salesOrderCode || body.orderCode || '',
    customerId: customer?.id || body.customerId || salesOrder?.customerId || '',
    customerCode: customer?.code || body.customerCode || salesOrder?.customerCode || '',
    customerName: customer?.name || body.customerName || salesOrder?.customerName || '',
    note: String(body.note || '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount,
    debtReduction: toNumber(body.debtReduction ?? totalAmount),
    status: body.status || 'posted',
    source: body.source || 'mongo_return_order_route',
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await returnOrderRepository.upsert(returnOrder, { session });
    await inventoryService.postStockMovement(returnOrder, {
      type: 'RETURN',
      direction: 'IN',
      refType: 'RETURN_ORDER',
      refId: returnOrder.id || returnOrder.code,
      refCode: returnOrder.code || returnOrder.id,
      date: returnOrder.date,
      note: 'Nhập lại kho theo phiếu trả hàng'
    }, { session });
  });
  return { returnOrder: toClient(returnOrder) };
}

module.exports = { listReturnOrders, createReturnOrder, toClient };
