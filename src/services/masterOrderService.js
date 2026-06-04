'use strict';

const deliveryFinance = require('../utils/deliveryFinance.util');

const dateUtil = require('../utils/date.util');
const queryGuard = require('../utils/queryGuard.util');
const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const userRepository = require('../repositories/userRepository');
const customerRepository = require('../repositories/customerRepository');
const orderService = require('./orderService');
const returnOrderService = require('./returnOrderService');
const reportService = require('./reportService');
const postingEngine = require('../engines/posting.engine');
const paymentRepository = require('../repositories/paymentRepository');
const MongoStore = require('../models');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const { normalizeOrderSourceValue } = require('../utils/orderSource.util');
const Product = require('../models/Product');




function compactDeliveryOrderKeys(order = {}) {
  return [order.id, order._id, order.code, order.orderCode, order.documentCode, order.salesOrderId, order.salesOrderCode, order.sourceOrderId, order.sourceOrderCode, order.deliveryOrderId, order.deliveryOrderCode, order.masterOrderId, order.masterOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

const VALID_SALES_ORDER_ID_RE = /^SO\d+$/i;

function isCleanOrderCode(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/[\u0000-\u001F\u007F\uFFFD]/.test(text)) return false;
  return text.length <= 80;
}

function pushMasterSalesOrderRef(acc, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => pushMasterSalesOrderRef(acc, item));
    return acc;
  }

  if (value && typeof value === 'object') {
    [
      value.id,
      value._id,
      value.salesOrderId,
      value.orderId,
      value.sourceOrderId,
      value.deliveryOrderId
    ].forEach((item) => {
      const text = String(item || '').trim();
      if (VALID_SALES_ORDER_ID_RE.test(text)) acc.salesOrderIds.push(text);
    });

    [
      value.code,
      value.orderCode,
      value.documentCode,
      value.invoiceCode,
      value.salesOrderCode,
      value.sourceOrderCode,
      value.deliveryOrderCode
    ].forEach((item) => {
      const text = String(item || '').trim();
      if (isCleanOrderCode(text)) acc.salesOrderCodes.push(text);
    });

    return acc;
  }

  const text = String(value || '').trim();
  if (!text) return acc;
  if (VALID_SALES_ORDER_ID_RE.test(text)) acc.salesOrderIds.push(text);
  else if (isCleanOrderCode(text)) acc.salesOrderCodes.push(text);
  return acc;
}

function normalizeMasterSalesOrderRefs(masterOrder = {}) {
  const acc = {
    salesOrderIds: [],
    salesOrderCodes: []
  };

  [
    masterOrder.children,
    masterOrder.childOrders,
    masterOrder.orderIds,
    masterOrder.childOrderIds,
    masterOrder.salesOrderIds,
    masterOrder.salesOrders,
    masterOrder.orderCodes,
    masterOrder.salesOrderCodes
  ].forEach((value) => pushMasterSalesOrderRef(acc, value));

  const salesOrderIds = [...new Set(acc.salesOrderIds.filter((value) => VALID_SALES_ORDER_ID_RE.test(String(value || '').trim())))];
  const salesOrderCodes = [...new Set(acc.salesOrderCodes.filter(isCleanOrderCode))];

  return {
    summary,

    salesOrderIds,
    salesOrderCodes,
    refs: [...new Set([...salesOrderIds, ...salesOrderCodes])]
  };
}

function masterChildOrderRefs(masterOrder = {}) {
  return normalizeMasterSalesOrderRefs(masterOrder).refs;
}

function buildIdentityInFilter(keys = [], fields = ['id', 'code']) {
  const values = [...new Set((keys || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!values.length) return null;
  return { $or: fields.map((field) => ({ [field]: { $in: values } })) };
}

async function buildMasterChildrenMapFast(masterOrders = []) {
  const allRefs = [...new Set((masterOrders || []).flatMap(masterChildOrderRefs))];
  const map = new Map();
  if (!allRefs.length) return map;

  const filter = buildIdentityInFilter(allRefs, ['id', 'code', 'orderCode', 'documentCode']);
  const orders = filter ? await orderRepository.findAll(filter) : [];
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

async function findReturnOrdersForDeliveryChildren(children = []) {
  const keys = [...new Set((children || []).flatMap(compactDeliveryOrderKeys))];
  if (!keys.length) return [];
  const filter = buildIdentityInFilter(keys, [
    'salesOrderId',
    'salesOrderCode',
    'orderId',
    'orderCode',
    'sourceOrderId',
    'sourceOrderCode',
    'deliveryOrderId',
    'deliveryOrderCode',
    'masterOrderId',
    'masterOrderCode'
  ]);
  if (!filter) return [];
  // Chỉ lấy returnOrders liên quan đến các đơn đang hiển thị. Tuyệt đối không findAll() toàn bộ.
  return returnOrderRepository.findAll(filter, {
    projection: {
      id: 1, code: 1, salesOrderId: 1, salesOrderCode: 1, orderId: 1, orderCode: 1,
      sourceOrderId: 1, sourceOrderCode: 1, deliveryOrderId: 1, deliveryOrderCode: 1,
      masterOrderId: 1, masterOrderCode: 1, masterReturnOrderId: 1, masterReturnOrderCode: 1,
      customerCode: 1, customerName: 1, totalAmount: 1, returnAmount: 1, amount: 1, debtReduction: 1,
      items: 1, status: 1, returnMergeStatus: 1, warehouseReceiveStatus: 1,
      deliveryDate: 1, deliveryStaffCode: 1, deliveryStaffName: 1
    }
  });
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


function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(row.deletedAt);
}

function toClient(masterOrder, children = []) {
  const summary = orderService.summarizeOrders(children);
  return {
    ...masterOrder,
    ...summary,
    id: masterOrder.id || masterOrder.code,
    code: masterOrder.code || masterOrder.id,
    // children chỉ là dữ liệu render tạm lấy từ orders thật. Không coi masterOrder.children là nguồn dữ liệu.
    children,
    childOrderIds: children.map((order) => order.id || order.code).filter(Boolean)
  };
}

async function getMasterOrder(id) {
  const masterOrder = await masterOrderRepository.findByIdOrCode(id);
  if (!masterOrder) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(masterOrder);
  return { masterOrder: toClient(masterOrder, children) };
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
    salesStaffCode: salesStaff || guardedQuery.salesStaffCode || guardedQuery.staffCode || '',
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
    .filter((order) => !salesStaff || [order.staffCode, order.staffName, order.salesStaffCode, order.salesStaffName].some((value) => normalizeText(value).includes(salesStaff)));
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
  if (excludeInactive) filter.status = { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed'] };
  if (q) {
    const rx = queryGuard.buildRegex(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: [
      { code: rx },
      { id: rx },
      { routeName: rx },
      { deliveryStaffName: rx },
      { deliveryStaffCode: rx },
      { staffCode: rx },
      { staffName: rx }
    ] });
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





function buildDeliveryAmount(order = {}, returnAmountFromReturnOrders = null) {
  const totalReceivable = Math.max(0, normalizeDebtAmount(Math.round(deliveryFinance.deliveryDebtBase(order))));
  const cashAmount = Math.max(0, normalizeDebtAmount(Math.round(toNumber(order.cashCollected ?? order.cashAmount ?? 0))));
  const bankAmount = Math.max(0, normalizeDebtAmount(Math.round(toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0))));
  const bonusAmount = Math.max(0, normalizeDebtAmount(Math.round(deliveryRewardAmount(order))));
  const returnAmount = Math.max(0, normalizeDebtAmount(Math.round(returnAmountFromReturnOrders == null ? deliveryFinance.deliveryReturnAmount(order) : toNumber(returnAmountFromReturnOrders))));
  const debtAmount = Math.max(0, normalizeDebtAmount(Math.round(totalReceivable - cashAmount - bankAmount - bonusAmount - returnAmount)));
  return {
    totalReceivable,
    cashAmount,
    bankAmount,
    bonusAmount,
    rewardAmount: bonusAmount,
    returnAmount,
    debtAmount,
    remainingAmount: debtAmount,
    collectedAmount: cashAmount + bankAmount + bonusAmount + returnAmount
  };
}

function deliveryRewardAmount(order = {}) {
  return toNumber(order.rewardAmount ?? order.displayRewardAmount ?? order.bonusReturnAmount ?? 0);
}

function isActiveReturnOrder(row = {}) {
  const status = String(row.status || '').toLowerCase();
  const warehouseStatus = String(row.warehouseReceiveStatus || '').toLowerCase();
  // cleared cũng không được tính vào TH vì đây là phiếu đã xóa hết hàng trả.
  return !['cancelled', 'canceled', 'void', 'deleted', 'removed', 'cleared'].includes(status)
    && !['cancelled', 'canceled', 'void', 'deleted', 'removed', 'cleared'].includes(warehouseStatus);
}

function returnOrderTotalAmount(row = {}) {
  const explicit = toNumber(row.totalReturnAmount ?? row.totalAmount ?? row.amount ?? row.debtReduction ?? row.returnAmount ?? row.returnedAmount);
  if (explicit > 0) return explicit;
  return (Array.isArray(row.items) ? row.items : []).reduce((sum, item) => {
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
    const amount = toNumber(item.returnAmount ?? item.amount ?? NaN);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : Math.round(qty * price));
  }, 0);
}

function returnAmountForSalesOrder(returnOrders = [], order = {}) {
  const orderId = String(order.id || '').trim();
  const orderCode = String(order.code || '').trim();
  return returnOrders
    .filter(isActiveReturnOrder)
    .filter((row) => {
      const rowOrderId = String(row.salesOrderId || row.orderId || row.sourceOrderId || row.deliveryOrderId || '').trim();
      const rowOrderCode = String(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.deliveryOrderCode || '').trim();
      const rowMasterId = String(row.masterOrderId || row.masterDeliveryOrderId || '').trim();
      const rowMasterCode = String(row.masterOrderCode || row.masterDeliveryOrderCode || '').trim();
      const masterId = String(order.masterOrderId || '').trim();
      const masterCode = String(order.masterOrderCode || '').trim();
      return (orderId && rowOrderId === orderId)
        || (orderCode && rowOrderCode === orderCode)
        || (masterId && rowMasterId === masterId)
        || (masterCode && rowMasterCode === masterCode);
    })
    .reduce((sum, row) => sum + returnOrderTotalAmount(row), 0);
}

function returnOrdersForSalesOrder(returnOrders = [], order = {}) {
  const orderId = String(order.id || '').trim();
  const orderCode = String(order.code || '').trim();
  return returnOrders
    .filter(isActiveReturnOrder)
    .filter((row) => {
      const rowOrderId = String(row.salesOrderId || row.orderId || row.sourceOrderId || row.deliveryOrderId || '').trim();
      const rowOrderCode = String(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.deliveryOrderCode || '').trim();
      const rowMasterId = String(row.masterOrderId || row.masterDeliveryOrderId || '').trim();
      const rowMasterCode = String(row.masterOrderCode || row.masterDeliveryOrderCode || '').trim();
      const masterId = String(order.masterOrderId || '').trim();
      const masterCode = String(order.masterOrderCode || '').trim();
      return (orderId && rowOrderId === orderId)
        || (orderCode && rowOrderCode === orderCode)
        || (masterId && rowMasterId === masterId)
        || (masterCode && rowMasterCode === masterCode);
    });
}


function isReturnOrderLocked(row = {}) {
  const mergeStatus = String(row.returnMergeStatus || '').toLowerCase();
  const warehouseStatus = String(row.warehouseReceiveStatus || '').toLowerCase();
  const status = String(row.status || '').toLowerCase();
  return mergeStatus === 'merged'
    || Boolean(row.masterReturnOrderId || row.masterReturnOrderCode)
    || ['received', 'posted', 'completed'].includes(warehouseStatus)
    || ['received', 'posted', 'completed'].includes(status);
}

function getLockedReturnOrderForSalesOrder(returnOrders = [], order = {}) {
  return returnOrdersForSalesOrder(returnOrders, order).find(isReturnOrderLocked) || null;
}

function returnItemsSignature(items = []) {
  return normalizeDeliveryReturnItems(items, { items: [] })
    .map((item) => `${String(item.productCode || '').trim()}:${toNumber(item.quantity)}`)
    .sort()
    .join('|');
}

function hasReturnItemsChanged(nextItems = [], currentItems = []) {
  return returnItemsSignature(nextItems) !== returnItemsSignature(currentItems);
}

function returnItemsForSalesOrder(returnOrders = [], order = {}) {
  const merged = new Map();
  for (const returnOrder of returnOrdersForSalesOrder(returnOrders, order)) {
    for (const item of (Array.isArray(returnOrder.items) ? returnOrder.items : [])) {
      const productCode = String(item.productCode || item.code || item.productId || '').trim();
      if (!productCode) continue;
      const quantity = toNumber(item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
      const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0);
      const current = merged.get(productCode) || {
        productId: item.productId || productCode,
        productCode,
        productName: item.productName || item.name || '',
        quantity: 0,
        qty: 0,
        qtyReturn: 0,
        returnQuantity: 0,
        returnedQty: 0,
        price,
        salePrice: price,
        unitPrice: price,
        amount: 0
      };
      current.productName = current.productName || item.productName || item.name || '';
      current.quantity += quantity;
      current.qty = current.quantity;
      current.qtyReturn = current.quantity;
      current.returnQuantity = current.quantity;
      current.returnedQty = current.quantity;
      current.price = price || current.price || 0;
      current.salePrice = current.price;
      current.unitPrice = current.price;
      current.amount += Math.round(quantity * current.price);
      merged.set(productCode, current);
    }
  }
  return Array.from(merged.values());
}


function normalizeDeliveryReturnItems(rawItems = [], salesOrder = {}) {
  const sourceItems = new Map((Array.isArray(salesOrder.items) ? salesOrder.items : []).map((item) => [
    String(item.productCode || item.code || item.productId || '').trim(),
    item
  ]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productCode = String(raw.productCode || raw.code || raw.productId || '').trim();
      const original = sourceItems.get(productCode) || {};
      const quantity = toNumber(raw.qtyReturn ?? raw.returnQuantity ?? raw.quantity ?? raw.qty);
      const price = toNumber(raw.price ?? raw.salePrice ?? raw.unitPrice ?? original.price ?? original.salePrice ?? original.unitPrice ?? 0);
      return {
        ...original,
        ...raw,
        productId: raw.productId || original.productId || productCode,
        productCode: productCode || original.productCode || original.code || '',
        productName: raw.productName || raw.name || original.productName || original.name || '',
        quantity,
        qty: quantity,
        qtyReturn: quantity,
        returnQuantity: quantity,
        price,
        salePrice: price,
        unitPrice: price,
        amount: Math.round(toNumber(raw.amount ?? quantity * price))
      };
    })
    .filter((item) => item.quantity > 0 && (item.productCode || item.productName));
}

function buildErpDeliveryReturnKey(order = {}) {
  return `returnOrders:${order.id || order.code || ''}`;
}

async function findErpDeliveryReturnOrders(order = {}) {
  const key = buildErpDeliveryReturnKey(order);
  const ids = [order.id, order._id, order.salesOrderId, order.orderId].map((v) => String(v || '').trim()).filter(Boolean);
  const codes = [order.code, order.orderCode, order.salesOrderCode].map((v) => String(v || '').trim()).filter(Boolean);
  const or = [{ erpDeliveryReturnKey: key }];
  if (ids.length) {
    or.push({ salesOrderId: { $in: [...new Set(ids)] } });
    or.push({ orderId: { $in: [...new Set(ids)] } });
  }
  if (codes.length) {
    or.push({ salesOrderCode: { $in: [...new Set(codes)] } });
    or.push({ orderCode: { $in: [...new Set(codes)] } });
  }
  const rows = await returnOrderRepository.findAll({ $or: or }, { limit: 50 });
  return rows.filter((row) => isActiveReturnOrder(row));
}

async function findErpDeliveryReturnOrder(order = {}) {
  const rows = await findErpDeliveryReturnOrders(order);
  // Ưu tiên phiếu chưa gộp còn hiệu lực; các bản THH cũ sinh trùng sẽ được hủy ở bước sync.
  return rows.find((row) => !['cancelled', 'canceled', 'void', 'deleted'].includes(String(row.status || '').toLowerCase()) && !(row.masterReturnOrderId || row.masterReturnOrderCode))
    || rows.find((row) => !['cancelled', 'canceled', 'void', 'deleted'].includes(String(row.status || '').toLowerCase()))
    || rows[0]
    || null;
}

async function cancelDuplicateErpReturnOrders(order = {}, keep = null, options = {}) {
  const rows = await findErpDeliveryReturnOrders(order);
  const keepId = String(keep?.id || '').trim();
  const keepCode = String(keep?.code || '').trim();
  for (const row of rows) {
    const isKeep = (keepId && String(row.id || '').trim() === keepId) || (keepCode && String(row.code || '').trim() === keepCode);
    const status = String(row.status || '').toLowerCase();
    if (isKeep || ['cancelled', 'canceled', 'void', 'deleted'].includes(status)) continue;
    // Chỉ hủy bản trùng chưa gộp. Không đụng chứng từ đã đưa vào đơn tổng/kho kiểm nhận.
    if ((row.returnMergeStatus || 'unmerged') === 'merged' || row.masterReturnOrderId || row.masterReturnOrderCode) continue;
    await returnOrderRepository.upsert({
      ...row,
      status: 'cancelled',
      cancelledAt: dateUtil.nowIso(),
      cancelReason: `Hủy phiếu trả trùng của đơn giao ${order.code || order.id || ''}`,
      updatedAt: dateUtil.nowIso()
    }, options);
  }
}

async function syncErpDeliveryReturnOrder(updatedOrder = {}, returnItems = [], options = {}) {
  const items = normalizeDeliveryReturnItems(returnItems, updatedOrder);
  const totalAmount = Math.round(items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const existing = await findErpDeliveryReturnOrder(updatedOrder);

  // Nếu người dùng xóa hết hàng trả trước khi gộp, hủy phiếu trả ERP đang chờ gộp để không còn hiện ở Đơn trả hàng.
  if (!items.length || totalAmount <= 0) {
    if (existing && (existing.returnMergeStatus || 'unmerged') !== 'merged' && !existing.masterReturnOrderId && !existing.masterReturnOrderCode) {
      await returnOrderRepository.upsert({
        ...existing,
        status: 'cancelled',
        cancelledAt: dateUtil.nowIso(),
        cancelReason: 'ERP delivery return items cleared',
        totalQuantity: 0,
        totalAmount: 0,
        amount: 0,
        debtReduction: 0,
        items: [],
        updatedAt: dateUtil.nowIso()
      }, options);
    }
    return null;
  }

  const stableReturnId = `RO-ERP-${String(updatedOrder.id || updatedOrder.code || updatedOrder.orderCode || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const payload = {
    id: stableReturnId,
    erpDeliveryReturnKey: buildErpDeliveryReturnKey(updatedOrder),
    salesOrderId: updatedOrder.id || '',
    salesOrderCode: updatedOrder.code || updatedOrder.orderCode || '',
    orderId: updatedOrder.id || '',
    orderCode: updatedOrder.code || updatedOrder.orderCode || '',
    customerId: updatedOrder.customerId || '',
    customerCode: updatedOrder.customerCode || '',
    customerName: updatedOrder.customerName || '',
    date: dateUtil.toDateOnly(updatedOrder.deliveryDate || updatedOrder.date || dateUtil.todayVN()),
    documentDate: dateUtil.toDateOnly(updatedOrder.deliveryDate || updatedOrder.date || dateUtil.todayVN()),
    items,
    totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
    totalAmount,
    amount: totalAmount,
    debtReduction: totalAmount,
    status: 'waiting_receive',
    returnMergeStatus: 'unmerged',
    warehouseReceiveStatus: 'waiting_receive',
    source: 'returnOrders',
    refType: 'erpDeliveryReturn',
    deliveryStaffCode: updatedOrder.deliveryStaffCode || '',
    deliveryStaffName: updatedOrder.deliveryStaffName || '',
    staffCode: updatedOrder.deliveryStaffCode || '',
    staffName: updatedOrder.deliveryStaffName || '',
    routeName: updatedOrder.routeName || updatedOrder.deliveryRoute || '',
    note: updatedOrder.deliveryNote || `ERP đơn giao trả hàng ${updatedOrder.code || updatedOrder.id || ''}`
  };

  if (existing) {
    if (isReturnOrderLocked(existing)) {
      throw new Error('Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả từ màn giao hàng');
    }
    const result = await returnOrderService.createPendingReturnOrder({
      ...payload,
      id: existing.id,
      code: existing.code,
      createdAt: existing.createdAt || dateUtil.nowIso(),
      note: payload.note || `ERP cập nhật phiếu trả từ đơn giao ${updatedOrder.code || updatedOrder.id || ''}`
    });
    if (result.error) throw new Error(result.error);
    await cancelDuplicateErpReturnOrders(updatedOrder, result.returnOrder, options);
    return result.returnOrder;
  }

  const result = await returnOrderService.createPendingReturnOrder({
    ...payload,
    note: payload.note || `ERP tạo phiếu trả từ đơn giao ${updatedOrder.code || updatedOrder.id || ''}`
  });
  if (result.error) throw new Error(result.error);
  await cancelDuplicateErpReturnOrders(updatedOrder, result.returnOrder, options);
  return result.returnOrder;
}


function isDeliveryCompletedStatus(status) {
  return ['delivered', 'success', 'completed', 'done'].includes(String(status || '').toLowerCase());
}

function isAccountingConfirmed(row = {}) {
  return Boolean(row.accountingConfirmed) || ['confirmed', 'locked', 'posted'].includes(String(row.accountingStatus || '').toLowerCase());
}

function orderDebtLifecycleStatus(debtAmount = 0, deliveryStatus = '', order = {}) {
  // V45: đơn giao xong vẫn chưa được đưa vào công nợ cho tới khi kế toán xác nhận.
  if (!isDeliveryCompletedStatus(deliveryStatus)) return 'not_posted';
  if (!isAccountingConfirmed(order)) return 'pending_accounting';
  return hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid';
}

async function addDebtToCustomerIfNeeded(order = {}, options = {}) {
  const customerKey = order.customerCode || order.customerId || order.customerName;
  if (!customerKey) return null;
  const customer = await customerRepository.findByIdOrCode(customerKey);
  if (!customer) return null;
  const amount = Math.max(0, normalizeDebtAmount(order.debtAmount ?? order.debt ?? 0));
  const currentDebt = toNumber(customer.currentDebt ?? customer.debtAmount ?? customer.openingDebt);
  const nextDebt = Math.max(0, normalizeDebtAmount(currentDebt + amount));
  customer.currentDebt = nextDebt;
  customer.debtAmount = nextDebt;
  await customerRepository.save(customer, options);
  return customer;
}

function orderKey(order = {}) {
  return String(order.id || order._id || order.code || order.orderCode || '').trim();
}

function orderDisplayCode(order = {}) {
  return String(order.code || order.orderCode || order.id || order._id || '').trim();
}


function isAccountingReopenPending(order = {}) {
  return Boolean(order.needReAccounting || order.reAccountingRequired || order.adminAdjustmentOpen) || String(order.accountingStatus || '').toLowerCase() === 'needs_repost';
}

function makeArBaseRow(order = {}, extra = {}) {
  const key = orderKey(order) || orderDisplayCode(order);
  const code = orderDisplayCode(order) || key;
  return {
    id: extra.id,
    code: extra.code || extra.id,
    date: dateUtil.toDateOnly(extra.date || order.deliveryDate || order.date || dateUtil.todayVN()),
    account: 'AR',
    type: extra.type,
    refType: extra.refType || 'MOBILE_DELIVERY_RE_ACCOUNTING',
    refId: String(extra.refId || key || '').trim(),
    refCode: String(extra.refCode || code || '').trim(),
    orderId: String(extra.orderId || key || '').trim(),
    orderCode: String(extra.orderCode || code || '').trim(),
    customerId: String(order.customerId || '').trim(),
    customerCode: String(order.customerCode || '').trim(),
    customerName: String(order.customerName || '').trim(),
    salesmanCode: String(order.salesmanCode || order.staffCode || order.salesStaffCode || '').trim(),
    salesmanName: String(order.salesmanName || order.staffName || order.salesStaffName || '').trim(),
    deliveryStaffCode: String(order.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(order.deliveryStaffName || '').trim(),
    debit: toNumber(extra.debit),
    credit: toNumber(extra.credit),
    amount: toNumber(extra.amount ?? Math.max(toNumber(extra.debit), toNumber(extra.credit))),
    note: String(extra.note || '').trim(),
    status: extra.status || 'posted',
    source: extra.source || 'mobile_delivery_re_accounting',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    reAccountingBatchId: extra.reAccountingBatchId || '',
    createdAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

function arLedgerKeysForOrder(order = {}) {
  return [...new Set([order.id, order._id, order.code, order.orderId, order.orderCode, order.refId, order.refCode]
    .map((value) => String(value || '').trim()).filter(Boolean))];
}

async function findActiveArLedgersForOrder(order = {}, options = {}) {
  const keys = arLedgerKeysForOrder(order);
  if (!keys.length) return [];
  const rows = await paymentRepository.findAll({
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { refId: { $in: keys } },
      { refCode: { $in: keys } }
    ]
  }, options);
  return (rows || []).filter((row) => {
    const status = String(row.status || '').toLowerCase();
    const type = String(row.type || '').toLowerCase();
    return !row.reversed && status !== 'reversed' && !type.includes('reversal');
  });
}

async function reverseActiveArLedgersForOrder(order = {}, user = {}, options = {}) {
  const oldRows = await findActiveArLedgersForOrder(order, options);
  const batchId = `READJ-${orderKey(order) || orderDisplayCode(order)}-${Date.now()}`;
  const reversedRows = [];
  for (const old of oldRows) {
    const debit = toNumber(old.debit);
    const credit = toNumber(old.credit);
    const amount = Math.max(debit, credit, toNumber(old.amount));
    if (amount <= 0) continue;
    const reversal = {
      ...old,
      id: `AR-REVERSAL-${old.id || old.code || makeId('AR')}-${batchId}`,
      code: `AR-REVERSAL-${old.code || old.id || makeId('AR')}`,
      type: 'ar_reversal',
      refType: 'AR_LEDGER_REVERSAL',
      debit: credit,
      credit: debit,
      amount,
      status: 'posted',
      source: 'admin_delivery_re_accounting',
      note: `Đảo bút toán ${old.code || old.id || ''} do admin mở khóa điều chỉnh đơn giao ${orderDisplayCode(order)}`,
      reversedFromId: old.id || '',
      reversedFromCode: old.code || '',
      reAccountingBatchId: batchId,
      createdBy: user.id || user.code || user.name || 'admin',
      createdAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    };
    await paymentRepository.upsert(reversal, options);
    await paymentRepository.upsert({
      ...old,
      reversed: true,
      status: 'reversed',
      reversedAt: dateUtil.nowIso(),
      reversedBy: user.id || user.code || user.name || 'admin',
      reAccountingBatchId: batchId,
      updatedAt: dateUtil.nowIso()
    }, options);
    reversedRows.push(reversal);
  }
  return { batchId, reversedRows, oldRows };
}

async function postDeliveryArLedgerRowsAfterReAccounting(order = {}, batchId = '', options = {}) {
  const key = orderKey(order) || orderDisplayCode(order);
  const code = orderDisplayCode(order) || key;
  const baseAmount = Math.max(0, normalizeDebtAmount(deliveryFinance.deliveryDebtBase(order)));
  const cashAmount = toNumber(order.cashCollected ?? order.cashAmount ?? 0);
  const bankAmount = toNumber(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0);
  const rewardAmount = deliveryRewardAmount(order);
  const returnAmount = deliveryFinance.deliveryReturnAmount(order);
  const rows = [];
  const add = async (suffix, row) => {
    if (toNumber(row.amount) <= 0 && !row.postZero) return null;
    const entry = makeArBaseRow(order, {
      ...row,
      id: `${suffix}-${key}-${batchId}`,
      code: `${suffix}-${code}-${batchId}`,
      reAccountingBatchId: batchId
    });
    await paymentRepository.upsert(entry, options);
    rows.push(entry);
    return entry;
  };
  await add('AR-SALE', { type: 'ar_sale', refType: 'SALES_ORDER', debit: baseAmount, credit: 0, amount: baseAmount, postZero: true, note: `Ghi nhận lại công nợ đơn bán ${code} sau điều chỉnh admin` });
  await add('AR-RECEIPT-CASH', { type: 'ar_receipt', refType: 'RECEIPT', debit: 0, credit: cashAmount, amount: cashAmount, note: `Ghi nhận lại thu tiền mặt từ app giao hàng ${code}` });
  await add('AR-RECEIPT-BANK', { type: 'ar_receipt', refType: 'RECEIPT', debit: 0, credit: bankAmount, amount: bankAmount, note: `Ghi nhận lại thu chuyển khoản từ app giao hàng ${code}` });
  await add('AR-BONUS', { type: 'ar_bonus', refType: 'BONUS_ALLOWANCE', debit: 0, credit: rewardAmount, amount: rewardAmount, note: `Ghi nhận lại cấn trừ trả thưởng ${code}` });
  await add('AR-RETURN', { type: 'ar_return', refType: 'RETURN_ORDER', debit: 0, credit: returnAmount, amount: returnAmount, note: `Ghi nhận lại hàng trả từ app giao hàng ${code}` });
  return rows;
}

function compactAllocations(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const amount = toNumber(row.amount ?? row.allocatedAmount ?? row.paymentAmount);
    if (amount <= 0) continue;
    const orderId = String(row.orderId || row.salesOrderId || '').trim();
    const orderCode = String(row.orderCode || row.salesOrderCode || '').trim();
    const key = `${orderId}::${orderCode}`;
    const prev = map.get(key) || { orderId, orderCode, amount: 0 };
    prev.amount += amount;
    map.set(key, prev);
  }
  return [...map.values()].filter((row) => row.amount > 0);
}

async function postDeliveryCollectionsAfterAccountingConfirmed(order = {}, options = {}) {
  const key = orderKey(order);
  const code = orderDisplayCode(order);
  if (!key && !code) return null;

  const currentOrderId = key;
  const currentOrderCode = code;
  const posted = [];

  const oldDebtAllocations = Array.isArray(order.debtCollectionAllocations) ? order.debtCollectionAllocations : [];
  const buildPaymentAllocations = (method, currentAmount) => compactAllocations([
    ...(toNumber(currentAmount) > 0 ? [{ orderId: currentOrderId, orderCode: currentOrderCode, amount: currentAmount }] : []),
    ...oldDebtAllocations
      .filter((row) => String(row.method || '').toLowerCase() === method)
      .map((row) => ({ orderId: row.orderId, orderCode: row.orderCode, amount: row.amount }))
  ]);

  const paymentRows = [
    { method: 'cash', label: 'tiền mặt', amount: toNumber(order.cashCollected ?? order.cashAmount ?? 0) },
    { method: 'transfer', label: 'chuyển khoản', amount: toNumber(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0) }
  ];

  for (const row of paymentRows) {
    const allocations = buildPaymentAllocations(row.method, row.amount);
    const total = allocations.reduce((sum, allocation) => sum + toNumber(allocation.amount), 0);
    if (total <= 0) continue;
    const entry = await postingEngine.postReceiptAR({
      id: `MOBILE-DELIVERY-${row.method.toUpperCase()}-${key || code}`,
      code: `MOBILE-DELIVERY-${row.method.toUpperCase()}-${code || key}`,
      date: order.deliveryDate || order.date || dateUtil.todayVN(),
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || '',
      amount: total,
      method: row.method,
      source: 'mobile_delivery_accounting_confirmed',
      refType: 'MOBILE_DELIVERY_ACCOUNTING',
      refId: key || code,
      refCode: code || key,
      orderId: currentOrderId,
      orderCode: currentOrderCode,
      allocations,
      note: `Kế toán xác nhận thu ${row.label} từ app giao hàng ${code || key}`
    }, options);
    posted.push(entry);
  }

  const returnAmount = toNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  if (returnAmount > 0) {
    const entry = await postingEngine.postReturnOrderAR({
      id: `MOBILE-DELIVERY-RETURN-${key || code}`,
      code: `MOBILE-DELIVERY-RETURN-${code || key}`,
      date: order.deliveryDate || order.date || dateUtil.todayVN(),
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || '',
      salesOrderId: currentOrderId,
      salesOrderCode: currentOrderCode,
      orderId: currentOrderId,
      orderCode: currentOrderCode,
      debtReduction: returnAmount,
      amount: returnAmount,
      source: 'mobile_delivery_accounting_confirmed',
      note: `Kế toán xác nhận hàng trả từ app giao hàng ${code || key}`
    }, { ...options, skipIfExists: true });
    if (entry) posted.push(entry);
  }

  return posted;
}


function makeBatchArRow(order = {}, extra = {}) {
  const key = orderKey(order) || orderDisplayCode(order);
  const code = orderDisplayCode(order) || key;
  const amount = Math.max(0, toNumber(extra.amount));
  return makeArBaseRow(order, {
    id: extra.id,
    code: extra.code || extra.id,
    date: extra.date || order.deliveryDate || order.date || dateUtil.todayVN(),
    type: extra.type,
    refType: extra.refType,
    refId: key,
    refCode: code,
    orderId: key,
    orderCode: code,
    debit: toNumber(extra.debit),
    credit: toNumber(extra.credit),
    amount,
    note: extra.note,
    source: extra.source || 'delivery_batch_post',
    createdBy: extra.createdBy || '',
    reAccountingBatchId: extra.reAccountingBatchId || ''
  });
}

function returnAmountForOrderFromMap(returnByOrderKey = new Map(), order = {}) {
  const keys = compactDeliveryOrderKeys(order);
  const used = new Set();
  let amount = 0;
  for (const key of keys) {
    const rows = returnByOrderKey.get(key) || [];
    for (const row of rows) {
      const rowKey = String(row.id || row.code || `${key}-${row.totalAmount || row.amount || ''}`).trim();
      if (used.has(rowKey)) continue;
      used.add(rowKey);
      if (!isActiveReturnOrder(row)) continue;
      const receiveStatus = String(row.warehouseReceiveStatus || row.receiveStatus || '').toLowerCase();
      if (['cancelled', 'canceled', 'cleared', 'void', 'deleted'].includes(receiveStatus)) continue;
      amount += toNumber(row.totalAmount ?? row.amount ?? row.debtReduction ?? 0);
    }
  }
  return amount;
}

async function batchPostDeliveryArLedgers(postableChildren = [], confirmedBy = 'accountant', options = {}) {
  const children = (postableChildren || []).filter(Boolean);
  if (!children.length) return { ledgerRows: [], postedOrderKeys: new Set(), skippedPostedKeys: new Set() };

  const allKeys = [...new Set(children.flatMap(compactDeliveryOrderKeys))];
  if (!allKeys.length) return { ledgerRows: [], postedOrderKeys: new Set(), skippedPostedKeys: new Set() };

  const existingLedgers = await paymentRepository.findAll({
    status: { $ne: 'reversed' },
    reversed: { $ne: true },
    type: { $in: ['ar_sale', 'ar_receipt', 'ar_bonus', 'ar_return'] },
    $or: [
      { orderId: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { refId: { $in: allKeys } },
      { refCode: { $in: allKeys } }
    ]
  }, options);

  const postedKeySet = new Set();
  for (const row of existingLedgers || []) {
    for (const key of masterDeliveryOrderKeys(row)) postedKeySet.add(key);
  }

  const returnOrders = await findReturnOrdersForDeliveryChildren(children);
  const returnByOrderKey = new Map();
  for (const r of returnOrders || []) {
    for (const key of masterDeliveryOrderKeys(r, {
      id: r.sourceOrderId || r.salesOrderId || r.orderId,
      code: r.sourceOrderCode || r.salesOrderCode || r.orderCode
    })) {
      if (!returnByOrderKey.has(key)) returnByOrderKey.set(key, []);
      returnByOrderKey.get(key).push(r);
    }
  }

  const ledgerRows = [];
  const postedOrderKeys = new Set();
  const skippedPostedKeys = new Set();

  for (const order of children) {
    if (!isDeliveryCompletedStatus(order.deliveryStatus || order.status)) continue;
    const keys = compactDeliveryOrderKeys(order);
    if (keys.some((key) => postedKeySet.has(key))) {
      for (const key of keys) skippedPostedKeys.add(key);
      continue;
    }

    const key = orderKey(order) || orderDisplayCode(order);
    const code = orderDisplayCode(order) || key;
    const baseAmount = Math.max(0, normalizeDebtAmount(deliveryFinance.deliveryDebtBase(order)));
    const cashAmount = toNumber(order.cashCollected ?? order.cashAmount ?? 0);
    const bankAmount = toNumber(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0);
    const rewardAmount = deliveryRewardAmount(order);
    const returnAmount = Math.max(deliveryFinance.deliveryReturnAmount(order), returnAmountForOrderFromMap(returnByOrderKey, order));
    const idSeed = key || code || makeId('AR');

    ledgerRows.push(makeBatchArRow(order, {
      id: `AR-SALE-${idSeed}`,
      code: `AR-SALE-${code || idSeed}`,
      type: 'ar_sale',
      refType: 'SALES_ORDER',
      debit: baseAmount,
      credit: 0,
      amount: baseAmount,
      note: `Ghi nhận công nợ đơn bán ${code || key}`,
      createdBy: confirmedBy
    }));

    if (cashAmount > 0) ledgerRows.push(makeBatchArRow(order, {
      id: `AR-RECEIPT-CASH-${idSeed}`,
      code: `AR-RECEIPT-CASH-${code || idSeed}`,
      type: 'ar_receipt',
      refType: 'RECEIPT',
      debit: 0,
      credit: cashAmount,
      amount: cashAmount,
      note: `Thu tiền mặt đơn giao ${code || key}`,
      createdBy: confirmedBy
    }));

    if (bankAmount > 0) ledgerRows.push(makeBatchArRow(order, {
      id: `AR-RECEIPT-BANK-${idSeed}`,
      code: `AR-RECEIPT-BANK-${code || idSeed}`,
      type: 'ar_receipt',
      refType: 'RECEIPT',
      debit: 0,
      credit: bankAmount,
      amount: bankAmount,
      note: `Thu chuyển khoản đơn giao ${code || key}`,
      createdBy: confirmedBy
    }));

    if (rewardAmount > 0) ledgerRows.push(makeBatchArRow(order, {
      id: `AR-BONUS-${idSeed}`,
      code: `AR-BONUS-${code || idSeed}`,
      type: 'ar_bonus',
      refType: 'BONUS_ALLOWANCE',
      debit: 0,
      credit: rewardAmount,
      amount: rewardAmount,
      note: `Cấn trừ trả thưởng đơn giao ${code || key}`,
      createdBy: confirmedBy
    }));

    if (returnAmount > 0) ledgerRows.push(makeBatchArRow(order, {
      id: `AR-RETURN-${idSeed}`,
      code: `AR-RETURN-${code || idSeed}`,
      type: 'ar_return',
      refType: 'RETURN_ORDER',
      debit: 0,
      credit: returnAmount,
      amount: returnAmount,
      note: `Cấn trừ hàng trả đơn giao ${code || key}`,
      createdBy: confirmedBy
    }));

    for (const keyItem of keys) postedOrderKeys.add(keyItem);
  }

  if (ledgerRows.length) {
    await MongoStore.arLedgers.insertMany(ledgerRows, { ordered: false, session: options.session });
  }

  return { ledgerRows, postedOrderKeys, skippedPostedKeys };
}

async function postDeliveryArIfAccountingConfirmed(order = {}, options = {}) {
  if (!isDeliveryCompletedStatus(order.deliveryStatus || order.status)) return null;
  if (!isAccountingConfirmed(order)) return null;

  // AR-SALE phải là phát sinh phải thu ban đầu của đơn đã giao.
  // Tiền mặt/chuyển khoản/hàng trả/trả thưởng chỉ được ghi credit sau khi kế toán xác nhận.
  const baseAmount = Math.max(0, normalizeDebtAmount(
    order.debtBeforeCollection
    ?? order.totalAmount
    ?? order.amount
    ?? order.grandTotal
    ?? order.payableAmount
    ?? order.debtAmount
    ?? order.debt
    ?? 0
  ));

  const saleEntry = await postingEngine.postSalesOrderAR({
    ...order,
    debtBeforeCollection: baseAmount,
    debtAmount: baseAmount,
    paidAmount: 0,
    arPostedAt: order.arPostedAt || dateUtil.nowIso()
  }, { ...options, postZero: true, skipIfExists: true });

  await postDeliveryCollectionsAfterAccountingConfirmed(order, options);

  // Trả thưởng/trợ giá là khoản cấn trừ công nợ riêng.
  // Không gộp vào phiếu thu để tránh sai sổ quỹ tiền mặt/ngân hàng.
  await postingEngine.postBonusAllowanceAR(order, options);
  return saleEntry;
}

function statusForDeliveryRow(order = {}) {
  const raw = String(order.deliveryStatus || order.status || 'pending').toLowerCase();
  const debt = deliveryFinance.calculateDeliveryDebt(order);
  if (['delivered', 'done', 'completed', 'paid'].includes(raw)) return hasOpenDebt(debt) ? 'unpaid' : 'delivered';
  if (['delivering', 'shipping', 'on_route'].includes(raw)) return 'delivering';
  if (['returned', 'partial_return'].includes(raw)) return raw;
  return 'waiting';
}


function masterDeliveryDebtMapKey(value) {
  return String(value || '').trim();
}

function masterDeliveryOrderKeys(...sources) {
  return [...new Set(sources.flatMap((source) => [
    source?.id,
    source?.code,
    source?.orderId,
    source?.orderCode,
    source?.salesOrderId,
    source?.salesOrderCode,
    source?.refId,
    source?.refCode
  ]).map(masterDeliveryDebtMapKey).filter(Boolean))];
}

function masterDeliveryPutDebtMapEntry(map, row = {}) {
  masterDeliveryOrderKeys(row).forEach((key) => map.set(key, row));
}

async function buildMasterDeliveryArDebtMap(orders = []) {
  const map = new Map();
  const wanted = new Set();
  (orders || []).forEach((order) => masterDeliveryOrderKeys(order).forEach((key) => wanted.add(key)));
  if (!wanted.size) return map;
  try {
    const report = await reportService.debtReport({ includePaid: '1', status: 'all' });
    const rows = Array.isArray(report?.debts) ? report.debts : [];
    rows.forEach((row) => {
      const keys = masterDeliveryOrderKeys(row);
      if (keys.some((key) => wanted.has(key))) masterDeliveryPutDebtMapEntry(map, row);
    });
  } catch (err) {
    // Nếu AR Ledger lỗi, màn giao hàng vẫn fallback về cache order để không vỡ giao diện.
  }
  return map;
}

function findMasterDeliveryArDebtRow(arDebtMap, ...sources) {
  if (!arDebtMap || !arDebtMap.size) return null;
  for (const key of masterDeliveryOrderKeys(...sources)) {
    const row = arDebtMap.get(key);
    if (row) return row;
  }
  return null;
}

async function listDeliveryToday(query = {}) {
  const perfStartedAt = Date.now();
  const perf = { startedAt: perfStartedAt };
  const mark = (name) => { perf[name] = Date.now() - perfStartedAt; };
  const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
  const q = normalizeText(query.q);
  const salesman = normalizeText(query.salesman || query.salesStaff);
  const delivery = normalizeText(query.delivery || query.deliveryStaff);
  const route = normalizeText(query.route || query.routeName);
  const status = normalizeText(query.status);

  const page = queryGuard.getPagination({ page: query.page || 1, limit: query.limit || 50 }, { defaultLimit: 50, maxLimit: 5000 });
  const masterFilter = {
    $or: [{ date }, { deliveryDate: date }],
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed'] }
  };
  const masterQueryStartedAt = Date.now();
  const masterOrders = await masterOrderRepository.findAll(masterFilter, {
    sort: { deliveryDate: -1, createdAt: -1, code: -1 },
    skip: page.skip,
    limit: page.limit
  });
  mark('masterQueryMs');
  const childrenMap = await buildMasterChildrenMapFast(masterOrders);
  mark('childrenQueryMs');
  const allChildren = Array.from(childrenMap.values()).flat();
  const returnLookupChildren = [];
  for (const master of masterOrders || []) {
    const masterKey = String(master.id || master.code || '');
    const children = childrenMap.get(masterKey) || [];
    for (const child of children) {
      returnLookupChildren.push({
        ...child,
        masterOrderId: master.id || '',
        masterOrderCode: master.code || ''
      });
    }
  }
  const tReturnStart = Date.now();
  const returnOrders = await findReturnOrdersForDeliveryChildren(returnLookupChildren.length ? returnLookupChildren : allChildren);
  mark('returnOrdersQueryMs');
  console.log('[DELIVERY_TODAY_RETURN_ORDERS]', {
    returnMs: Date.now() - tReturnStart,
    orderCount: (returnLookupChildren.length ? returnLookupChildren : allChildren).length,
    returnCount: returnOrders.length
  });
  // Không dùng AR cache cho danh sách giao hàng; dùng công thức giao hàng bình thường.
  const arDebtMap = null;
  const rows = [];

  for (const master of masterOrders) {
    if (isInactiveStatus(master)) continue;
    const children = childrenMap.get(String(master.id || master.code || '')) || [];
    for (const child of children) {
      if (isInactiveStatus(child)) continue;
      const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
      if (deliveryDate !== date) continue;

      child.masterOrderId = master.id || '';
      child.masterOrderCode = master.code || '';
      const syncedReturnAmount = returnAmountForSalesOrder(returnOrders, child);
      const syncedReturnItems = returnItemsForSalesOrder(returnOrders, child);
      const lockedReturnOrder = getLockedReturnOrderForSalesOrder(returnOrders, child);
      child.returnAmountFromReturnOrders = syncedReturnAmount;
      child.returnAmount = syncedReturnAmount;
      child.returnedAmount = syncedReturnAmount;
      child.returnItems = syncedReturnItems;
      child.deliveryReturnItems = syncedReturnItems;
      const amount = buildDeliveryAmount(child, syncedReturnAmount);

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
        totalAmount: amount.totalReceivable,
        totalReceivable: amount.totalReceivable,
        debtBeforeCollection: amount.totalReceivable,
        cashCollected: amount.cashAmount,
        cashAmount: amount.cashAmount,
        bankCollected: amount.bankAmount,
        bankAmount: amount.bankAmount,
        transferAmount: amount.bankAmount,
        returnAmount: amount.returnAmount,
        returnAmountSource: 'returnOrders',
        rewardAmount: amount.bonusAmount,
        bonusAmount: amount.bonusAmount,
        debt: amount.debtAmount,
        debtAmount: amount.debtAmount,
        remainingAmount: amount.debtAmount,
        collectedAmount: amount.collectedAmount,
        arBalance: amount.debtAmount,
        arDebtAmount: amount.debtAmount,
        debtSource: 'delivery_formula',
        arLedgerSynced: false,
        // Giữ riêng danh sách sản phẩm gốc để panel hàng trả luôn hiện đủ mã sản phẩm,
        // kể cả mã chưa có SL trả trong returnOrders.
        items: Array.isArray(child.items) ? child.items : [],
        orderItems: Array.isArray(child.items) ? child.items : [],
        soldItems: Array.isArray(child.items) ? child.items : [],
        returnItems: syncedReturnItems,
        deliveryReturnItems: syncedReturnItems,
        returnLocked: Boolean(lockedReturnOrder),
        returnLockMessage: lockedReturnOrder ? `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả.` : '',
        returnMergeStatus: lockedReturnOrder ? (lockedReturnOrder.returnMergeStatus || 'merged') : 'unmerged',
        masterReturnOrderId: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderId || '') : '',
        masterReturnOrderCode: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderCode || '') : '',
        warehouseReceiveStatus: lockedReturnOrder ? (lockedReturnOrder.warehouseReceiveStatus || '') : '',
        isLate: Boolean(child.isLate),
        needReAccounting: Boolean(child.needReAccounting || child.reAccountingRequired),
        adminAdjustmentOpen: Boolean(child.adminAdjustmentOpen),
        unlockReason: child.unlockReason || '',
        unlockedAt: child.unlockedAt || '',
        unlockedBy: child.unlockedBy || '',
        accountingConfirmed: !isAccountingReopenPending(child) && (isAccountingConfirmed(child) || isAccountingConfirmed(master)),
        accountingStatus: child.accountingStatus || master.accountingStatus || 'draft_delivery',
        accountingConfirmedAt: child.accountingConfirmedAt || master.accountingConfirmedAt || '',
        accountingConfirmedBy: child.accountingConfirmedBy || master.accountingConfirmedBy || '',
        editLocked: !isAccountingReopenPending(child) && (isAccountingConfirmed(child) || isAccountingConfirmed(master))
      };

      if (q && ![row.orderCode, row.masterOrderCode, row.customerCode, row.customerName, row.customerPhone, row.customerAddress].some((value) => normalizeText(value).includes(q))) continue;
      if (salesman && ![row.salesmanCode, row.salesmanName].some((value) => normalizeText(value).includes(salesman))) continue;
      if (delivery && ![row.deliveryStaffCode, row.deliveryStaffName].some((value) => normalizeText(value).includes(delivery))) continue;
      if (route && !normalizeText(row.routeName).includes(route)) continue;
      if (status) {
        const visual = normalizeText(row.visualStatus);
        const rawStatus = normalizeText(row.deliveryStatus);
        const isDeliveredGroup = ['delivered', 'done', 'completed', 'paid', 'unpaid'].includes(visual)
          || ['delivered', 'done', 'completed', 'paid'].includes(rawStatus);
        const isNotDeliveredGroup = !isDeliveredGroup;
        const hasReturn = toNumber(row.returnAmount) > 0 || (Array.isArray(row.returnItems) && row.returnItems.length > 0);
        const isAccountingConfirmedGroup = Boolean(row.accountingConfirmed);
        if (status === 'delivered_group' && !isDeliveredGroup) continue;
        else if (status === 'not_delivered' && !isNotDeliveredGroup) continue;
        else if (status === 'returned' && !hasReturn) continue;
        else if (status === 'accounting_confirmed' && !isAccountingConfirmedGroup) continue;
        else if (status === 'accounting_pending' && isAccountingConfirmedGroup) continue;
        else if (!['delivered_group', 'not_delivered', 'returned', 'accounting_confirmed', 'accounting_pending'].includes(status) && visual !== status && rawStatus !== status) continue;
      }
      rows.push(row);
    }
  }

  mark('buildRowsMs');
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

  const accountingConfirmed = rows.length > 0 && rows.every((row) => row.accountingConfirmed || row.editLocked);
  const totalMs = Date.now() - perfStartedAt;
  perf.totalMs = totalMs;
  perf.masterCount = masterOrders.length;
  perf.childCount = allChildren.length;
  perf.returnOrderCount = returnOrders.length;
  perf.rowCount = rows.length;
  if (process.env.API_PERF_LOG !== '0') {
    console.log('[DELIVERY_TODAY_PERF]', perf);
  }
  return {
    formula: 'Lấy đơn con đã gộp theo Ngày giao hàng trong đơn tổng/đơn con; không lấy theo ngày tạo đơn. Công nợ chỉ phát sinh sau khi kế toán xác nhận.',
    perf,
    ms: totalMs,
    accounting: {
      date,
      confirmed: accountingConfirmed,
      editable: !accountingConfirmed,
      message: accountingConfirmed ? 'Kế toán đã xác nhận. Đơn giao đã khóa chỉnh sửa và đã đưa vào công nợ.' : 'Chưa xác nhận kế toán. Đơn còn được chỉnh sửa và chưa đưa vào công nợ.'
    },
    orders: rows,
    routes: Array.from(routeMap.values()),
    kpi: {
      totalOrders: rows.length,
      delivering: rows.filter((row) => row.visualStatus === 'delivering').length,
      delivered: rows.filter((row) => row.visualStatus === 'delivered').length,
      unpaid: rows.filter((row) => hasOpenDebt(row.debt)).length,
      late: rows.filter((row) => row.isLate).length
    }
  };
}

function deliveryGroupKey(value, fallback) {
  const key = String(value || '').trim();
  return key || fallback;
}

function deliveryRowCollectedAmount(row = {}) {
  return toNumber(row.cashCollected || 0)
    + toNumber(row.bankCollected || 0)
    + toNumber(row.rewardAmount || 0)
    + deliveryFinance.deliveryReturnAmount(row);
}

function buildDeliverySummaryAccumulator(row = {}) {
  return {
    orderCount: 0,
    deliveredCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalReceivable: 0,
    totalAmount: 0,
    cashAmount: 0,
    bankAmount: 0,
    bonusAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    collectedAmount: 0,
    debtAmount: 0,
    remainingAmount: 0
  };
}

function addDeliveryRowToSummary(acc, row = {}) {
  const visual = String(row.visualStatus || row.deliveryStatus || '').toLowerCase();
  acc.orderCount += 1;
  if (['delivered', 'done', 'completed'].includes(visual)) acc.deliveredCount += 1;
  else if (['failed', 'cancelled', 'canceled', 'returned', 'delivery_failed'].includes(visual)) acc.failedCount += 1;
  else acc.pendingCount += 1;
  const amount = buildDeliveryAmount(row, row.returnAmount);
  acc.totalReceivable += amount.totalReceivable;
  acc.totalAmount += amount.totalReceivable;
  acc.cashAmount += amount.cashAmount;
  acc.bankAmount += amount.bankAmount;
  acc.bonusAmount += amount.bonusAmount;
  acc.rewardAmount += amount.bonusAmount;
  acc.returnAmount += amount.returnAmount;
  acc.collectedAmount += amount.collectedAmount;
  acc.debtAmount += amount.debtAmount;
  acc.remainingAmount += amount.debtAmount;
  return acc;
}

function finalizeDeliverySummaryRow(row = {}) {
  const roundKeys = ['totalReceivable', 'totalAmount', 'cashAmount', 'bankAmount', 'bonusAmount', 'rewardAmount', 'returnAmount', 'collectedAmount', 'debtAmount', 'remainingAmount'];
  for (const key of roundKeys) row[key] = Math.max(0, normalizeDebtAmount(Math.round(toNumber(row[key]))));
  return row;
}

async function listDeliveryTodaySummary(query = {}) {
  const base = await listDeliveryToday({ ...(query || {}), page: 1, limit: query.limit || 5000 });
  const map = new Map();
  for (const row of base.orders || []) {
    const key = deliveryGroupKey(row.deliveryStaffCode || row.deliveryStaffName, 'NO_DELIVERY');
    if (!map.has(key)) {
      map.set(key, {
        deliveryStaffCode: row.deliveryStaffCode || '',
        deliveryStaffName: row.deliveryStaffName || row.deliveryStaffCode || 'Chưa có NVGH',
        ...buildDeliverySummaryAccumulator(row)
      });
    }
    addDeliveryRowToSummary(map.get(key), row);
  }
  const rows = Array.from(map.values()).map(finalizeDeliverySummaryRow)
    .sort((a, b) => b.totalReceivable - a.totalReceivable || String(a.deliveryStaffName).localeCompare(String(b.deliveryStaffName), 'vi'));
  return {
    date: base.accounting?.date || dateUtil.toDateOnly(query.date || dateUtil.todayVN()),
    formula: 'Tổng hợp tầng 1 theo nhân viên giao hàng; chưa render danh sách đơn để tối ưu tốc độ.',
    accounting: base.accounting,
    summary: rows,
    kpi: rows.reduce((acc, row) => {
      acc.totalOrders += row.orderCount;
      acc.delivered += row.deliveredCount;
      acc.pending += row.pendingCount;
      acc.failed += row.failedCount;
      acc.totalReceivable += row.totalReceivable || row.totalAmount || 0;
      acc.totalAmount += row.totalReceivable || row.totalAmount || 0;
      acc.collectedAmount += row.collectedAmount;
      acc.debtAmount += row.debtAmount || row.remainingAmount || 0;
      acc.remainingAmount += row.debtAmount || row.remainingAmount || 0;
      acc.cashAmount += row.cashAmount;
      acc.bankAmount += row.bankAmount;
      acc.bonusAmount += row.bonusAmount || row.rewardAmount || 0;
      acc.rewardAmount += row.bonusAmount || row.rewardAmount || 0;
      acc.returnAmount += row.returnAmount;
      return acc;
    }, { totalOrders: 0, delivered: 0, pending: 0, failed: 0, totalReceivable: 0, totalAmount: 0, collectedAmount: 0, debtAmount: 0, remainingAmount: 0, cashAmount: 0, bankAmount: 0, bonusAmount: 0, rewardAmount: 0, returnAmount: 0 })
  };
}

async function listDeliveryTodaySalesSummary(deliveryStaffCode, query = {}) {
  const deliveryKey = String(deliveryStaffCode || '').trim();
  const base = await listDeliveryToday({ ...(query || {}), delivery: deliveryKey, page: 1, limit: query.limit || 5000 });
  const map = new Map();
  for (const row of base.orders || []) {
    const sameDelivery = !deliveryKey || [row.deliveryStaffCode, row.deliveryStaffName].some((value) => normalizeText(value).includes(normalizeText(deliveryKey)) || String(value || '').trim() === deliveryKey);
    if (!sameDelivery) continue;
    const key = deliveryGroupKey(row.salesmanCode || row.salesmanName, 'NO_SALES');
    if (!map.has(key)) {
      map.set(key, {
        deliveryStaffCode: row.deliveryStaffCode || deliveryKey,
        deliveryStaffName: row.deliveryStaffName || row.deliveryStaffCode || 'Chưa có NVGH',
        salesStaffCode: row.salesmanCode || '',
        salesStaffName: row.salesmanName || row.salesmanCode || 'Chưa có NVBH',
        ...buildDeliverySummaryAccumulator(row)
      });
    }
    addDeliveryRowToSummary(map.get(key), row);
  }
  const rows = Array.from(map.values()).map(finalizeDeliverySummaryRow)
    .sort((a, b) => b.totalReceivable - a.totalReceivable || String(a.salesStaffName).localeCompare(String(b.salesStaffName), 'vi'));
  return {
    date: base.accounting?.date || dateUtil.toDateOnly(query.date || dateUtil.todayVN()),
    deliveryStaffCode: deliveryKey,
    formula: 'Tổng hợp tầng 2 theo nhân viên bán hàng nằm trong nhân viên giao hàng đã chọn.',
    summary: rows
  };
}

async function listDeliveryTodayOrdersCompact(query = {}) {
  const compactStartedAt = Date.now();
  const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 5000, 1), 5000);
  const q = normalizeText(query.q || '');
  const sales = normalizeText(query.salesStaffCode || query.salesStaff || query.salesman || '');
  const delivery = normalizeText(query.deliveryStaffCode || query.deliveryStaff || query.delivery || '');
  const route = normalizeText(query.route || query.routeName || '');
  const status = normalizeText(query.status || '');

  let masterQueryMs = 0;
  let salesQueryMs = 0;
  let returnQueryMs = 0;
  let buildRowsMs = 0;

  // Compact endpoint phải query nhẹ trực tiếp, không gọi listDeliveryToday().
  // listDeliveryToday() build đủ returnOrders/items/KPI/accounting nên gây chậm cho màn chỉ cần danh sách dòng đơn.
  const masterFilter = {
    $or: [{ date }, { deliveryDate: date }],
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed'] }
  };

  const masterOrders = await masterOrderRepository.findAll(masterFilter, {
    projection: {
      id: 1,
      code: 1,
      date: 1,
      deliveryDate: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      salesStaffCode: 1,
      salesStaffName: 1,
      routeName: 1,
      children: 1,
      childOrders: 1,
      orderIds: 1,
      childOrderIds: 1,
      salesOrderIds: 1,
      salesOrders: 1,
      orderCodes: 1,
      salesOrderCodes: 1,
      accountingConfirmed: 1,
      accountingStatus: 1,
      status: 1,
      createdAt: 1
    },
    sort: { deliveryDate: -1, createdAt: -1, code: -1 },
    limit
  });
  masterQueryMs = Date.now() - masterQueryStartedAt;

  const normalizedMasterRefs = (masterOrders || []).map(normalizeMasterSalesOrderRefs);
  const salesOrderIds = [...new Set(normalizedMasterRefs.flatMap((item) => item.salesOrderIds))];
  const salesOrderCodes = [...new Set(normalizedMasterRefs.flatMap((item) => item.salesOrderCodes))];
  const allRefs = [...new Set([...salesOrderIds, ...salesOrderCodes])];

  const childFilterParts = [];
  if (salesOrderIds.length) {
    childFilterParts.push({
      $or: [
        { id: { $in: salesOrderIds } },
        { salesOrderId: { $in: salesOrderIds } },
        { sourceOrderId: { $in: salesOrderIds } },
        { deliveryOrderId: { $in: salesOrderIds } }
      ]
    });
  }
  if (salesOrderCodes.length) {
    childFilterParts.push({
      $or: [
        { code: { $in: salesOrderCodes } },
        { orderCode: { $in: salesOrderCodes } },
        { documentCode: { $in: salesOrderCodes } },
        { invoiceCode: { $in: salesOrderCodes } },
        { salesOrderCode: { $in: salesOrderCodes } },
        { sourceOrderCode: { $in: salesOrderCodes } },
        { deliveryOrderCode: { $in: salesOrderCodes } }
      ]
    });
  }
  const childFilter = childFilterParts.length ? { $or: childFilterParts } : null;

  const salesQueryStartedAt = Date.now();
  const children = childFilter ? await orderRepository.findAll(childFilter, {
    projection: {
      id: 1,
      code: 1,
      orderCode: 1,
      documentCode: 1,
      invoiceCode: 1,
      salesOrderCode: 1,
      customerCode: 1,
      customerName: 1,
      customerPhone: 1,
      customerAddress: 1,
      salesStaffCode: 1,
      salesStaffName: 1,
      staffCode: 1,
      staffName: 1,
      salesmanCode: 1,
      salesmanName: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      routeName: 1,
      deliveryRoute: 1,
      deliveryDate: 1,
      date: 1,
      deliveryStatus: 1,
      status: 1,
      totalAmount: 1,
      totalReceivable: 1,
      receivableAmount: 1,
      grandTotal: 1,
      amount: 1,
      cashCollected: 1,
      cashAmount: 1,
      bankCollected: 1,
      bankAmount: 1,
      transferAmount: 1,
      rewardAmount: 1,
      displayRewardAmount: 1,
      bonusAmount: 1,
      bonusReturnAmount: 1,
      returnAmount: 1,
      returnedAmount: 1,
      returnAmountFromReturnOrders: 1,
      debtAmount: 1,
      remainingAmount: 1,
      collectedAmount: 1,
      accountingConfirmed: 1,
      accountingStatus: 1,
      needReAccounting: 1,
      reAccountingRequired: 1,
      adminAdjustmentOpen: 1,
      editLocked: 1,
      isLate: 1,
      deletedAt: 1
    },
    limit: Math.max(allRefs.length, limit)
  }) : [];
  salesQueryMs = Date.now() - salesQueryStartedAt;

  const childByKey = new Map();
  for (const child of children || []) {
    if (isInactiveStatus(child)) continue;
    for (const key of compactDeliveryOrderKeys(child)) childByKey.set(key, child);
  }

  // Query ReturnOrder đúng 1 lần và map theo các khóa chuẩn.
  const ReturnOrder = require('../models/ReturnOrder');
  const returnQueryStartedAt = Date.now();
  const returnOrders = (salesOrderIds.length || salesOrderCodes.length)
    ? await ReturnOrder.find({
        $or: [
          { salesOrderId: { $in: salesOrderIds } },
          { salesOrderCode: { $in: salesOrderCodes } }
        ],
        status: {
          $in: ['pending', 'active', 'merged', 'delivered', 'completed', 'cleared']
        }
      }).lean()
    : [];
  returnQueryMs = Date.now() - returnQueryStartedAt;

  const buildRowsStartedAt = Date.now();
  const returnOrderMap = new Map();
  for (const ro of returnOrders || []) {
    const keys = [
      ro.salesOrderId,
      ro.salesOrderCode,
      ro.orderId,
      ro.orderCode
    ].filter(Boolean);
    for (const k of keys) {
      const key = String(k);
      const arr = returnOrderMap.get(key) || [];
      arr.push(ro);
      returnOrderMap.set(key, arr);
    }
  }

  const rows = [];
  const used = new Set();
  for (const master of masterOrders || []) {
    if (isInactiveStatus(master)) continue;
    for (const ref of masterChildOrderRefs(master)) {
      const child = childByKey.get(ref);
      if (!child || isInactiveStatus(child)) continue;
      const uniqueKey = String(child.id || child.code || child.orderCode || ref);
      const masterKey = String(master.id || master.code || '');
      const usedKey = `${masterKey}::${uniqueKey}`;
      if (used.has(usedKey)) continue;
      used.add(usedKey);

      const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
      if (deliveryDate !== date) continue;

      // Bước 6: build rows nhẹ, không gọi các hàm tổng hợp nặng.
      // Chỉ lấy các field màn danh sách đang dùng và lookup returnOrders qua Map O(1).
      const returnKeys = compactDeliveryOrderKeys(child);
      const relatedReturnOrders = [];
      const seenReturnIds = new Set();
      for (const key of returnKeys) {
        for (const ro of returnOrderMap.get(key) || []) {
          const roKey = String(ro.id || ro.code || ro._id || `${key}-${relatedReturnOrders.length}`);
          if (seenReturnIds.has(roKey)) continue;
          seenReturnIds.add(roKey);
          relatedReturnOrders.push(ro);
        }
      }
      const returnOrderCode = relatedReturnOrders
        .map((ro) => ro.code || ro.returnOrderCode || ro.id || '')
        .find(Boolean) || '';
      const returnAmount = relatedReturnOrders.reduce((sum, ro) => sum + toNumber(
        ro.returnAmount ?? ro.totalAmount ?? ro.amount ?? ro.totalReturnAmount ?? ro.value ?? 0
      ), 0);

      const totalAmount = toNumber(
        child.totalAmount ?? child.totalReceivable ?? child.receivableAmount ?? child.grandTotal ?? child.amount ?? 0
      );
      const cashAmount = toNumber(child.cashAmount ?? child.cashCollected ?? 0);
      const bankAmount = toNumber(child.bankAmount ?? child.bankCollected ?? child.transferAmount ?? 0);
      const bonusAmount = toNumber(child.bonusAmount ?? child.rewardAmount ?? child.displayRewardAmount ?? child.bonusReturnAmount ?? 0);
      const directDebtAmount = child.debtAmount ?? child.remainingAmount;
      const debtAmount = directDebtAmount != null
        ? Math.max(0, toNumber(directDebtAmount))
        : Math.max(0, totalAmount - cashAmount - bankAmount - bonusAmount - returnAmount);

      const row = {
        id: child.id || '',
        code: child.code || child.orderCode || child.documentCode || child.salesOrderCode || child.id || '',
        customerCode: child.customerCode || '',
        customerName: child.customerName || '',
        salesStaffCode: child.salesStaffCode || child.salesmanCode || child.staffCode || master.salesStaffCode || '',
        salesStaffName: child.salesStaffName || child.salesmanName || child.staffName || master.salesStaffName || '',
        deliveryStaffCode: child.deliveryStaffCode || master.deliveryStaffCode || '',
        deliveryDate,
        totalAmount,
        cashAmount,
        bankAmount,
        bonusAmount,
        returnAmount,
        debtAmount,
        status: child.status || '',
        deliveryStatus: child.deliveryStatus || 'waiting',
        hasReturn: relatedReturnOrders.length > 0 || returnAmount > 0,
        returnOrderCode
      };

      if (q && ![row.code, row.customerCode, row.customerName].some((value) => normalizeText(value).includes(q))) continue;
      if (sales && ![row.salesStaffCode, row.salesStaffName].some((value) => normalizeText(value).includes(sales))) continue;
      if (delivery && !normalizeText(row.deliveryStaffCode).includes(delivery)) continue;
      if (route) {
        const rowRoute = child.routeName || child.deliveryRoute || master.routeName || '';
        if (!normalizeText(rowRoute).includes(route)) continue;
      }
      if (status) {
        const rawStatus = normalizeText(row.status);
        const rawDeliveryStatus = normalizeText(row.deliveryStatus);
        const isDeliveredGroup = ['delivered', 'done', 'completed', 'paid'].includes(rawStatus)
          || ['delivered', 'done', 'completed', 'paid'].includes(rawDeliveryStatus);
        const isNotDeliveredGroup = !isDeliveredGroup;
        if (status === 'delivered_group' && !isDeliveredGroup) continue;
        else if (status === 'not_delivered' && !isNotDeliveredGroup) continue;
        else if (status === 'returned' && !row.hasReturn) continue;
        else if (!['delivered_group', 'not_delivered', 'returned', 'accounting_confirmed', 'accounting_pending'].includes(status) && rawStatus !== status && rawDeliveryStatus !== status) continue;
      }

      rows.push(row);
      if (rows.length >= limit) break;
    }
    if (rows.length >= limit) break;
  }

  const summary = rows.reduce((acc, row) => {
    acc.totalReceivable += toNumber(row.totalAmount);
    acc.cashAmount += toNumber(row.cashAmount);
    acc.bankAmount += toNumber(row.bankAmount);
    acc.bonusAmount += toNumber(row.bonusAmount);
    acc.returnAmount += toNumber(row.returnAmount);
    acc.debtAmount += toNumber(row.debtAmount);
    return acc;
  }, {
    totalReceivable: 0,
    cashAmount: 0,
    bankAmount: 0,
    bonusAmount: 0,
    returnAmount: 0,
    debtAmount: 0
  });

  buildRowsMs = Date.now() - buildRowsStartedAt;
  const ms = Date.now() - compactStartedAt;
  const totalMs = ms;
  const perf = {
    masterQueryMs,
    salesQueryMs,
    returnQueryMs,
    buildRowsMs,
    totalMs,
    compactMs: ms,
    masterCount: masterOrders.length,
    childRefCount: allRefs.length,
    childCount: children.length,
    returnOrderCount: returnOrders.length,
    compactRowCount: rows.length
  };

  return {
    ok: true,
    orders: rows,
    rows,
    summary,
    total: rows.length,
    ms,
    perf
  };
}

async function updateDeliveryTodayOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn giao hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn đã hủy/xóa, không thể chỉnh sửa giao hàng', status: 400 };
  if (isAccountingConfirmed(current) && !isAccountingReopenPending(current)) return { error: 'Kế toán đã xác nhận, đơn giao đã khóa. Admin phải bấm mở khóa điều chỉnh trước khi sửa', status: 400 };

  const debtBeforeCollection = deliveryFinance.deliveryDebtBase({ ...current, ...body });
  const cashCollected = toNumber(body.cashCollected ?? current.cashCollected ?? current.cashAmount ?? 0);
  const bankCollected = toNumber(body.bankCollected ?? current.bankCollected ?? current.transferAmount ?? current.bankAmount ?? 0);
  const rewardAmount = toNumber(body.rewardAmount ?? current.rewardAmount ?? current.displayRewardAmount ?? 0);

  // Danh sách trả hàng trên phần mềm là read-only. Nguồn chuẩn luôn là returnOrders,
  // không nhận returnItems/returnAmount từ form web để tránh ghi đè dữ liệu app giao hàng.
  // V45 speed fix: chỉ query returnOrders theo đúng đơn đang sửa, không load toàn bộ collection.
  const relatedReturnOrders = await findReturnOrdersForDeliveryChildren([current]);
  const lockedReturnOrder = getLockedReturnOrderForSalesOrder(relatedReturnOrders, current);
  const syncedReturnItems = returnItemsForSalesOrder(relatedReturnOrders, current);
  const syncedReturnAmount = returnAmountForSalesOrder(relatedReturnOrders, current);
  if (Array.isArray(body.returnItems)) {
    return { error: 'Danh sách hàng trả chỉ được sửa trên app giao hàng. Phần mềm chỉ xem/duyệt và không được ghi đè returnOrders.', status: 400 };
  }
  const effectiveReturnItems = lockedReturnOrder ? returnItemsForSalesOrder([lockedReturnOrder], current) : syncedReturnItems;
  const effectiveReturnAmount = lockedReturnOrder ? returnOrderTotalAmount(lockedReturnOrder) : syncedReturnAmount;

  // Chặn nghiệp vụ trả vượt phải thu ngay tại service để tránh âm công nợ/AR Ledger sai,
  // kể cả khi người dùng bỏ qua kiểm tra ở giao diện.
  const totalEntered = Math.round(cashCollected + bankCollected + effectiveReturnAmount + rewardAmount);
  const receivable = Math.round(debtBeforeCollection);
  if ((totalEntered - receivable) > DEBT_ZERO_TOLERANCE) {
    const overAmount = totalEntered - receivable;
    return {
      error: `Khách đang trả vượt số phải thu\n\nPhải thu: ${receivable.toLocaleString('vi-VN')}\nĐã nhập: ${totalEntered.toLocaleString('vi-VN')}\n\nVượt: ${overAmount.toLocaleString('vi-VN')}\n\n[Quay lại chỉnh]`,
      status: 400
    };
  }

  // Công thức chuẩn duy nhất cho toàn bộ luồng giao hàng:
  // Còn nợ = Phải thu - Tiền mặt - Chuyển khoản - Trả thưởng - Tổng tiền hàng trả
  let debtAmount = deliveryFinance.calculateDeliveryDebt({ debtBeforeCollection, cashCollected, bankCollected, returnAmount: effectiveReturnAmount, rewardAmount });
  debtAmount = Math.max(0, normalizeDebtAmount(debtAmount));
  const deliveryStatus = String(body.deliveryStatus || current.deliveryStatus || 'waiting').trim();

  const updated = {
    ...current,
    deliveryDate: dateUtil.toDateOnly(body.deliveryDate || current.deliveryDate || current.date || dateUtil.todayVN()),
    deliveryStatus,
    status: deliveryStatus === 'delivered' ? 'delivered' : (current.status || 'posted'),
    deliveryStaffCode: String(body.deliveryStaffCode ?? current.deliveryStaffCode ?? '').trim(),
    deliveryStaffName: String(body.deliveryStaffName ?? current.deliveryStaffName ?? '').trim(),
    routeName: String(body.routeName ?? current.routeName ?? current.deliveryRoute ?? '').trim(),
    deliveryRoute: String(body.routeName ?? current.deliveryRoute ?? current.routeName ?? '').trim(),
    debtBeforeCollection,
    cashCollected,
    cashAmount: cashCollected,
    bankCollected,
    transferAmount: bankCollected,
    bankAmount: bankCollected,
    returnAmount: effectiveReturnAmount,
    returnedAmount: effectiveReturnAmount,
    rewardAmount,
    returnItems: effectiveReturnItems,
    deliveryReturnItems: effectiveReturnItems,
    debtAmount,
    debt: debtAmount,
    arBalance: debtAmount,
    accountingStatus: isAccountingReopenPending(current) ? 'needs_repost' : (current.accountingStatus || 'draft_delivery'),
    accountingConfirmed: isAccountingReopenPending(current) ? false : Boolean(current.accountingConfirmed),
    accountingLocked: isAccountingReopenPending(current) ? false : Boolean(current.accountingLocked),
    editLocked: isAccountingReopenPending(current) ? false : Boolean(current.editLocked),
    needReAccounting: isAccountingReopenPending(current) ? true : Boolean(current.needReAccounting),
    adminAdjustmentOpen: isAccountingReopenPending(current) ? true : Boolean(current.adminAdjustmentOpen),
    arStatus: isAccountingReopenPending(current) ? 'needs_repost' : orderDebtLifecycleStatus(debtAmount, deliveryStatus, current),
    lifecycleStatus: isAccountingReopenPending(current) ? 'needs_repost' : (isDeliveryCompletedStatus(deliveryStatus)
      ? 'pending_accounting'
      : (current.lifecycleStatus || 'assigned_delivery')),
    arPostedAt: isAccountingReopenPending(current) ? '' : (current.arPostedAt || ''),
    deliveryNote: String(body.deliveryNote ?? current.deliveryNote ?? '').trim(),
    updatedAt: dateUtil.nowIso()
  };

  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(updated, { session });
  });

  // Phần mềm không sinh/chỉnh phiếu returnOrders ở màn giao hàng hôm nay.
  // returnOrders phải phát sinh từ app giao hàng để giữ đúng nguồn nghiệp vụ.

  return { salesOrder: updated };
}


async function adminUnlockDeliveryAccounting(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn giao hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn đã hủy/xóa, không thể mở khóa', status: 400 };
  if (!isAccountingConfirmed(current) && !current.editLocked) {
    return { error: 'Đơn chưa được kế toán xác nhận, vẫn đang được sửa bình thường', status: 400 };
  }
  if (current.cashClosed || current.cashSubmitted || current.dayLocked || current.periodLocked || current.settlementClosed) {
    return { error: 'Đơn đã chốt quỹ/khóa ngày/khóa kỳ. Không mở khóa đơn gốc; hãy tạo phiếu điều chỉnh công nợ riêng.', status: 400 };
  }
  const reason = String(body.reason || body.unlockReason || '').trim();
  if (!reason) return { error: 'Vui lòng nhập lý do mở khóa điều chỉnh', status: 400 };
  const now = dateUtil.nowIso();
  const unlocked = {
    ...current,
    accountingLocked: false,
    editLocked: false,
    deliveryLocked: false,
    accountingConfirmed: false,
    accountingStatus: 'needs_repost',
    needReAccounting: true,
    reAccountingRequired: true,
    adminAdjustmentOpen: true,
    unlockReason: reason,
    unlockedAt: now,
    unlockedBy: String(body.unlockedBy || body.userName || body.adminName || 'admin').trim(),
    arStatus: 'needs_repost',
    lifecycleStatus: 'needs_repost',
    updatedAt: now
  };
  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(unlocked, { session });
  });
  return { salesOrder: unlocked, message: `Đã mở khóa điều chỉnh đơn ${orderDisplayCode(unlocked)}. Sau khi lưu phải xác nhận lại kế toán để reverse/post lại AR Ledger.` };
}

async function confirmDeliveryAccounting(body = {}) {
  const date = dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = Array.isArray(body.orderIds)
    ? body.orderIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  // Bắt buộc phải có danh sách đơn được tick chọn.
  // Trước đây khi orderIds rỗng/mất selection, backend tự hiểu là chọn toàn bộ đơn trong ngày,
  // dẫn đến lỗi ấn xác nhận một vài đơn nhưng cả ngày bị đẩy sang công nợ.
  if (!selectedOrderIds.length) {
    return { error: 'Vui lòng chọn ít nhất một đơn để đẩy sang công nợ', status: 400 };
  }

  const selectedIdSet = new Set(selectedOrderIds);
  const confirmedBy = String(body.confirmedBy || body.userName || body.accountantName || 'accountant').trim();
  const now = dateUtil.nowIso();
  const masterOrders = await listMasterOrders({ excludeInactive: 1, dateFrom: date, dateTo: date });
  const targetMasters = new Map();
  const targetChildren = [];

  const childKeys = (child = {}) => [
    child.id,
    child._id,
    child.code,
    child.orderCode,
    child.documentCode
  ].map((v) => String(v || '').trim()).filter(Boolean);

  for (const master of masterOrders) {
    const children = Array.isArray(master.children) ? master.children : [];
    const matched = children.filter((child) => {
      if (isInactiveStatus(child)) return false;
      const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
      if (deliveryDate !== date) return false;
      return childKeys(child).some((key) => selectedIdSet.has(key));
    });
    if (matched.length) {
      const masterKey = String(master.id || master.code || '').trim() || `master-${targetMasters.size}`;
      targetMasters.set(masterKey, { master, matched });
      targetChildren.push(...matched.map((child) => ({ master, child })));
    }
  }

  if (!targetChildren.length) {
    return { error: `Không tìm thấy đơn đã chọn trong ngày ${date} để kế toán xác nhận`, status: 404 };
  }

  let confirmedOrders = 0;
  let skippedOrders = 0;
  await withMongoTransaction(async (session) => {
    for (const { master, matched } of targetMasters.values()) {
      const children = Array.isArray(master.children) ? master.children : [];
      const activeChildrenInDate = children.filter((child) => {
        if (isInactiveStatus(child)) return false;
        const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
        return deliveryDate === date;
      });
      const matchedKeySet = new Set(matched.flatMap((child) => childKeys(child)));
      const allChildrenConfirmed = activeChildrenInDate.length > 0 && activeChildrenInDate.every((child) => {
        if (!isAccountingReopenPending(child) && isAccountingConfirmed(child)) return true;
        return childKeys(child).some((key) => matchedKeySet.has(key));
      });

      // Chỉ khóa/xác nhận đơn tổng khi toàn bộ đơn con trong ngày của đơn tổng đã được chọn
      // hoặc đã xác nhận từ trước. Nếu chỉ chọn một phần, tuyệt đối không set cờ master,
      // vì listDeliveryToday đang coi master.accountingConfirmed là khóa tất cả đơn con.
      await masterOrderRepository.upsert({
        ...master,
        accountingConfirmed: allChildrenConfirmed,
        accountingStatus: allChildrenConfirmed ? 'confirmed' : (master.accountingStatus || 'draft_delivery'),
        accountingConfirmedAt: allChildrenConfirmed ? (master.accountingConfirmedAt || now) : (master.accountingConfirmedAt || ''),
        accountingConfirmedBy: allChildrenConfirmed ? (master.accountingConfirmedBy || confirmedBy) : (master.accountingConfirmedBy || ''),
        deliveryLocked: allChildrenConfirmed,
        children: [],
        updatedAt: now
      }, { session });
    }

    const normalPostChildren = [];
    const orderUpdateOps = [];

    for (const { child } of targetChildren) {
      const alreadyConfirmed = isAccountingConfirmed(child);
      const requiresReAccounting = isAccountingReopenPending(child);
      const debtAmount = Math.max(0, normalizeDebtAmount(child.debtAmount ?? child.debt ?? deliveryFinance.calculateDeliveryDebt(child)));
      const updated = {
        ...child,
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        accountingLocked: true,
        accountingConfirmedAt: child.accountingConfirmedAt || now,
        accountingConfirmedBy: child.accountingConfirmedBy || confirmedBy,
        editLocked: true,
        deliveryLocked: true,
        needReAccounting: false,
        reAccountingRequired: false,
        adminAdjustmentOpen: false,
        debtAmount,
        debt: debtAmount,
        arBalance: debtAmount,
        arStatus: hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid',
        lifecycleStatus: hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid',
        arPostedAt: child.arPostedAt || now,
        reAccountingAt: requiresReAccounting ? now : (child.reAccountingAt || ''),
        reAccountingBy: requiresReAccounting ? confirmedBy : (child.reAccountingBy || ''),
        reAccountingNote: requiresReAccounting ? 'Reverse AR cũ và post lại AR mới sau điều chỉnh admin' : (child.reAccountingNote || ''),
        updatedAt: now
      };

      if (requiresReAccounting) {
        // Đơn đã mở khóa/sửa sau khi post AR: giữ đúng luồng kế toán bằng reversal trước, sau đó post lại.
        const reverseResult = await reverseActiveArLedgersForOrder(child, { name: confirmedBy }, { session });
        await postDeliveryArLedgerRowsAfterReAccounting(updated, reverseResult.batchId, { session });
      } else if (!alreadyConfirmed) {
        // Đơn mới xác nhận lần đầu: gom lại để ghi AR Ledger bằng insertMany một lần.
        normalPostChildren.push(updated);
      }

      orderUpdateOps.push({
        updateOne: {
          filter: buildIdentityInFilter(compactDeliveryOrderKeys(updated), ['id', 'code', 'orderCode', 'documentCode']) || { id: updated.id || updated.code },
          update: { $set: updated },
          upsert: true
        }
      });

      if (alreadyConfirmed && !requiresReAccounting) skippedOrders += 1; else confirmedOrders += 1;
    }

    const batchPostResult = await batchPostDeliveryArLedgers(normalPostChildren, confirmedBy, { session });
    skippedOrders += batchPostResult.skippedPostedKeys.size;

    if (orderUpdateOps.length) {
      await MongoStore.salesOrders.bulkWrite(orderUpdateOps, { ordered: false, session });
    }
    // Công nợ khách hàng chỉ lấy từ AR Ledger; không cộng trực tiếp vào customer.currentDebt để tránh 2 nguồn công nợ.
  });

  return {
    date,
    confirmedOrders,
    skippedOrders,
    totalOrders: targetChildren.length,
    message: `Kế toán đã xác nhận ${targetChildren.length} đơn giao ngày ${date}. Đơn đã khóa chỉnh sửa và đã đưa vào công nợ.`
  };
}


function cleanMasterPrintText(value) {
  return String(value ?? '').trim();
}

function getItemProductCodeForMasterPrint(item = {}) {
  return cleanMasterPrintText(item.productCode || item.code || item.sku || item.maHang || item.productId);
}

function getItemProductNameForMasterPrint(item = {}, product = {}) {
  return cleanMasterPrintText(item.productName || item.name || item.tenHang || product.name || product.productName);
}

function getItemUnitForMasterPrint(item = {}, product = {}) {
  return cleanMasterPrintText(item.unit || item.dvt || product.unit || product.baseUnit || 'Cái');
}

function getItemPriceForMasterPrint(item = {}, product = {}) {
  return toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? item.priceAfterDiscount ?? product.salePrice ?? product.price ?? 0);
}

function getItemQuantityForMasterPrint(item = {}) {
  return toNumber(item.quantity ?? item.qty ?? item.totalQuantity ?? item.soLuong ?? item.baseQty ?? 0);
}

function getItemPackForMasterPrint(item = {}, product = {}) {
  return toNumber(item.packingQty ?? item.conversionRate ?? item.unitsPerCase ?? item.qtyPerCase ?? item.packSize ?? product.conversionRate ?? 1) || 1;
}

async function buildAggregateMasterPrintDocument(body = {}) {
  const inputIds = body.masterOrderIds || body.ids || body.masterOrders || [];
  const ids = (Array.isArray(inputIds) ? inputIds : String(inputIds || '').split(','))
    .map((value) => cleanMasterPrintText(value))
    .filter(Boolean);
  if (!ids.length) return { error: 'Chưa chọn đơn tổng để in', status: 400 };

  const masterOrders = [];
  const missingIds = [];
  for (const id of ids) {
    const master = await masterOrderRepository.findByIdOrCode(id);
    if (master) masterOrders.push(master);
    else missingIds.push(id);
  }
  if (!masterOrders.length) return { error: 'Không tìm thấy đơn tổng đã chọn', status: 404 };

  const masterCodes = masterOrders.map((order) => cleanMasterPrintText(order.code || order.id)).filter(Boolean);
  const allChildren = [];
  for (const master of masterOrders) {
    const children = await orderService.getMasterChildren(master);
    for (const child of children) {
      if (isInactiveStatus(child)) continue;
      allChildren.push({ ...child, sourceMasterCode: master.code || master.id || '' });
    }
  }

  const productCodes = Array.from(new Set(allChildren.flatMap((child) => (Array.isArray(child.items) ? child.items : [])
    .map(getItemProductCodeForMasterPrint)
    .filter(Boolean))));
  const products = productCodes.length ? await Product.find({ code: { $in: productCodes } }).lean() : [];
  const productMap = new Map(products.map((product) => [cleanMasterPrintText(product.code || product.productCode || product.sku), product]));
  const grouped = new Map();

  for (const child of allChildren) {
    const childCode = cleanMasterPrintText(child.code || child.orderCode || child.id);
    for (const item of (Array.isArray(child.items) ? child.items : [])) {
      const productCode = getItemProductCodeForMasterPrint(item);
      if (!productCode) continue;
      const product = productMap.get(productCode) || {};
      const productName = getItemProductNameForMasterPrint(item, product);
      const unit = getItemUnitForMasterPrint(item, product);
      const price = getItemPriceForMasterPrint(item, product);
      const quantity = getItemQuantityForMasterPrint(item);
      const pack = getItemPackForMasterPrint(item, product);
      const key = [productCode, productName, unit, price].map(cleanMasterPrintText).join('|');
      const row = grouped.get(key) || {
        code: productCode,
        productCode,
        name: productName,
        productName,
        unit,
        price,
        salePrice: price,
        quantity: 0,
        qty: 0,
        amount: 0,
        conversionRate: pack,
        packingQty: pack,
        warehouseCode: cleanMasterPrintText(product.warehouseCode || item.warehouseCode || item.warehouse || 'KHO_HC'),
        warehouseName: cleanMasterPrintText(product.warehouseName || item.warehouseName || ''),
        sourceOrderCodes: [],
        sourceMasterCodes: []
      };
      row.quantity += quantity;
      row.qty += quantity;
      row.amount += quantity * price;
      if (childCode && !row.sourceOrderCodes.includes(childCode)) row.sourceOrderCodes.push(childCode);
      if (child.sourceMasterCode && !row.sourceMasterCodes.includes(child.sourceMasterCode)) row.sourceMasterCodes.push(child.sourceMasterCode);
      grouped.set(key, row);
    }
  }

  const items = Array.from(grouped.values()).sort((a, b) => String(a.code).localeCompare(String(b.code), 'vi', { numeric: true }));
  const totalQty = items.reduce((sum, item) => sum + toNumber(item.qty), 0);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const firstMaster = masterOrders[0] || {};

  return {
    document: {
      id: `PRINT_AGG_${Date.now()}`,
      code: masterCodes.length <= 3 ? masterCodes.join(', ') : `${masterCodes.slice(0, 3).join(', ')} +${masterCodes.length - 3}`,
      date: dateUtil.toDateOnly(body.date || firstMaster.deliveryDate || firstMaster.date || dateUtil.todayVN()),
      deliveryDate: dateUtil.toDateOnly(body.date || firstMaster.deliveryDate || firstMaster.date || dateUtil.todayVN()),
      routeName: masterOrders.map((order) => cleanMasterPrintText(order.routeName)).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      deliveryStaffCode: masterOrders.map((order) => cleanMasterPrintText(order.deliveryStaffCode)).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      deliveryStaffName: masterOrders.map((order) => cleanMasterPrintText(order.deliveryStaffName)).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      note: `Đơn tổng gộp từ: ${masterCodes.join(', ')}${missingIds.length ? `. Không tìm thấy: ${missingIds.join(', ')}` : ''}`,
      masterOrderCodes: masterCodes,
      selectedMasterOrderCount: masterOrders.length,
      children: allChildren,
      orderCount: allChildren.length,
      totalOrders: allChildren.length,
      totalQuantity: totalQty,
      totalQty,
      totalAmount,
      goodsAmount: totalAmount,
      items,
      printMode: 'MASTER_AGGREGATE_SELECTED'
    }
  };
}

async function createMasterOrder(body = {}) {
  const startedAt = Date.now();
  const childIds = [...new Set((Array.isArray(body.childOrderIds) ? body.childOrderIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!childIds.length) return { error: 'Chưa chọn đơn con để gộp', status: 400 };

  // Tăng tốc gộp đơn: chỉ query đúng các đơn được tick, không load toàn bộ orders.
  const children = (await orderRepository.findManyByIdentity(childIds))
    .filter((order) => !isInactiveStatus(order));
  const foundKeys = new Set(children.flatMap((order) => [order.id, order.code, order.documentCode, order.orderCode, order.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
  const missingIds = childIds.filter((id) => !foundKeys.has(id));
  if (missingIds.length || children.length !== childIds.length) {
    return { error: `Một số đơn con không tồn tại hoặc đã bị hủy/xóa: ${missingIds.join(', ')}`, status: 400 };
  }
  if (children.some((order) => order.masterOrderId || order.masterOrderCode || (order.mergeStatus || 'unmerged') === 'merged')) {
    return { error: 'Có đơn con đã được gộp trước đó', status: 400 };
  }

  const deliveryStaff = await resolveStaff(body, 'delivery');
  const salesStaff = await resolveStaff(body, 'sales');
  const deliveryDate = dateUtil.toDateOnly(body.deliveryDate || body.date || dateUtil.todayVN());
  const masterOrder = {
    ...body,
    id: String(body.id || makeId('MO')).trim(),
    // Không quét toàn bộ master_orders để sinh mã vì thao tác này rất chậm khi dữ liệu lớn.
    code: String(body.code || makeId('DT')).trim(),
    date: dateUtil.toDateOnly(body.date || deliveryDate),
    deliveryDate,
    routeName: String(body.routeName || '').trim(),
    note: String(body.note || body.deliveryNote || '').trim(),
    deliveryNote: String(body.deliveryNote || body.note || '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || '',
    salesStaffId: salesStaff?.id || body.salesStaffId || '',
    salesStaffCode: salesStaff?.code || body.salesStaffCode || '',
    salesStaffName: salesStaff?.name || body.salesStaffName || '',
    childOrderIds: children.map((order) => order.id || order.code),
    children: [],
    status: body.status || 'assigned',
    ...orderService.summarizeOrders(children),
    createdAt: body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };

  const childOrderKeys = [...new Set(children.flatMap((child) => [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)))];
  const childCodes = [...new Set(children.map((child) => String(child.code || child.orderCode || child.salesOrderCode || '').trim()).filter(Boolean))];
  const now = dateUtil.nowIso();

  await withMongoTransaction(async (session) => {
    await masterOrderRepository.upsert(masterOrder, { session });

    const setPatch = {
      masterOrderId: masterOrder.id,
      masterOrderCode: masterOrder.code,
      mergeStatus: 'merged',
      status: 'assigned',
      lifecycleStatus: 'assigned',
      arStatus: 'pending',
      accountingStatus: 'pending',
      accountingConfirmed: false,
      deliveryDate: masterOrder.deliveryDate,
      deliveryStaffId: masterOrder.deliveryStaffId,
      deliveryStaffCode: masterOrder.deliveryStaffCode,
      deliveryStaffName: masterOrder.deliveryStaffName,
      routeName: masterOrder.routeName,
      deliveryRoute: masterOrder.routeName,
      updatedAt: now
    };

    await MongoStore.salesOrders.bulkWrite(children.map((child) => ({
      updateOne: {
        filter: { $or: [
          { id: child.id },
          { code: child.code },
          { documentCode: child.documentCode },
          { orderCode: child.orderCode },
          { salesOrderCode: child.salesOrderCode }
        ].filter((item) => Object.values(item)[0]) },
        update: { $set: { ...setPatch, deliveryStatus: child.deliveryStatus || 'pending' } }
      }
    })), { ordered: false, session });

    // Sync returnOrders bằng một lệnh bulk, không gọi từng đơn trong vòng lặp.
    if (childOrderKeys.length || childCodes.length) {
      await MongoStore.returnOrders.updateMany(
        {
          $or: [
            { salesOrderId: { $in: childOrderKeys } },
            { orderId: { $in: childOrderKeys } },
            { sourceOrderId: { $in: childOrderKeys } },
            { deliveryOrderId: { $in: childOrderKeys } },
            { salesOrderCode: { $in: childCodes } },
            { orderCode: { $in: childCodes } },
            { sourceOrderCode: { $in: childCodes } },
            { deliveryOrderCode: { $in: childCodes } }
          ],
          status: { $nin: ['posted', 'confirmed', 'cancelled', 'canceled', 'void', 'deleted'] }
        },
        {
          $set: {
            masterOrderId: masterOrder.id,
            masterOrderCode: masterOrder.code,
            deliveryStaffId: masterOrder.deliveryStaffId,
            deliveryStaffCode: masterOrder.deliveryStaffCode,
            deliveryStaffName: masterOrder.deliveryStaffName,
            deliveryDate: masterOrder.deliveryDate,
            routeName: masterOrder.routeName,
            updatedAt: now
          }
        },
        { session }
      );
    }
  });

  const updatedChildren = await orderService.getMasterChildren(masterOrder);
  console.log('[CREATE_MASTER_ORDER_DONE]', { ms: Date.now() - startedAt, code: masterOrder.code, childCount: children.length });
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
  const deliveryDate = dateUtil.toDateOnly(body.deliveryDate || current.deliveryDate || body.date || current.date || dateUtil.todayVN());
  const updated = {
    ...current,
    ...body,
    date: dateUtil.toDateOnly(body.date || current.date || deliveryDate),
    deliveryDate,
    routeName: String(body.routeName ?? current.routeName ?? '').trim(),
    note: String(body.note ?? body.deliveryNote ?? current.note ?? current.deliveryNote ?? '').trim(),
    deliveryNote: String(body.deliveryNote ?? body.note ?? current.deliveryNote ?? current.note ?? '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || current.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || current.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || current.deliveryStaffName || '',
    salesStaffId: salesStaff?.id || body.salesStaffId || current.salesStaffId || '',
    salesStaffCode: salesStaff?.code || body.salesStaffCode || current.salesStaffCode || '',
    salesStaffName: salesStaff?.name || body.salesStaffName || current.salesStaffName || '',
    updatedAt: dateUtil.nowIso()
  };

  const children = await orderService.getMasterChildren(current);
  const summary = orderService.summarizeOrders(children);
  Object.assign(updated, summary);

  const childOrderKeys = [...new Set((children || []).flatMap((child) => [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)))];
  const childCodes = [...new Set((children || []).map((child) => String(child.code || child.orderCode || child.salesOrderCode || '').trim()).filter(Boolean))];
  const now = dateUtil.nowIso();

  await withMongoTransaction(async (session) => {
    await masterOrderRepository.upsert(updated, { session });

    if (children.length) {
      await MongoStore.salesOrders.bulkWrite(children.map((child) => ({
        updateOne: {
          filter: { $or: [
            { id: child.id },
            { code: child.code },
            { documentCode: child.documentCode },
            { orderCode: child.orderCode },
            { salesOrderCode: child.salesOrderCode }
          ].filter((item) => Object.values(item)[0]) },
          update: { $set: {
            deliveryDate: updated.deliveryDate,
            deliveryStaffId: updated.deliveryStaffId,
            deliveryStaffCode: updated.deliveryStaffCode,
            deliveryStaffName: updated.deliveryStaffName,
            routeName: updated.routeName,
            deliveryRoute: updated.routeName,
            updatedAt: now
          } }
        }
      })), { ordered: false, session });
    }

    // Sync returnOrders bằng updateMany, không gọi attachMasterOrderToReturnDrafts từng đơn.
    if (childOrderKeys.length || childCodes.length) {
      await MongoStore.returnOrders.updateMany(
        {
          $or: [
            { salesOrderId: { $in: childOrderKeys } },
            { orderId: { $in: childOrderKeys } },
            { sourceOrderId: { $in: childOrderKeys } },
            { deliveryOrderId: { $in: childOrderKeys } },
            { salesOrderCode: { $in: childCodes } },
            { orderCode: { $in: childCodes } },
            { sourceOrderCode: { $in: childCodes } },
            { deliveryOrderCode: { $in: childCodes } }
          ],
          status: { $nin: ['posted', 'confirmed', 'cancelled', 'canceled', 'void', 'deleted'] }
        },
        {
          $set: {
            masterOrderId: updated.id,
            masterOrderCode: updated.code,
            deliveryStaffId: updated.deliveryStaffId,
            deliveryStaffCode: updated.deliveryStaffCode,
            deliveryStaffName: updated.deliveryStaffName,
            deliveryDate: updated.deliveryDate,
            routeName: updated.routeName,
            updatedAt: now
          }
        },
        { session }
      );
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
    cancelledAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await withMongoTransaction(async (session) => {
    for (const child of children) {
      const updatedChild = {
        ...child,
        masterOrderId: '',
        masterOrderCode: '',
        mergeStatus: 'unmerged',
        status: 'pending',
        lifecycleStatus: 'pending',
        deliveryStatus: 'pending',
        deliveryStaffId: '',
        deliveryStaffCode: '',
        deliveryStaffName: '',
        routeName: '',
        deliveryRoute: '',
        updatedAt: dateUtil.nowIso()
      };
      await orderRepository.upsert(updatedChild, { session });
      await returnOrderService.detachMasterOrderFromReturnDrafts([updatedChild], { session });
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
    deletedAt: dateUtil.nowIso(),
    deleteReason: String(body.reason || body.deleteReason || '').trim(),
    updatedAt: dateUtil.nowIso()
  };
  await withMongoTransaction(async (session) => {
    for (const child of children) {
      const updatedChild = {
        ...child,
        masterOrderId: '',
        masterOrderCode: '',
        mergeStatus: 'unmerged',
        status: 'pending',
        lifecycleStatus: 'pending',
        deliveryStatus: 'pending',
        deliveryStaffId: '',
        deliveryStaffCode: '',
        deliveryStaffName: '',
        routeName: '',
        deliveryRoute: '',
        updatedAt: dateUtil.nowIso()
      };
      await orderRepository.upsert(updatedChild, { session });
      await returnOrderService.detachMasterOrderFromReturnDrafts([updatedChild], { session });
    }
    await masterOrderRepository.upsert(removed, { session });
  });
  
const summary = rows.reduce((acc,row)=>{
  acc.totalReceivable += Number(row.totalAmount||0);
  acc.cashAmount += Number(row.cashAmount||0);
  acc.bankAmount += Number(row.bankAmount||0);
  acc.bonusAmount += Number(row.bonusAmount||0);
  acc.returnAmount += Number(row.returnAmount||0);
  acc.debtAmount += Number(row.debtAmount||0);
  return acc;
},{
 totalReceivable:0,cashAmount:0,bankAmount:0,bonusAmount:0,returnAmount:0,debtAmount:0
});

return { masterOrder: toClient(removed, []) };
}

module.exports = {
  listUnmergedChildOrders,
  listMasterOrders,
  listDeliveryToday,
  listDeliveryTodaySummary,
  listDeliveryTodaySalesSummary,
  listDeliveryTodayOrdersCompact,
  confirmDeliveryAccounting,
  adminUnlockDeliveryAccounting,
  updateDeliveryTodayOrder,
  getMasterOrder,
  buildAggregateMasterPrintDocument,
  createMasterOrder,
  updateMasterOrder,
  cancelMasterOrder,
  deleteMasterOrder
};
