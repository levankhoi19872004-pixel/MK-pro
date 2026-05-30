'use strict';

const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const productRepository = require('../repositories/productRepository');
const customerRepository = require('../repositories/customerRepository');
const userRepository = require('../repositories/userRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const inventoryService = require('./inventoryService');
const postingEngine = require('../engines/posting.engine');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function buildOrderCode(existingOrders = []) {
  const max = existingOrders.reduce((result, order) => {
    const match = String(order.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `SO${String(max + 1).padStart(5, '0')}`;
}


function deliveryDebtBase(order = {}) {
  return toNumber(order.debtBeforeCollection ?? order.totalAmount ?? order.amount ?? order.debtAmount ?? 0);
}

function calculateDeliveryDebt(order = {}) {
  return Math.max(0, Math.round(
    deliveryDebtBase(order)
    - toNumber(order.cashCollected ?? order.cashAmount ?? 0)
    - toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0)
    - toNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0)
    - toNumber(order.returnAmount ?? order.returnedAmount ?? 0)
  ));
}

function calculateItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = toNumber(item.quantity ?? item.qty ?? item.totalQty);
      const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice);
      const amount = toNumber(item.amount ?? item.total ?? quantity * price);
      return {
        ...item,
        productId: String(item.productId || item.id || item.productCode || item.code || '').trim(),
        productCode: String(item.productCode || item.code || item.sku || item.productId || '').trim(),
        productName: String(item.productName || item.name || '').trim(),
        quantity,
        qty: quantity,
        price,
        salePrice: price,
        amount
      };
    })
    .filter((item) => item.quantity > 0 || item.productCode || item.productName);
}

async function resolveCustomer(body = {}) {
  const customerId = String(body.customerId || body.customerCode || body.customerName || '').trim();
  if (!customerId) return null;
  return customerRepository.findByIdOrCode(customerId);
}

async function resolveStaff(body = {}) {
  const staffId = String(body.staffId || body.staffCode || body.staffName || body.salesStaffId || body.salesStaffCode || '').trim();
  if (!staffId) return null;
  return userRepository.findStaffByIdOrCode(staffId);
}

async function hydrateItemNames(items) {
  const products = await productRepository.findAll({});
  const byCode = new Map(products.map((p) => [String(p.code || p.sku || p.id || '').trim(), p]));
  return items.map((item) => {
    const product = byCode.get(String(item.productCode || item.productId || '').trim());
    if (!product) return item;
    return {
      ...item,
      productId: item.productId || product.id || product.code,
      productCode: item.productCode || product.code,
      productName: item.productName || product.name,
      price: item.price || product.salePrice || 0,
      salePrice: item.salePrice || product.salePrice || 0,
      amount: item.amount || toNumber(item.quantity) * toNumber(item.price || product.salePrice)
    };
  });
}



async function applySalesOrderPosting(order, options = {}) {
  await inventoryService.postStockMovement(order, {
    type: 'SALE',
    direction: 'OUT',
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    date: order.date || order.orderDate || order.createdAt,
    note: 'Xuất kho theo đơn bán'
  }, options);

  // V45 chuẩn: đơn bán mới tạo/chưa chốt giao chưa được đưa vào công nợ.
  // Công nợ chỉ phát sinh sau khi NVGH chốt giao hàng hoàn thành.
  const deliveryStatus = String(order.deliveryStatus || order.status || '').toLowerCase();
  const isDeliveryCompleted = ['delivered', 'success', 'completed', 'done'].includes(deliveryStatus);
  if (!isDeliveryCompleted) return;

  const customerKey = order.customerCode || order.customerId || order.customerName;
  if (!customerKey) return;
  const customer = await customerRepository.findByIdOrCode(customerKey);
  if (!customer) return;
  const currentDebt = toNumber(customer.currentDebt ?? customer.debtAmount ?? customer.openingDebt);
  const nextDebt = currentDebt + toNumber(order.debtAmount);
  customer.currentDebt = nextDebt;
  customer.debtAmount = nextDebt;
  await customerRepository.save(customer, options);
  await postingEngine.postSalesOrderAR(order, { ...options, postZero: true });
}

async function reverseSalesOrderPosting(order, options = {}) {
  await inventoryService.reverseStockMovement(order, {
    type: 'SALE',
    reverseType: 'SALE_REVERSAL',
    direction: 'OUT',
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    date: new Date().toISOString().slice(0, 10),
    note: 'Đảo xuất kho đơn bán'
  }, options);

  const customerKey = order.customerCode || order.customerId || order.customerName;
  if (!customerKey) return;
  const customer = await customerRepository.findByIdOrCode(customerKey);
  if (!customer) return;
  const currentDebt = toNumber(customer.currentDebt ?? customer.debtAmount ?? customer.openingDebt);
  const nextDebt = Math.max(0, currentDebt - toNumber(order.debtAmount));
  customer.currentDebt = nextDebt;
  customer.debtAmount = nextDebt;
  await customerRepository.save(customer, options);
  await postingEngine.reverseSalesOrderAR(order, options);
}

function toClient(order) {
  return {
    ...order,
    id: order.id || order.code,
    code: order.code || order.id,
    items: Array.isArray(order.items) ? order.items : [],
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    debtAmount: toNumber(order.debtAmount)
  };
}

async function getOrder(id) {
  const order = await orderRepository.findByIdOrCode(id);
  if (!order) return { error: 'Không tìm thấy đơn bán', status: 404 };
  return { salesOrder: toClient(order) };
}

function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(row.deletedAt);
}

async function listOrders(query = {}) {
  const q = normalizeText(query.q);
  const dateFrom = String(query.dateFrom || '').slice(0, 10);
  const dateTo = String(query.dateTo || '').slice(0, 10);
  const excludeInactive = String(query.excludeInactive ?? '0') !== '0';
  const orders = await orderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return orders
    .map(toClient)
    .filter((order) => !excludeInactive || !isInactiveStatus(order))
    .filter((order) => {
      const d = String(order.date || order.orderDate || order.deliveryDate || '').slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    })
    .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.staffName, order.deliveryStaffName].some((value) => normalizeText(value).includes(q)));
}

async function createOrder(body = {}) {
  const existingOrders = await orderRepository.findAll();
  const customer = await resolveCustomer(body);
  const staff = await resolveStaff(body);
  const items = await hydrateItemNames(calculateItems(body.items));
  if (!items.length) return { error: 'Đơn bán chưa có sản phẩm', status: 400 };
  const totalAmount = toNumber(body.totalAmount || items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const paidAmount = toNumber(body.paidAmount || body.paid || 0);
  const order = {
    ...body,
    id: String(body.id || makeId('SO')).trim(),
    code: String(body.code || buildOrderCode(existingOrders)).trim(),
    date: String(body.date || today()).slice(0, 10),
    deliveryDate: String(body.deliveryDate || body.date || today()).slice(0, 10),
    customerId: customer?.id || body.customerId || body.customerCode || '',
    customerCode: customer?.code || body.customerCode || '',
    customerName: customer?.name || body.customerName || '',
    customerPhone: customer?.phone || body.customerPhone || '',
    customerAddress: customer?.address || body.customerAddress || '',
    staffId: staff?.id || body.staffId || body.salesStaffId || '',
    staffCode: staff?.code || body.staffCode || body.salesStaffCode || '',
    staffName: staff?.name || body.staffName || body.salesStaffName || '',
    salesStaffId: staff?.id || body.salesStaffId || body.staffId || '',
    salesStaffCode: staff?.code || body.salesStaffCode || body.staffCode || '',
    salesStaffName: staff?.name || body.salesStaffName || body.staffName || '',
    items,
    totalAmount,
    paidAmount,
    debtAmount: toNumber(body.debtAmount ?? Math.max(0, totalAmount - paidAmount)),
    isChildOrder: body.isChildOrder !== false,
    masterOrderId: body.masterOrderId || '',
    masterOrderCode: body.masterOrderCode || '',
    mergeStatus: body.mergeStatus || 'unmerged',
    deliveryStatus: body.deliveryStatus || 'pending',
    status: body.status || 'pending',
    lifecycleStatus: body.lifecycleStatus || 'pending',
    arStatus: body.arStatus || 'not_posted',
    arBalance: 0,
    orderSource: body.orderSource || body.source || 'NVBH',
    source: body.source || body.orderSource || 'NVBH',
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(order, { session });
    await applySalesOrderPosting(order, { session });
  });
  return { salesOrder: toClient(order) };
}

async function updateOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  if (current.masterOrderId || current.mergeStatus === 'merged') return { error: 'Đơn đã gộp, không nên sửa trực tiếp đơn con', status: 400 };
  const items = body.items ? await hydrateItemNames(calculateItems(body.items)) : current.items;
  const totalAmount = toNumber(body.totalAmount ?? (items || []).reduce((sum, item) => sum + toNumber(item.amount), 0));
  const paidAmount = toNumber(body.paidAmount ?? current.paidAmount ?? 0);
  const updated = {
    ...current,
    ...body,
    items,
    totalAmount,
    paidAmount,
    debtAmount: toNumber(body.debtAmount ?? Math.max(0, totalAmount - paidAmount)),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await reverseSalesOrderPosting(current, { session });
    await orderRepository.upsert(updated, { session });
    await applySalesOrderPosting(updated, { session });
  });
  return { salesOrder: toClient(updated) };
}

async function cancelOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  const cancelled = {
    ...current,
    status: 'cancelled',
    deliveryStatus: 'cancelled',
    cancelReason: String(body.reason || body.cancelReason || '').trim(),
    cancelledAt: nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(cancelled, { session });
    await reverseSalesOrderPosting(current, { session });
  });
  if (cancelled.masterOrderId || cancelled.masterOrderCode) {
    await syncMasterOrderSummary(cancelled.masterOrderId || cancelled.masterOrderCode);
  }
  return { salesOrder: toClient(cancelled) };
}

async function deleteOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  // ERP/DMS không xóa vật lý chứng từ đã phát sinh; DELETE chuyển sang void để còn audit và báo cáo.
  const removed = {
    ...current,
    status: 'void',
    deliveryStatus: 'void',
    deletedAt: nowIso(),
    deleteReason: String(body.reason || body.deleteReason || '').trim(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(removed, { session });
    await reverseSalesOrderPosting(current, { session });
  });
  if (removed.masterOrderId || removed.masterOrderCode) {
    await syncMasterOrderSummary(removed.masterOrderId || removed.masterOrderCode);
  }
  return { salesOrder: toClient(removed) };
}

async function getMasterChildren(masterOrder) {
  const ids = new Set((masterOrder.childOrderIds || []).map(String));
  const orders = await orderRepository.findAll();
  return orders.filter((order) => ids.has(String(order.id)) || ids.has(String(order.code)) || String(order.masterOrderId || '') === String(masterOrder.id || '') || String(order.masterOrderCode || '') === String(masterOrder.code || ''));
}

function summarizeOrders(children = []) {
  const active = children.filter((order) => !['cancelled', 'void'].includes(String(order.status || '').toLowerCase()));
  return {
    orderCount: active.length,
    totalAmount: active.reduce((sum, order) => sum + toNumber(order.totalAmount), 0),
    paidAmount: active.reduce((sum, order) => sum + toNumber(order.paidAmount), 0),
    debtAmount: active.reduce((sum, order) => sum + calculateDeliveryDebt(order), 0)
  };
}

async function syncMasterOrderSummary(masterIdOrCode, options = {}) {
  const master = await masterOrderRepository.findByIdOrCode(masterIdOrCode);
  if (!master) return null;
  const children = await getMasterChildren(master);
  const updated = { ...master, ...summarizeOrders(children), updatedAt: nowIso() };
  await masterOrderRepository.upsert(updated, options);
  return updated;
}

module.exports = {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  cancelOrder,
  deleteOrder,
  getMasterChildren,
  summarizeOrders,
  syncMasterOrderSummary,
  applySalesOrderPosting,
  reverseSalesOrderPosting,
  toClient
};
