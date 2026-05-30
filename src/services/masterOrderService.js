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

async function getMasterOrder(id) {
  const masterOrder = await masterOrderRepository.findByIdOrCode(id);
  if (!masterOrder) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(masterOrder);
  return { masterOrder: toClient(masterOrder, children) };
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

function statusForDeliveryRow(order = {}) {
  const raw = String(order.deliveryStatus || order.status || 'pending').toLowerCase();
  const debt = Number(order.debtAmount ?? order.debt ?? 0) || 0;
  if (['delivered', 'done', 'completed', 'paid'].includes(raw)) return debt > 0 ? 'unpaid' : 'delivered';
  if (['delivering', 'shipping', 'on_route'].includes(raw)) return 'delivering';
  if (['returned', 'partial_return'].includes(raw)) return raw;
  return 'waiting';
}

async function listDeliveryToday(query = {}) {
  const date = String(query.date || today()).slice(0, 10);
  const q = normalizeText(query.q);
  const salesman = normalizeText(query.salesman || query.salesStaff);
  const delivery = normalizeText(query.delivery || query.deliveryStaff);
  const route = normalizeText(query.route || query.routeName);
  const status = normalizeText(query.status);

  const masterOrders = await listMasterOrders({ dateFrom: date, dateTo: date });
  const rows = [];

  for (const master of masterOrders) {
    if (['cancelled', 'void'].includes(String(master.status || '').toLowerCase())) continue;
    const children = Array.isArray(master.children) ? master.children : [];
    for (const child of children) {
      if (['cancelled', 'void'].includes(String(child.status || '').toLowerCase())) continue;
      const deliveryDate = String(child.deliveryDate || master.deliveryDate || child.date || master.date || '').slice(0, 10);
      if (deliveryDate !== date) continue;

      const row = {
        id: child.id || child.code,
        orderCode: child.code || child.id || '',
        masterOrderCode: master.code || master.id || '',
        customerCode: child.customerCode || '',
        customerName: child.customerName || '',
        customerPhone: child.customerPhone || '',
        customerAddress: child.customerAddress || '',
        salesmanCode: child.salesStaffCode || child.staffCode || master.salesStaffCode || '',
        salesmanName: child.salesStaffName || child.staffName || master.salesStaffName || '',
        deliveryStaffCode: child.deliveryStaffCode || master.deliveryStaffCode || '',
        deliveryStaffName: child.deliveryStaffName || master.deliveryStaffName || '',
        routeName: child.routeName || child.deliveryRoute || master.routeName || '',
        deliveryDate,
        deliveryStatus: child.deliveryStatus || 'waiting',
        visualStatus: statusForDeliveryRow(child),
        totalAmount: Number(child.totalAmount || 0),
        debt: Number(child.debtAmount ?? child.debt ?? 0) || 0,
        debtBeforeCollection: Number(child.debtBeforeCollection ?? child.totalAmount ?? child.debtAmount ?? 0) || 0,
        cashCollected: Number(child.cashCollected || child.cashAmount || 0),
        bankCollected: Number(child.bankCollected || child.transferAmount || child.bankAmount || 0),
        returnAmount: Number(child.returnAmount || 0),
        isLate: Boolean(child.isLate)
      };

      if (q && ![row.orderCode, row.masterOrderCode, row.customerCode, row.customerName, row.customerPhone, row.customerAddress].some((value) => normalizeText(value).includes(q))) continue;
      if (salesman && ![row.salesmanCode, row.salesmanName].some((value) => normalizeText(value).includes(salesman))) continue;
      if (delivery && ![row.deliveryStaffCode, row.deliveryStaffName].some((value) => normalizeText(value).includes(delivery))) continue;
      if (route && !normalizeText(row.routeName).includes(route)) continue;
      if (status && row.visualStatus !== status && normalizeText(row.deliveryStatus) !== status) continue;
      rows.push(row);
    }
  }

  const routeMap = new Map();
  for (const row of rows) {
    const key = row.routeName || 'Chưa có tuyến';
    if (!routeMap.has(key)) routeMap.set(key, {
      routeName: key,
      orderCount: 0,
      deliveryStaffCode: row.deliveryStaffCode,
      deliveryStaffName: row.deliveryStaffName
    });
    routeMap.get(key).orderCount += 1;
  }

  return {
    formula: 'Lấy đơn con đã gộp theo Ngày giao hàng trong đơn tổng/đơn con; không lấy theo ngày tạo đơn.',
    orders: rows,
    routes: Array.from(routeMap.values()),
    kpi: {
      totalOrders: rows.length,
      delivering: rows.filter((row) => row.visualStatus === 'delivering').length,
      delivered: rows.filter((row) => row.visualStatus === 'delivered').length,
      unpaid: rows.filter((row) => Number(row.debt || 0) > 0).length,
      late: rows.filter((row) => row.isLate).length
    }
  };
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

async function updateMasterOrder(id, body = {}) {
  const current = await masterOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  if (['cancelled', 'void'].includes(String(current.status || '').toLowerCase())) {
    return { error: 'Đơn tổng đã hủy/xóa, không thể cập nhật', status: 400 };
  }

  const deliveryStaff = await resolveStaff(body, 'delivery');
  const salesStaff = await resolveStaff(body, 'sales');
  const deliveryDate = String(body.deliveryDate || current.deliveryDate || body.date || current.date || today()).slice(0, 10);
  const updated = {
    ...current,
    ...body,
    date: String(body.date || current.date || deliveryDate).slice(0, 10),
    deliveryDate,
    routeName: String(body.routeName ?? current.routeName ?? '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || current.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || current.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || current.deliveryStaffName || '',
    salesStaffId: salesStaff?.id || body.salesStaffId || current.salesStaffId || '',
    salesStaffCode: salesStaff?.code || body.salesStaffCode || current.salesStaffCode || '',
    salesStaffName: salesStaff?.name || body.salesStaffName || current.salesStaffName || '',
    updatedAt: nowIso()
  };

  const children = await orderService.getMasterChildren(current);
  const summary = orderService.summarizeOrders(children);
  Object.assign(updated, summary);

  await withMongoTransaction(async (session) => {
    await masterOrderRepository.upsert(updated, { session });
    for (const child of children) {
      await orderRepository.upsert({
        ...child,
        deliveryDate: updated.deliveryDate,
        deliveryStaffId: updated.deliveryStaffId,
        deliveryStaffCode: updated.deliveryStaffCode,
        deliveryStaffName: updated.deliveryStaffName,
        routeName: updated.routeName,
        deliveryRoute: updated.routeName,
        updatedAt: nowIso()
      }, { session });
    }
  });
  const updatedChildren = await orderService.getMasterChildren(updated);
  return { masterOrder: toClient(updated, updatedChildren) };
}

async function cancelMasterOrder(id, body = {}) {
  const masterOrder = await masterOrderRepository.findByIdOrCode(id);
  if (!masterOrder) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(masterOrder);
  const cancelled = {
    ...masterOrder,
    status: 'cancelled',
    cancelReason: String(body.reason || body.cancelReason || '').trim(),
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

async function deleteMasterOrder(id, body = {}) {
  const current = await masterOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(current);
  const removed = {
    ...current,
    status: 'void',
    deletedAt: nowIso(),
    deleteReason: String(body.reason || body.deleteReason || '').trim(),
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
    await masterOrderRepository.upsert(removed, { session });
  });
  return { masterOrder: toClient(removed, []) };
}

module.exports = {
  listUnmergedChildOrders,
  listMasterOrders,
  listDeliveryToday,
  getMasterOrder,
  createMasterOrder,
  updateMasterOrder,
  cancelMasterOrder,
  deleteMasterOrder
};
