'use strict';

const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const userRepository = require('../repositories/userRepository');
const orderService = require('./orderService');
const { makeId, normalizeText } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function buildMasterOrderCode(existingMasterOrders = []) {
  const max = existingMasterOrders.reduce((result, order) => {
    const match = String(order.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `DT${String(max + 1).padStart(5, '0')}`;
}

async function resolveStaff(body = {}, prefix = 'delivery') {
  const value = String(body[`${prefix}StaffId`] || body[`${prefix}StaffCode`] || body[`${prefix}StaffName`] || '').trim();
  if (!value) return null;
  return userRepository.findStaffByIdOrCode(value);
}

function toClient(masterOrder, children = []) {
  return {
    ...masterOrder,
    id: masterOrder.id || masterOrder.code,
    code: masterOrder.code || masterOrder.id,
    children,
    childOrderIds: Array.isArray(masterOrder.childOrderIds) ? masterOrder.childOrderIds : children.map((order) => order.id)
  };
}

async function listUnmergedChildOrders(query = {}) {
  const q = normalizeText(query.q);
  const source = normalizeText(query.source);
  const date = String(query.date || '').slice(0, 10);
  const salesStaff = normalizeText(query.salesStaff);
  const orders = await orderService.listOrders({});
  return orders
    .filter((order) => !['cancelled', 'void'].includes(String(order.status || '').toLowerCase()))
    .filter((order) => (order.mergeStatus || 'unmerged') !== 'merged' && !order.masterOrderId && !order.masterOrderCode)
    .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.customerPhone, order.customerAddress].some((value) => normalizeText(value).includes(q)))
    .filter((order) => !source || normalizeText(order.orderSource || order.source || 'NVBH') === source)
    .filter((order) => !date || String(order.deliveryDate || order.date || '').slice(0, 10) === date)
    .filter((order) => !salesStaff || [order.staffCode, order.staffName, order.salesStaffCode, order.salesStaffName].some((value) => normalizeText(value).includes(salesStaff)));
}

async function listMasterOrders(query = {}) {
  const q = normalizeText(query.q);
  const dateFrom = String(query.dateFrom || '').slice(0, 10);
  const dateTo = String(query.dateTo || '').slice(0, 10);
  const masterOrders = await masterOrderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  const result = [];
  for (const masterOrder of masterOrders) {
    const children = await orderService.getMasterChildren(masterOrder);
    const order = toClient(masterOrder, children);
    const d = String(order.deliveryDate || order.date || '').slice(0, 10);
    if (q && ![order.code, order.routeName, order.deliveryStaffName, order.deliveryStaffCode].some((value) => normalizeText(value).includes(q))) continue;
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    result.push(order);
  }
  return result;
}

async function createMasterOrder(body = {}) {
  const childIds = Array.isArray(body.childOrderIds) ? body.childOrderIds.map(String) : [];
  if (!childIds.length) return { error: 'Chưa chọn đơn con để gộp', status: 400 };
  const allOrders = await orderRepository.findAll();
  const children = allOrders.filter((order) => childIds.includes(String(order.id)) || childIds.includes(String(order.code)));
  if (children.length !== childIds.length) return { error: 'Một số đơn con không tồn tại', status: 400 };
  if (children.some((order) => order.masterOrderId || order.masterOrderCode || (order.mergeStatus || 'unmerged') === 'merged')) {
    return { error: 'Có đơn con đã được gộp trước đó', status: 400 };
  }
  const existingMasterOrders = await masterOrderRepository.findAll();
  const deliveryStaff = await resolveStaff(body, 'delivery');
  const salesStaff = await resolveStaff(body, 'sales');
  const deliveryDate = String(body.deliveryDate || body.date || today()).slice(0, 10);
  const masterOrder = {
    ...body,
    id: String(body.id || makeId('MO')).trim(),
    code: String(body.code || buildMasterOrderCode(existingMasterOrders)).trim(),
    date: String(body.date || deliveryDate).slice(0, 10),
    deliveryDate,
    routeName: String(body.routeName || '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || '',
    salesStaffId: salesStaff?.id || body.salesStaffId || '',
    salesStaffCode: salesStaff?.code || body.salesStaffCode || '',
    salesStaffName: salesStaff?.name || body.salesStaffName || '',
    childOrderIds: children.map((order) => order.id || order.code),
    status: body.status || 'assigned',
    ...orderService.summarizeOrders(children),
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await masterOrderRepository.upsert(masterOrder, { session });
    for (const child of children) {
      await orderRepository.upsert({
        ...child,
        masterOrderId: masterOrder.id,
        masterOrderCode: masterOrder.code,
        mergeStatus: 'merged',
        deliveryDate: masterOrder.deliveryDate,
        deliveryStaffId: masterOrder.deliveryStaffId,
        deliveryStaffCode: masterOrder.deliveryStaffCode,
        deliveryStaffName: masterOrder.deliveryStaffName,
        routeName: masterOrder.routeName,
        deliveryRoute: masterOrder.routeName,
        updatedAt: nowIso()
      }, { session });
    }
  });
  const updatedChildren = await orderService.getMasterChildren(masterOrder);
  return { masterOrder: toClient(masterOrder, updatedChildren) };
}

async function cancelMasterOrder(id) {
  const masterOrder = await masterOrderRepository.findByIdOrCode(id);
  if (!masterOrder) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(masterOrder);
  const cancelled = {
    ...masterOrder,
    status: 'cancelled',
    cancelledAt: nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    for (const child of children) {
      await orderRepository.upsert({
        ...child,
        masterOrderId: '',
        masterOrderCode: '',
        mergeStatus: 'unmerged',
        deliveryStaffId: '',
        deliveryStaffCode: '',
        deliveryStaffName: '',
        routeName: '',
        deliveryRoute: '',
        updatedAt: nowIso()
      }, { session });
    }
    await masterOrderRepository.upsert(cancelled, { session });
  });
  return { masterOrder: toClient(cancelled, []) };
}

module.exports = {
  listUnmergedChildOrders,
  listMasterOrders,
  createMasterOrder,
  cancelMasterOrder
};
