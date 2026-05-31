'use strict';

const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const productRepository = require('../repositories/productRepository');
const customerRepository = require('../repositories/customerRepository');
const userRepository = require('../repositories/userRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const { normalizeOrderSourceValue, applyOrderSourceFields } = require('../utils/orderSource.util');
const inventoryService = require('./inventoryService');
const postingEngine = require('../engines/posting.engine');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeOrderDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const parts = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})/);
  if (parts) {
    let a = Number(parts[1]);
    let b = Number(parts[2]);
    let y = Number(parts[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    let day;
    let month;
    if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return raw.slice(0, 10);
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
  const normalizedOrderSource = normalizeOrderSourceValue(order);
  return {
    ...order,
    id: order.id || order.code,
    code: order.code || order.id,
    items: Array.isArray(order.items) ? order.items : [],
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    debtAmount: toNumber(order.debtAmount),
    source: normalizedOrderSource,
    orderSource: normalizedOrderSource,
    orderSourceName: normalizedOrderSource === 'DMS' ? 'Từ DMS' : 'Từ NVBH'
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
  const sourceKey = normalizeText(query.source || query.orderSource);
  const orders = await orderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return orders
    .map(toClient)
    .filter((order) => !excludeInactive || !isInactiveStatus(order))
    .filter((order) => {
      const d = normalizeOrderDate(order.date || order.orderDate || order.deliveryDate || '');
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    })
    .filter((order) => !sourceKey || normalizeText(normalizeOrderSourceValue(order)).includes(sourceKey.includes('dms') ? 'dms' : 'nvbh'))
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
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  Object.assign(order, applyOrderSourceFields(order));
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
  const updated = applyOrderSourceFields({
    ...current,
    ...body,
    items,
    totalAmount,
    paidAmount,
    debtAmount: toNumber(body.debtAmount ?? Math.max(0, totalAmount - paidAmount)),
    updatedAt: nowIso()
  });
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

function compactOrderKeys(order = {}) {
  return [order.id, order.code, order.orderNo, order.orderCode, order._id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function isInactiveOrder(order = {}) {
  const status = String(order.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(order.deletedAt);
}

function masterChildIdSet(masterOrder = {}) {
  return new Set((Array.isArray(masterOrder.childOrderIds) ? masterOrder.childOrderIds : [])
    .map((item) => String(item?.id || item?.code || item?._id || item || '').trim())
    .filter(Boolean));
}

async function getMasterChildren(masterOrder = {}) {
  // NGUỒN CHUẨN DUY NHẤT: masterOrder.childOrderIds.
  // Không dùng masterOrder.children, không dùng tổng cache, không dùng customer summary,
  // không tự lấy theo masterOrderId vì các liên kết cũ có thể còn sót sau khi xóa/hủy đơn.
  const ids = masterChildIdSet(masterOrder);
  if (!ids.size) return [];

  const orders = await orderRepository.findAll();
  const byKey = new Map();
  for (const order of orders) {
    if (isInactiveOrder(order)) continue;
    const matched = compactOrderKeys(order).some((key) => ids.has(key));
    if (!matched) continue;
    const key = String(order.id || order.code || order._id || '').trim();
    if (key) byKey.set(key, order);
  }

  return Array.from(byKey.values());
}

function summarizeOrders(children = []) {
  const active = children.filter((order) => !isInactiveOrder(order));
  const totalOrders = active.length;
  const totalQuantity = active.reduce((sum, order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    return sum + items.reduce((itemSum, item) => itemSum + toNumber(item.quantity ?? item.qty ?? item.totalQuantity ?? 0), 0);
  }, 0);
  const totalAmount = active.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
  const paidAmount = active.reduce((sum, order) => sum + toNumber(order.paidAmount), 0);
  const debtAmount = active.reduce((sum, order) => sum + calculateDeliveryDebt(order), 0);
  return {
    orderCount: totalOrders,
    totalOrders,
    totalQuantity,
    totalAmount,
    paidAmount,
    debtAmount,
    totalDebt: debtAmount
  };
}

async function syncMasterOrderSummary(masterIdOrCode, options = {}) {
  const master = await masterOrderRepository.findByIdOrCode(masterIdOrCode);
  if (!master) return null;
  const children = await getMasterChildren(master);
  const childOrderIds = children.map((order) => order.id || order.code).filter(Boolean);
  const updated = {
    ...master,
    childOrderIds,
    children: [],
    ...summarizeOrders(children),
    updatedAt: nowIso()
  };
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
