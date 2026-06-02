'use strict';

const dateUtil = require('../utils/date.util');
const queryGuard = require('../utils/queryGuard.util');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const masterReturnOrderRepository = require('../repositories/masterReturnOrderRepository');
const userRepository = require('../repositories/userRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const returnOrderService = require('./returnOrderService');

function today() { return dateUtil.todayVN(); }
function nowIso() { return new Date().toISOString(); }

function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(row.deletedAt);
}

function buildMasterReturnCode(existingRows = []) {
  const max = existingRows.reduce((result, row) => {
    const match = String(row.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `DTH${String(max + 1).padStart(5, '0')}`;
}

async function resolveDeliveryStaff(body = {}) {
  const value = String(body.deliveryStaffId || body.deliveryStaffCode || body.deliveryStaffName || '').trim();
  if (!value) return null;
  return userRepository.findStaffByIdOrCode(value);
}

function toClient(masterReturnOrder, children = []) {
  return {
    ...masterReturnOrder,
    id: masterReturnOrder.id || masterReturnOrder.code,
    code: masterReturnOrder.code || masterReturnOrder.id,
    children,
    returnOrderIds: Array.isArray(masterReturnOrder.returnOrderIds)
      ? masterReturnOrder.returnOrderIds
      : children.map((row) => row.id || row.code)
  };
}

function summarizeReturnOrders(returnOrders = []) {
  return {
    returnCount: returnOrders.length,
    totalQuantity: returnOrders.reduce((sum, row) => sum + toNumber(row.totalQuantity), 0),
    totalAmount: returnOrders.reduce((sum, row) => sum + toNumber(row.totalAmount ?? row.amount), 0),
    debtReduction: returnOrders.reduce((sum, row) => sum + toNumber(row.debtReduction ?? row.totalAmount ?? row.amount), 0)
  };
}

async function getChildren(masterReturnOrder = {}) {
  const ids = Array.isArray(masterReturnOrder.returnOrderIds) ? masterReturnOrder.returnOrderIds.map(String) : [];
  if (!ids.length) return [];
  const all = await returnOrderRepository.findAll();
  return all.filter((row) => ids.includes(String(row.id)) || ids.includes(String(row.code)));
}

async function listUnmergedReturnOrders(query = {}) {
  const q = normalizeText(query.q);
  const date = dateUtil.toDateOnly(query.date || query.returnDate);
  const delivery = normalizeText(query.delivery || query.deliveryStaff);
  const rows = await returnOrderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return rows
    .filter((row) => !isInactiveStatus(row))
    .filter((row) => ['waiting_receive', 'pending_warehouse_receive', 'pending'].includes(String(row.status || 'waiting_receive').toLowerCase()))
    .filter((row) => (row.returnMergeStatus || 'unmerged') !== 'merged' && !row.masterReturnOrderId && !row.masterReturnOrderCode)
    .filter((row) => !date || dateUtil.toDateOnly(row.date || row.documentDate || row.createdAt) === date)
    .filter((row) => !delivery || [row.deliveryStaffCode, row.deliveryStaffName, row.staffCode, row.staffName].some((value) => normalizeText(value).includes(delivery)))
    .filter((row) => !q || [row.code, row.customerCode, row.customerName, row.salesOrderCode, row.orderCode, row.note].some((value) => normalizeText(value).includes(q)));
}

async function listMasterReturnOrders(query = {}) {
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const page = queryGuard.getPagination(guardedQuery);
  const q = normalizeText(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo);
  const delivery = normalizeText(guardedQuery.delivery || guardedQuery.deliveryStaff);
  const excludeInactive = String(guardedQuery.excludeInactive ?? '0') !== '0';

  const filter = {};
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    filter.$or = [{ returnDate: range }, { date: range }];
  }
  if (excludeInactive) filter.status = { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed'] };
  if (delivery || q) {
    const clauses = [];
    if (delivery) {
      const rx = queryGuard.buildRegex(guardedQuery.delivery || guardedQuery.deliveryStaff);
      clauses.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }] });
    }
    if (q) {
      const rx = queryGuard.buildRegex(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
      clauses.push({ $or: [{ code: rx }, { deliveryStaffCode: rx }, { deliveryStaffName: rx }, { routeName: rx }, { note: rx }] });
    }
    if (clauses.length) filter.$and = clauses;
  }

  const rows = await masterReturnOrderRepository.findAll(filter, { sort: { createdAt: -1, code: -1 }, skip: page.skip, limit: page.limit });
  const result = [];
  for (const row of rows) {
    const children = await getChildren(row);
    result.push(toClient(row, children));
  }
  return result;
}

async function getMasterReturnOrder(id) {
  const masterReturnOrder = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!masterReturnOrder) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  const children = await getChildren(masterReturnOrder);
  return { masterReturnOrder: toClient(masterReturnOrder, children) };
}

async function createMasterReturnOrder(body = {}) {
  const returnOrderIds = Array.isArray(body.returnOrderIds) ? body.returnOrderIds.map(String) : [];
  if (!returnOrderIds.length) return { error: 'Chưa chọn phiếu trả hàng để gộp', status: 400 };

  const allReturnOrders = await returnOrderRepository.findAll();
  const children = allReturnOrders.filter((row) => returnOrderIds.includes(String(row.id)) || returnOrderIds.includes(String(row.code)));
  if (children.length !== returnOrderIds.length) return { error: 'Một số phiếu trả hàng không tồn tại', status: 400 };
  if (children.some((row) => isInactiveStatus(row))) return { error: 'Có phiếu trả hàng đã hủy/xóa', status: 400 };
  if (children.some((row) => !['waiting_receive', 'pending_warehouse_receive', 'pending'].includes(String(row.status || 'waiting_receive').toLowerCase()))) {
    return { error: 'Chỉ được gộp phiếu trả hàng đang chờ kho nhận', status: 400 };
  }
  if (children.some((row) => row.masterReturnOrderId || row.masterReturnOrderCode || (row.returnMergeStatus || 'unmerged') === 'merged')) {
    return { error: 'Có phiếu trả hàng đã được gộp trước đó', status: 400 };
  }

  const existing = await masterReturnOrderRepository.findAll();
  const deliveryStaff = await resolveDeliveryStaff(body);
  const first = children[0] || {};
  const returnDate = dateUtil.toDateOnly(body.returnDate || body.date || first.date || today());
  const summary = summarizeReturnOrders(children);
  const masterReturnOrder = {
    ...body,
    id: String(body.id || makeId('MRO')).trim(),
    code: String(body.code || buildMasterReturnCode(existing)).trim(),
    date: dateUtil.toDateOnly(body.date || returnDate),
    returnDate,
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || first.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || first.deliveryStaffCode || first.staffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || first.deliveryStaffName || first.staffName || '',
    returnOrderIds: children.map((row) => row.id || row.code),
    status: body.status || 'pending_warehouse_receive',
    note: String(body.note || '').trim(),
    source: body.source || 'master_return_order_route',
    ...summary,
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await withMongoTransaction(async (session) => {
    await masterReturnOrderRepository.upsert(masterReturnOrder, { session });
    for (const child of children) {
      await returnOrderRepository.upsert({
        ...child,
        masterReturnOrderId: masterReturnOrder.id,
        masterReturnOrderCode: masterReturnOrder.code,
        returnMergeStatus: 'merged',
        warehouseReceiveStatus: masterReturnOrder.status,
        deliveryStaffId: masterReturnOrder.deliveryStaffId,
        deliveryStaffCode: masterReturnOrder.deliveryStaffCode,
        deliveryStaffName: masterReturnOrder.deliveryStaffName,
        updatedAt: nowIso()
      }, { session });
    }
  });

  const updatedChildren = await getChildren(masterReturnOrder);
  return { masterReturnOrder: toClient(masterReturnOrder, updatedChildren) };
}

async function updateMasterReturnOrder(id, body = {}) {
  const current = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn tổng trả hàng đã hủy/xóa, không thể cập nhật', status: 400 };
  const children = await getChildren(current);
  const deliveryStaff = await resolveDeliveryStaff({ ...current, ...body });
  const updated = {
    ...current,
    ...body,
    returnDate: dateUtil.toDateOnly(body.returnDate || body.date || current.returnDate || current.date || today()),
    date: dateUtil.toDateOnly(body.date || current.date || body.returnDate || current.returnDate || today()),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || current.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || current.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || current.deliveryStaffName || '',
    note: String(body.note ?? current.note ?? '').trim(),
    status: String(body.status === 'received' ? current.status : (body.status || current.status || 'pending_warehouse_receive')).trim(),
    ...summarizeReturnOrders(children),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await masterReturnOrderRepository.upsert(updated, { session });
    for (const child of children) {
      await returnOrderRepository.upsert({
        ...child,
        deliveryStaffId: updated.deliveryStaffId,
        deliveryStaffCode: updated.deliveryStaffCode,
        deliveryStaffName: updated.deliveryStaffName,
        warehouseReceiveStatus: updated.status,
        updatedAt: nowIso()
      }, { session });
    }
  });
  return { masterReturnOrder: toClient(updated, children) };
}


async function confirmReceiveMasterReturnOrder(id, body = {}) {
  const current = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn tổng trả hàng đã hủy/xóa, không thể nhập kho', status: 400 };
  if (String(current.status || '').toLowerCase() === 'received') {
    const children = await getChildren(current);
    return { masterReturnOrder: toClient(current, children), alreadyReceived: true };
  }

  const children = await getChildren(current);
  if (!children.length) return { error: 'Đơn tổng trả hàng chưa có phiếu trả hàng con', status: 400 };

  for (const child of children) {
    const result = await returnOrderService.confirmReceiveReturnOrder(child.id || child.code);
    if (result && result.error) return result;
  }

  const receivedChildren = await getChildren(current);
  const received = {
    ...current,
    status: 'received',
    warehouseReceiveStatus: 'received',
    stockReceiveStatus: 'posted',
    stockPosted: true,
    receivedAt: nowIso(),
    stockPostedAt: nowIso(),
    receivedBy: String(body.receivedBy || '').trim(),
    stockPostedBy: String(body.receivedBy || '').trim(),
    updatedAt: nowIso(),
    ...summarizeReturnOrders(receivedChildren)
  };

  await withMongoTransaction(async (session) => {
    await masterReturnOrderRepository.upsert(received, { session });
    for (const child of receivedChildren) {
      await returnOrderRepository.upsert({
        ...child,
        status: 'received',
        warehouseReceiveStatus: 'received',
        returnMergeStatus: 'merged',
        masterReturnOrderId: received.id,
        masterReturnOrderCode: received.code,
        updatedAt: nowIso()
      }, { session });
    }
  });

  const finalChildren = await getChildren(received);
  return { masterReturnOrder: toClient(received, finalChildren), alreadyReceived: false };
}

async function cancelMasterReturnOrder(id, body = {}) {
  const current = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  if (String(current.status || '').toLowerCase() === 'received' || String(current.warehouseReceiveStatus || '').toLowerCase() === 'received' || current.stockPosted) {
    return { error: 'Đơn tổng trả hàng đã nhập kho, không được hủy gộp trực tiếp. Muốn sửa phải tạo phiếu điều chỉnh/đảo kho riêng.', status: 400 };
  }
  const children = await getChildren(current);
  const cancelled = {
    ...current,
    status: 'cancelled',
    cancelReason: String(body.reason || body.cancelReason || '').trim(),
    cancelledAt: nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    for (const child of children) {
      await returnOrderRepository.upsert({
        ...child,
        masterReturnOrderId: '',
        masterReturnOrderCode: '',
        returnMergeStatus: 'unmerged',
        warehouseReceiveStatus: '',
        updatedAt: nowIso()
      }, { session });
    }
    await masterReturnOrderRepository.upsert(cancelled, { session });
  });
  return { masterReturnOrder: toClient(cancelled, []) };
}

module.exports = {
  listUnmergedReturnOrders,
  listMasterReturnOrders,
  getMasterReturnOrder,
  createMasterReturnOrder,
  updateMasterReturnOrder,
  confirmReceiveMasterReturnOrder,
  cancelMasterReturnOrder
};
