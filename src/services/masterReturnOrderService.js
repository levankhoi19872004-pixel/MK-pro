'use strict';

const dateUtil = require('../utils/date.util');
const queryGuard = require('../utils/queryGuard.util');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const masterReturnOrderRepository = require('../repositories/masterReturnOrderRepository');
const userRepository = require('../repositories/userRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const returnOrderService = require('./returnOrderService');


function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  const returnStatus = String(row.returnStatus || '').toLowerCase();
  return BLOCKED_RETURN_STATUSES.has(status) || BLOCKED_RETURN_STATUSES.has(returnStatus) || Boolean(row.deletedAt);
}

const GROUPABLE_RETURN_STATUSES = new Set([
  'active',
  'created',
  'pending',
  'has_return',
  'waiting_receive',
  'pending_warehouse_receive'
]);

const BLOCKED_RETURN_STATUSES = new Set([
  'cancelled',
  'canceled',
  'void',
  'deleted',
  'removed',
  'duplicate_cancelled',
  'cleared',
  'merged',
  'received',
  'completed'
]);

function getReturnOrderValue(row = {}) {
  return toNumber(row.debtReduction ?? row.totalAmount ?? row.amount ?? row.totalValue);
}

function hasPositiveReturnValue(row = {}) {
  return getReturnOrderValue(row) > 0;
}

function groupableReturnOrderMongoFilter(extra = {}) {
  return {
    ...extra,
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled', 'cleared'] },
    $or: [
      { masterReturnOrderId: { $exists: false } },
      { masterReturnOrderId: null },
      { masterReturnOrderId: '' },
      { masterReturnOrderCode: { $exists: false } },
      { masterReturnOrderCode: null },
      { masterReturnOrderCode: '' },
      { returnMergeStatus: { $ne: 'merged' } }
    ]
  };
}

function hasPositiveReturnItemsOrValue(row = {}) {
  const itemAmount = (Array.isArray(row.items) ? row.items : []).reduce((sum, item) => {
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice);
    const amount = qty > 0 && price > 0 ? qty * price : toNumber(item.returnAmount ?? item.amount);
    return sum + amount;
  }, 0);
  return itemAmount > 0 || hasPositiveReturnValue(row);
}

function isGroupableReturnStatus(row = {}) {
  const status = String(row?.status || '').toLowerCase();
  const returnStatus = String(row?.returnStatus || '').toLowerCase();
  const warehouseReceiveStatus = String(row?.warehouseReceiveStatus || '').toLowerCase();

  if (BLOCKED_RETURN_STATUSES.has(status) || BLOCKED_RETURN_STATUSES.has(returnStatus) || BLOCKED_RETURN_STATUSES.has(warehouseReceiveStatus)) {
    return false;
  }

  return GROUPABLE_RETURN_STATUSES.has(status)
    || GROUPABLE_RETURN_STATUSES.has(returnStatus)
    || GROUPABLE_RETURN_STATUSES.has(warehouseReceiveStatus)
    || (!status && !returnStatus && !warehouseReceiveStatus);
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
  const resolvedReturnDate = dateUtil.toDateOnly(
    masterReturnOrder.deliveryDate ||
    masterReturnOrder.returnDate ||
    masterReturnOrder.date ||
    masterReturnOrder.documentDate ||
    masterReturnOrder.createdAt
  );
  return {
    ...masterReturnOrder,
    id: masterReturnOrder.id || masterReturnOrder.code,
    code: masterReturnOrder.code || masterReturnOrder.id,
    returnDate: resolvedReturnDate,
    displayDate: resolvedReturnDate,
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
  const ids = Array.isArray(masterReturnOrder.returnOrderIds) ? masterReturnOrder.returnOrderIds.map(String).filter(Boolean) : [];
  if (!ids.length) return [];
  return returnOrderRepository.findAll({
    $or: [
      { id: { $in: ids } },
      { code: { $in: ids } }
    ]
  }, { sort: { createdAt: 1 }, limit: Math.max(ids.length, 1) });
}

async function listUnmergedReturnOrders(query = {}) {
  const q = normalizeText(query.q);
  const date = dateUtil.toDateOnly(query.date || query.returnDate);
  const delivery = normalizeText(query.delivery || query.deliveryStaff);
  const filter = groupableReturnOrderMongoFilter();
  if (date) {
    filter.$and = [{ $or: [{ deliveryDate: date }, { date }, { documentDate: date }, { returnDate: date }] }];
  }
  const rows = await returnOrderRepository.findAll(filter, { sort: { createdAt: -1, code: -1 }, limit: 500 });
  return rows
    .filter((row) => !isInactiveStatus(row))
    .filter((row) => isGroupableReturnStatus(row))
    .filter((row) => hasPositiveReturnItemsOrValue(row))
    .filter((row) => (row.returnMergeStatus || 'unmerged') !== 'merged' && !row.masterReturnOrderId && !row.masterReturnOrderCode)
    .filter((row) => !delivery || [row.deliveryStaffCode, row.deliveryStaffName, row.staffCode, row.staffName].some((value) => normalizeText(value).includes(delivery)))
    .filter((row) => !q || [row.code, row.customerCode, row.customerName, row.salesOrderCode, row.orderCode, row.note].some((value) => normalizeText(value).includes(q)))
    .map((row) => ({
      ...row,
      returnDate: dateUtil.toDateOnly(row.deliveryDate || row.returnDate || row.date || row.documentDate || row.createdAt),
      displayDate: dateUtil.toDateOnly(row.deliveryDate || row.returnDate || row.date || row.documentDate || row.createdAt)
    }));
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

  const children = await returnOrderRepository.findAll({
    ...groupableReturnOrderMongoFilter(),
    $and: [
      { $or: [{ id: { $in: returnOrderIds } }, { code: { $in: returnOrderIds } }] }
    ]
  }, { limit: Math.max(returnOrderIds.length, 1) });
  if (children.length !== returnOrderIds.length) return { error: 'Một số phiếu trả hàng không tồn tại', status: 400 };
  if (children.some((row) => isInactiveStatus(row))) return { error: 'Có phiếu trả hàng đã hủy/xóa', status: 400 };
  if (children.some((row) => !isGroupableReturnStatus(row))) {
    return { error: 'Chỉ được gộp phiếu trả hàng có trạng thái đã phát sinh/chờ kho nhận', status: 400 };
  }
  if (children.some((row) => !hasPositiveReturnValue(row))) {
    return { error: 'Không được gộp phiếu trả hàng có giá trị bằng 0', status: 400 };
  }
  if (children.some((row) => row.masterReturnOrderId || row.masterReturnOrderCode || (row.returnMergeStatus || 'unmerged') === 'merged')) {
    return { error: 'Có phiếu trả hàng đã được gộp trước đó', status: 400 };
  }

  const existing = await masterReturnOrderRepository.findAll();
  const deliveryStaff = await resolveDeliveryStaff(body);
  const first = children[0] || {};
  const returnDate = dateUtil.toDateOnly(body.returnDate || body.date || first.date || dateUtil.todayVN());
  const summary = summarizeReturnOrders(children);
  const masterReturnOrder = {
    // V46 rule: masterReturnOrders stores header + returnOrderIds only.
    // Do not copy return order items/children/returnOrders into the master document.
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
    createdAt: body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  delete masterReturnOrder.items;
  delete masterReturnOrder.children;
  delete masterReturnOrder.returnOrders;
  delete masterReturnOrder.returnItems;

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
        updatedAt: dateUtil.nowIso()
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
    returnDate: dateUtil.toDateOnly(body.returnDate || body.date || current.returnDate || current.date || dateUtil.todayVN()),
    date: dateUtil.toDateOnly(body.date || current.date || body.returnDate || current.returnDate || dateUtil.todayVN()),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || current.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || current.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || current.deliveryStaffName || '',
    note: String(body.note ?? current.note ?? '').trim(),
    status: String(body.status === 'received' ? current.status : (body.status || current.status || 'pending_warehouse_receive')).trim(),
    ...summarizeReturnOrders(children),
    updatedAt: dateUtil.nowIso()
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
        updatedAt: dateUtil.nowIso()
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
    receivedAt: dateUtil.nowIso(),
    stockPostedAt: dateUtil.nowIso(),
    receivedBy: String(body.receivedBy || '').trim(),
    stockPostedBy: String(body.receivedBy || '').trim(),
    updatedAt: dateUtil.nowIso(),
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
        updatedAt: dateUtil.nowIso()
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
    cancelledAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await withMongoTransaction(async (session) => {
    for (const child of children) {
      await returnOrderRepository.upsert({
        ...child,
        masterReturnOrderId: '',
        masterReturnOrderCode: '',
        returnMergeStatus: 'unmerged',
        warehouseReceiveStatus: '',
        updatedAt: dateUtil.nowIso()
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
