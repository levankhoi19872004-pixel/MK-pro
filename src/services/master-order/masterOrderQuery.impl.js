'use strict';

const dateUtil = require('../../utils/date.util');
const queryGuard = require('../../utils/queryGuard.util');
const orderRepository = require('../../repositories/orderRepository');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const userRepository = require('../../repositories/userRepository');
const orderService = require('../orderService');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const { normalizeOrderSourceValue } = require('../../utils/orderSource.util');
const {
  compactDeliveryOrderKeys,
  normalizeSalesOrderIds,
  buildSalesOrderIdInQuery,
  normalizeMasterSalesOrderRefs,
  masterChildOrderRefs,
  buildIdentityInFilter
} = require('./masterOrderIdentity.util');


const MASTER_CHILD_ORDER_PROJECTION = [
  'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt',
  'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus', 'totalAmount', 'subtotal', 'discountAmount',
  'finalAmount', 'payableAmount', 'debtAmount', 'debt', 'cashAmount', 'bankAmount', 'rewardAmount',
  'returnAmount', 'items', 'lines', 'products', 'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode'
].join(' ');

function boundedBatchSize(value, fallback, { allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const minimum = allowZero ? 0 : 1;
  return Math.min(Math.max(Math.trunc(number), minimum), 500);
}

async function buildMasterChildrenMapFast(masterOrders = [], options = {}) {
  const allRefs = [...new Set((masterOrders || []).flatMap(masterChildOrderRefs))];
  const map = new Map();
  if (!allRefs.length) return map;

  const identityBatchSize = boundedBatchSize(options.identityBatchSize, 0, { allowZero: true });
  const orders = [];
  if (identityBatchSize) {
    for (let offset = 0; offset < allRefs.length; offset += identityBatchSize) {
      const batch = await orderRepository.findManyByIdentity(allRefs.slice(offset, offset + identityBatchSize), { projection: MASTER_CHILD_ORDER_PROJECTION });
      orders.push(...batch);
    }
  } else {
    const salesOrderIds = normalizeSalesOrderIds(allRefs);
    if (!salesOrderIds.length) return map;
    orders.push(...await orderRepository.findAll(buildSalesOrderIdInQuery(salesOrderIds), { projection: MASTER_CHILD_ORDER_PROJECTION }));
  }
  const byKey = new Map();
  for (const order of orders || []) {
    if (isInactiveStatus(order)) continue;
    for (const key of compactDeliveryOrderKeys(order)) byKey.set(key, order);
  }

  for (const master of masterOrders || []) {
    const children = [];
    const used = new Set();
    for (const ref of masterChildOrderRefs(master)) {
      const child = byKey.get(ref);
      const childKey = child ? String(child.id || child.code || ref) : '';
      if (!child || used.has(childKey)) continue;
      used.add(childKey);
      children.push(child);
    }
    map.set(String(master.id || master.code || ''), children);
  }
  return map;
}

function buildMasterOrderCode(existingMasterOrders = []) {
  const max = existingMasterOrders.reduce((result, order) => {
    const match = String(order.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `DT${String(max + 1).padStart(5, '0')}`;
}

async function resolveStaff(body = {}, prefix = 'delivery') {
  const value = String(body[`${prefix}StaffCode`] || '').trim();
  if (!value) return null;
  return userRepository.findBusinessStaffByCode(value);
}

function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'].includes(status) || Boolean(row.deletedAt);
}

function toClient(masterOrder, children = []) {
  const summary = orderService.summarizeOrders(children);
  return {
    ...masterOrder,
    ...summary,
    id: masterOrder.id || masterOrder.code,
    code: masterOrder.code || masterOrder.id,
    // MASTER_ORDER_SEARCH_NOTE_PATCH_START: chuẩn hóa field ghi chú để backend tìm đúng nội dung đang render
    note: masterOrder.note || masterOrder.notes || masterOrder.deliveryNote || masterOrder.remark || masterOrder.description || '',
    // MASTER_ORDER_SEARCH_NOTE_PATCH_END
    // children chỉ là dữ liệu render tạm lấy từ orders thật. Không coi masterOrder.children là nguồn dữ liệu.
    children,
    childOrderIds: normalizeSalesOrderIds(children.map((order) => order.id))
  };
}

async function getMasterOrder(id) {
  const masterOrder = await masterOrderRepository.findByIdOrCode(id);
  if (!masterOrder) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(masterOrder);
  return { masterOrder: toClient(masterOrder, children) };
}

async function getMasterOrders(ids = [], options = {}) {
  const requestedIds = [...new Set((Array.isArray(ids) ? ids : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!requestedIds.length) return [];

  const batchSize = boundedBatchSize(options.batchSize, 250);
  const masterByIdentity = new Map();
  const uniqueMasters = new Map();
  for (let offset = 0; offset < requestedIds.length; offset += batchSize) {
    const matches = await masterOrderRepository.findManyByIdentityMatches(
      requestedIds.slice(offset, offset + batchSize)
    );
    for (const match of matches) {
      const masterOrder = match?.masterOrder;
      if (!masterOrder) continue;
      for (const key of match.identityKeys || []) {
        if (!masterByIdentity.has(key)) masterByIdentity.set(key, masterOrder);
      }
      const masterKey = String(masterOrder.id || masterOrder.code || match.identityKeys?.[0] || '').trim();
      if (masterKey && !uniqueMasters.has(masterKey)) uniqueMasters.set(masterKey, masterOrder);
    }
  }

  const masters = [...uniqueMasters.values()];
  const childrenMap = await buildMasterChildrenMapFast(masters, {
    identityBatchSize: boundedBatchSize(options.childBatchSize, 250)
  });
  return requestedIds.map((id) => {
    const masterOrder = masterByIdentity.get(id);
    if (!masterOrder) return null;
    const masterKey = String(masterOrder.id || masterOrder.code || '').trim();
    return toClient(masterOrder, childrenMap.get(masterKey) || []);
  }).filter(Boolean);
}

function normalizeOrderDateForMaster(value) {
  return dateUtil.toDateOnly(value);
}

function orderDeliveryFilterDate(order = {}) {
  // Màn "Đơn con chưa gộp" đang hiển thị ngày đơn bán (order.date),
  // vì vậy bộ lọc ngày cũng phải bám theo ngày đơn bán.
  // Không ưu tiên deliveryDate ở đây, tránh trường hợp lọc ngày giao 02/06
  // nhưng lại hiển thị đơn có date 01/06.
  return normalizeOrderDateForMaster(order.date || order.orderDate || '');
}

function normalizeOrderSourceForMaster(order = {}) {
  return normalizeOrderSourceValue(order).toLowerCase();
}

function isUnmergedChildOrder(order = {}) {
  if (isInactiveStatus(order)) return false;
  const mergeStatus = String(order.mergeStatus || 'unmerged').toLowerCase();
  if (['merged', 'mastered', 'grouped'].includes(mergeStatus)) return false;
  return !(order.masterOrderId || order.masterOrderCode || order.masterOrderNo);
}

async function listUnmergedChildOrders(query = {}) {
  const q = normalizeText(query.q);
  const source = normalizeText(query.source);
  const sourceKey = source.includes('dms') ? 'dms' : (source ? 'nvbh' : '');
  const salesStaff = normalizeText(query.salesStaff || query.salesStaffCode || query.staffCode);
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const dateFrom = normalizeOrderDateForMaster(guardedQuery.dateFrom);
  const dateTo = normalizeOrderDateForMaster(guardedQuery.dateTo);
  const requestedLimit = Math.min(Math.max(Number(guardedQuery.limit || 2000), 1), 5000);
  // Màn Đơn con chưa gộp phải lấy đủ dữ liệu để người dùng tìm/checkbox được đơn ngoài 50 dòng đầu.
  // orderService mặc định chặn limit 100 cho danh sách thường, nên truyền __internalMaxLimit riêng cho luồng nội bộ này.
  // Đồng thời đẩy mã NVBH xuống orderService để Mongo lọc trước khi limit, tránh lấy 50/100 đơn đầu rồi mới lọc làm mất đơn cần tìm.
  // Không truyền source/orderSource xuống orderService vì orderService cũng lọc nguồn; màn Đơn tổng tự lọc nguồn sau để không làm mất đơn SO/NVBH.
  const orders = await orderService.listOrders({
    ...guardedQuery,
    source: '',
    orderSource: '',
    salesStaffCode: salesStaff || guardedQuery.salesStaffCode || guardedQuery.salesmanCode || guardedQuery.nvbhCode || '',
    excludeInactive: 1,
    page: 1,
    limit: requestedLimit,
    __internalMaxLimit: 5000
  });
  return orders
    .filter(isUnmergedChildOrder)
    .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.customerPhone, order.customerAddress].some((value) => normalizeText(value).includes(q)))
    .filter((order) => !sourceKey || normalizeOrderSourceForMaster(order) === sourceKey)
    .filter((order) => {
      const orderDate = orderDeliveryFilterDate(order);
      if (!orderDate) return false;
      if (dateFrom && orderDate < dateFrom) return false;
      if (dateTo && orderDate > dateTo) return false;
      return true;
    })
    .filter((order) => !salesStaff || [order.salesStaffCode, order.salesStaffName, order.salesmanCode, order.salesmanName, order.nvbhCode, order.nvbhName].some((value) => normalizeText(value).includes(salesStaff)));
}

async function listMasterOrders(query = {}) {
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const page = queryGuard.getPagination(guardedQuery);
  const q = normalizeText(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo);
  const excludeInactive = String(guardedQuery.excludeInactive ?? '0') !== '0';

  const filter = {};
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    filter.$or = [{ date: range }, { deliveryDate: range }];
  }
  if (excludeInactive) filter.status = { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] };
  if (q) {
    const rx = queryGuard.buildRegex(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
    filter.$and = filter.$and || [];
    // MASTER_ORDER_SEARCH_NOTE_PATCH_START: mở rộng tìm kiếm đơn tổng sang các trường ghi chú đang hiển thị
    filter.$and.push({ $or: [
      { code: rx },
      { id: rx },
      { routeName: rx },
      { deliveryStaffName: rx },
      { deliveryStaffCode: rx },
      { staffCode: rx },
      { staffName: rx },
      { note: rx },
      { notes: rx },
      { deliveryNote: rx },
      { remark: rx },
      { description: rx }
    ] });
    // MASTER_ORDER_SEARCH_NOTE_PATCH_END
  }

  const masterOrders = await masterOrderRepository.findAll(filter, { sort: { createdAt: -1, code: -1 }, skip: page.skip, limit: page.limit });

  // Tối ưu hiệu năng: không gọi getMasterChildren() trong vòng for vì sẽ tạo N+1 query.
  // buildMasterChildrenMapFast() gom toàn bộ childOrderIds của trang hiện tại và chỉ query orders một lần.
  const childrenMap = await buildMasterChildrenMapFast(masterOrders);

  const result = [];
  for (const masterOrder of masterOrders) {
    const masterKey = String(masterOrder.id || masterOrder.code || '').trim();
    const children = childrenMap.get(masterKey) || [];
    const order = toClient(masterOrder, children);
    const d = dateUtil.toDateOnly(order.deliveryDate || order.date);
    if (excludeInactive && isInactiveStatus(order)) continue;
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    result.push(order);
  }
  return result;
}

module.exports = {
  buildMasterChildrenMapFast,
  buildMasterOrderCode,
  resolveStaff,
  isInactiveStatus,
  toClient,
  getMasterOrder,
  getMasterOrders,
  normalizeOrderDateForMaster,
  orderDeliveryFilterDate,
  normalizeOrderSourceForMaster,
  isUnmergedChildOrder,
  listUnmergedChildOrders,
  listMasterOrders
};
