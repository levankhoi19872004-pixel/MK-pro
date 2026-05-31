'use strict';

const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const userRepository = require('../repositories/userRepository');
const customerRepository = require('../repositories/customerRepository');
const orderService = require('./orderService');
const returnOrderService = require('./returnOrderService');
const reportService = require('./reportService');
const postingEngine = require('../engines/posting.engine');
const { makeId, normalizeText } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const { normalizeOrderSourceValue } = require('../utils/orderSource.util');

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
    let day = a;
    let month = b;
    // File DMS thường là M/D/YY, còn app Việt Nam thường là D/M/YYYY.
    // Nếu số đầu <=12 và số sau >12 thì chắc chắn là M/D. Các trường hợp còn lại giữ D/M.
    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return raw.slice(0, 10);
}

function orderDeliveryFilterDate(order = {}) {
  return normalizeOrderDateForMaster(order.deliveryDate || order.orderDate || order.date || order.createdAt || '');
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
  const date = normalizeOrderDateForMaster(query.date);
  const salesStaff = normalizeText(query.salesStaff);
  const orders = await orderService.listOrders({});
  return orders
    .filter(isUnmergedChildOrder)
    .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.customerPhone, order.customerAddress].some((value) => normalizeText(value).includes(q)))
    .filter((order) => !sourceKey || normalizeOrderSourceForMaster(order) === sourceKey)
    .filter((order) => !date || orderDeliveryFilterDate(order) === date)
    .filter((order) => !salesStaff || [order.staffCode, order.staffName, order.salesStaffCode, order.salesStaffName].some((value) => normalizeText(value).includes(salesStaff)));
}

async function listMasterOrders(query = {}) {
  const q = normalizeText(query.q);
  const dateFrom = String(query.dateFrom || '').slice(0, 10);
  const dateTo = String(query.dateTo || '').slice(0, 10);
  const excludeInactive = String(query.excludeInactive ?? '0') !== '0';
  const masterOrders = await masterOrderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  const result = [];
  for (const masterOrder of masterOrders) {
    const children = await orderService.getMasterChildren(masterOrder);
    const order = toClient(masterOrder, children);
    const d = String(order.deliveryDate || order.date || '').slice(0, 10);
    if (excludeInactive && isInactiveStatus(order)) continue;
    if (q && ![order.code, order.routeName, order.deliveryStaffName, order.deliveryStaffCode].some((value) => normalizeText(value).includes(q))) continue;
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    result.push(order);
  }
  return result;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deliveryDebtBase(order = {}) {
  return toNumber(order.debtBeforeCollection ?? order.totalAmount ?? order.amount ?? order.debtAmount ?? order.debt ?? 0);
}

function deliveryReturnAmount(order = {}) {
  return toNumber(order.returnAmount ?? order.returnedAmount ?? 0);
}

function deliveryRewardAmount(order = {}) {
  return toNumber(order.rewardAmount ?? order.displayRewardAmount ?? order.bonusReturnAmount ?? 0);
}

function isActiveReturnOrder(row = {}) {
  return !['cancelled', 'canceled', 'void', 'deleted'].includes(String(row.status || '').toLowerCase());
}

function returnAmountForSalesOrder(returnOrders = [], order = {}) {
  const orderId = String(order.id || '').trim();
  const orderCode = String(order.code || '').trim();
  return returnOrders
    .filter(isActiveReturnOrder)
    .filter((row) => {
      const rowOrderId = String(row.salesOrderId || row.orderId || '').trim();
      const rowOrderCode = String(row.salesOrderCode || row.orderCode || '').trim();
      return (orderId && rowOrderId === orderId) || (orderCode && rowOrderCode === orderCode);
    })
    .reduce((sum, row) => sum + toNumber(row.totalAmount ?? row.amount ?? row.debtReduction ?? 0), 0);
}

function returnOrdersForSalesOrder(returnOrders = [], order = {}) {
  const orderId = String(order.id || '').trim();
  const orderCode = String(order.code || '').trim();
  return returnOrders
    .filter(isActiveReturnOrder)
    .filter((row) => {
      const rowOrderId = String(row.salesOrderId || row.orderId || '').trim();
      const rowOrderCode = String(row.salesOrderCode || row.orderCode || '').trim();
      return (orderId && rowOrderId === orderId) || (orderCode && rowOrderCode === orderCode);
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
  const rows = await returnOrderRepository.findAll();
  return rows.filter((row) => {
    if (!isActiveReturnOrder(row)) return false;
    const rowOrderId = String(row.salesOrderId || row.orderId || '').trim();
    const rowOrderCode = String(row.salesOrderCode || row.orderCode || '').trim();
    return row.erpDeliveryReturnKey === key
      || (order.id && rowOrderId === String(order.id || '').trim())
      || (order.code && rowOrderCode === String(order.code || '').trim());
  });
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
      cancelledAt: nowIso(),
      cancelReason: `Hủy phiếu trả trùng của đơn giao ${order.code || order.id || ''}`,
      updatedAt: nowIso()
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
        cancelledAt: nowIso(),
        cancelReason: 'ERP delivery return items cleared',
        totalQuantity: 0,
        totalAmount: 0,
        amount: 0,
        debtReduction: 0,
        items: [],
        updatedAt: nowIso()
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
    date: String(updatedOrder.deliveryDate || updatedOrder.date || today()).slice(0, 10),
    documentDate: String(updatedOrder.deliveryDate || updatedOrder.date || today()).slice(0, 10),
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
      createdAt: existing.createdAt || nowIso(),
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

function calculateDeliveryDebt(order = {}) {
  return Math.max(0, normalizeDebtAmount(
    deliveryDebtBase(order)
    - toNumber(order.cashCollected ?? order.cashAmount ?? 0)
    - toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0)
    - deliveryRewardAmount(order)
    - deliveryReturnAmount(order)
  ));
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

async function postDeliveryArIfAccountingConfirmed(order = {}, options = {}) {
  if (!isDeliveryCompletedStatus(order.deliveryStatus || order.status)) return null;
  if (!isAccountingConfirmed(order)) return null;
  const debtAmount = Math.max(0, normalizeDebtAmount(order.debtAmount ?? order.debt ?? 0));
  return postingEngine.postSalesOrderAR({
    ...order,
    debtAmount,
    paidAmount: Math.max(0, toNumber(order.totalAmount) - debtAmount),
    arPostedAt: order.arPostedAt || nowIso()
  }, { ...options, postZero: true });
}

function statusForDeliveryRow(order = {}) {
  const raw = String(order.deliveryStatus || order.status || 'pending').toLowerCase();
  const debt = calculateDeliveryDebt(order);
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
  const date = String(query.date || today()).slice(0, 10);
  const q = normalizeText(query.q);
  const salesman = normalizeText(query.salesman || query.salesStaff);
  const delivery = normalizeText(query.delivery || query.deliveryStaff);
  const route = normalizeText(query.route || query.routeName);
  const status = normalizeText(query.status);

  const masterOrders = await listMasterOrders({ excludeInactive: 1 });
  const returnOrders = await returnOrderRepository.findAll();
  const allChildrenForAr = masterOrders.flatMap((master) => Array.isArray(master.children) ? master.children : []).filter((child) => !isInactiveStatus(child));
  const arDebtMap = await buildMasterDeliveryArDebtMap(allChildrenForAr);
  const rows = [];

  for (const master of masterOrders) {
    if (isInactiveStatus(master)) continue;
    const children = Array.isArray(master.children) ? master.children : [];
    for (const child of children) {
      if (isInactiveStatus(child)) continue;
      const deliveryDate = String(child.deliveryDate || master.deliveryDate || child.date || master.date || '').slice(0, 10);
      if (deliveryDate !== date) continue;

      const syncedReturnAmount = returnAmountForSalesOrder(returnOrders, child);
      const syncedReturnItems = returnItemsForSalesOrder(returnOrders, child);
      const lockedReturnOrder = getLockedReturnOrderForSalesOrder(returnOrders, child);
      child.returnAmount = syncedReturnAmount;
      child.returnedAmount = syncedReturnAmount;
      child.returnItems = syncedReturnItems;
      child.deliveryReturnItems = syncedReturnItems;

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
        totalAmount: toNumber(child.totalAmount || 0),
        debtBeforeCollection: deliveryDebtBase(child),
        cashCollected: toNumber(child.cashCollected ?? child.cashAmount ?? 0),
        bankCollected: toNumber(child.bankCollected ?? child.transferAmount ?? child.bankAmount ?? 0),
        returnAmount: deliveryReturnAmount(child),
        rewardAmount: deliveryRewardAmount(child),
        debt: (() => {
          const arDebtRow = findMasterDeliveryArDebtRow(arDebtMap, child, master);
          return arDebtRow ? normalizeDebtAmount(toNumber(arDebtRow.debt)) : calculateDeliveryDebt(child);
        })(),
        debtAmount: (() => {
          const arDebtRow = findMasterDeliveryArDebtRow(arDebtMap, child, master);
          return arDebtRow ? normalizeDebtAmount(toNumber(arDebtRow.debt)) : calculateDeliveryDebt(child);
        })(),
        arBalance: (() => {
          const arDebtRow = findMasterDeliveryArDebtRow(arDebtMap, child, master);
          return arDebtRow ? normalizeDebtAmount(toNumber(arDebtRow.debt)) : calculateDeliveryDebt(child);
        })(),
        arDebtAmount: (() => {
          const arDebtRow = findMasterDeliveryArDebtRow(arDebtMap, child, master);
          return arDebtRow ? normalizeDebtAmount(toNumber(arDebtRow.debt)) : calculateDeliveryDebt(child);
        })(),
        debtSource: findMasterDeliveryArDebtRow(arDebtMap, child, master) ? 'ar_ledger' : 'order_cache',
        arLedgerSynced: Boolean(findMasterDeliveryArDebtRow(arDebtMap, child, master)),
        items: Array.isArray(child.items) ? child.items : [],
        returnItems: syncedReturnItems,
        deliveryReturnItems: syncedReturnItems,
        returnLocked: Boolean(lockedReturnOrder),
        returnLockMessage: lockedReturnOrder ? `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả.` : '',
        returnMergeStatus: lockedReturnOrder ? (lockedReturnOrder.returnMergeStatus || 'merged') : 'unmerged',
        masterReturnOrderId: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderId || '') : '',
        masterReturnOrderCode: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderCode || '') : '',
        warehouseReceiveStatus: lockedReturnOrder ? (lockedReturnOrder.warehouseReceiveStatus || '') : '',
        isLate: Boolean(child.isLate),
        accountingConfirmed: isAccountingConfirmed(child) || isAccountingConfirmed(master),
        accountingStatus: child.accountingStatus || master.accountingStatus || 'draft_delivery',
        accountingConfirmedAt: child.accountingConfirmedAt || master.accountingConfirmedAt || '',
        accountingConfirmedBy: child.accountingConfirmedBy || master.accountingConfirmedBy || '',
        editLocked: isAccountingConfirmed(child) || isAccountingConfirmed(master)
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

  const accountingConfirmed = rows.length > 0 && rows.every((row) => row.accountingConfirmed || row.editLocked);
  return {
    formula: 'Lấy đơn con đã gộp theo Ngày giao hàng trong đơn tổng/đơn con; không lấy theo ngày tạo đơn. Công nợ chỉ phát sinh sau khi kế toán xác nhận.',
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


async function updateDeliveryTodayOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn giao hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn đã hủy/xóa, không thể chỉnh sửa giao hàng', status: 400 };
  if (isAccountingConfirmed(current)) return { error: 'Kế toán đã xác nhận, đơn giao đã khóa và không được chỉnh sửa', status: 400 };

  const debtBeforeCollection = toNumber(body.debtBeforeCollection ?? current.debtBeforeCollection ?? current.totalAmount ?? current.debtAmount ?? 0);
  const cashCollected = toNumber(body.cashCollected ?? current.cashCollected ?? current.cashAmount ?? 0);
  const bankCollected = toNumber(body.bankCollected ?? current.bankCollected ?? current.transferAmount ?? current.bankAmount ?? 0);
  const returnAmount = toNumber(body.returnAmount ?? current.returnAmount ?? 0);
  const rewardAmount = toNumber(body.rewardAmount ?? current.rewardAmount ?? current.displayRewardAmount ?? 0);
  const returnItems = Array.isArray(body.returnItems) ? body.returnItems : (Array.isArray(current.returnItems) ? current.returnItems : []);
  const relatedReturnOrders = await returnOrderRepository.findAll();
  const lockedReturnOrder = getLockedReturnOrderForSalesOrder(relatedReturnOrders, current);
  const lockedReturnItems = lockedReturnOrder ? returnItemsForSalesOrder([lockedReturnOrder], current) : [];
  if (lockedReturnOrder && Array.isArray(body.returnItems) && hasReturnItemsChanged(returnItems, lockedReturnItems)) {
    return { error: `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả`, status: 400 };
  }
  const effectiveReturnItems = lockedReturnOrder ? lockedReturnItems : returnItems;
  const effectiveReturnAmount = lockedReturnOrder ? toNumber(lockedReturnOrder.totalAmount ?? lockedReturnOrder.amount ?? lockedReturnOrder.debtReduction ?? 0) : returnAmount;

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
  let debtAmount = calculateDeliveryDebt({ debtBeforeCollection, cashCollected, bankCollected, returnAmount: effectiveReturnAmount, rewardAmount });
  debtAmount = Math.max(0, normalizeDebtAmount(debtAmount));
  const deliveryStatus = String(body.deliveryStatus || current.deliveryStatus || 'waiting').trim();

  const updated = {
    ...current,
    deliveryDate: String(body.deliveryDate || current.deliveryDate || current.date || today()).slice(0, 10),
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
    accountingStatus: current.accountingStatus || 'draft_delivery',
    accountingConfirmed: Boolean(current.accountingConfirmed),
    arStatus: orderDebtLifecycleStatus(debtAmount, deliveryStatus, current),
    lifecycleStatus: isDeliveryCompletedStatus(deliveryStatus)
      ? 'pending_accounting'
      : (current.lifecycleStatus || 'assigned_delivery'),
    arPostedAt: current.arPostedAt || '',
    deliveryNote: String(body.deliveryNote ?? current.deliveryNote ?? '').trim(),
    updatedAt: nowIso()
  };

  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(updated, { session });
  });

  // ERP Web cũng phải sinh/chỉnh phiếu trả hàng thật trong returnOrders.
  // Nếu không, màn Đơn trả hàng / Đơn tổng trả hàng sẽ không thấy hàng trả dù đơn giao đã có returnAmount.
  if (!lockedReturnOrder) await syncErpDeliveryReturnOrder(updated, effectiveReturnItems);

  return { salesOrder: updated };
}

async function confirmDeliveryAccounting(body = {}) {
  const date = String(body.date || today()).slice(0, 10);
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
  const now = nowIso();
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
      const deliveryDate = String(child.deliveryDate || master.deliveryDate || child.date || master.date || '').slice(0, 10);
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
        const deliveryDate = String(child.deliveryDate || master.deliveryDate || child.date || master.date || '').slice(0, 10);
        return deliveryDate === date;
      });
      const matchedKeySet = new Set(matched.flatMap((child) => childKeys(child)));
      const allChildrenConfirmed = activeChildrenInDate.length > 0 && activeChildrenInDate.every((child) => {
        if (isAccountingConfirmed(child)) return true;
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

    for (const { child } of targetChildren) {
      const alreadyConfirmed = isAccountingConfirmed(child);
      const debtAmount = Math.max(0, normalizeDebtAmount(child.debtAmount ?? child.debt ?? calculateDeliveryDebt(child)));
      const updated = {
        ...child,
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        accountingConfirmedAt: child.accountingConfirmedAt || now,
        accountingConfirmedBy: child.accountingConfirmedBy || confirmedBy,
        editLocked: true,
        deliveryLocked: true,
        debtAmount,
        debt: debtAmount,
        arBalance: debtAmount,
        arStatus: hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid',
        lifecycleStatus: hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid',
        arPostedAt: child.arPostedAt || now,
        updatedAt: now
      };
      await orderRepository.upsert(updated, { session });
      await postDeliveryArIfAccountingConfirmed(updated, { session });
      if (!alreadyConfirmed) await addDebtToCustomerIfNeeded(updated, { session });
      if (alreadyConfirmed) skippedOrders += 1; else confirmedOrders += 1;
    }
  });

  return {
    date,
    confirmedOrders,
    skippedOrders,
    totalOrders: targetChildren.length,
    message: `Kế toán đã xác nhận ${targetChildren.length} đơn giao ngày ${date}. Đơn đã khóa chỉnh sửa và đã đưa vào công nợ.`
  };
}

async function createMasterOrder(body = {}) {
  const childIds = Array.isArray(body.childOrderIds) ? body.childOrderIds.map(String) : [];
  if (!childIds.length) return { error: 'Chưa chọn đơn con để gộp', status: 400 };
  const allOrders = await orderRepository.findAll();
  const children = allOrders
    .filter((order) => childIds.includes(String(order.id)) || childIds.includes(String(order.code)))
    .filter((order) => !isInactiveStatus(order));
  if (children.length !== childIds.length) return { error: 'Một số đơn con không tồn tại hoặc đã bị hủy/xóa', status: 400 };
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
    children: [],
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
        deliveryStatus: child.deliveryStatus || 'assigned_delivery',
        status: child.status === 'posted' ? 'assigned_delivery' : (child.status || 'assigned_delivery'),
        lifecycleStatus: 'assigned_delivery',
        arStatus: 'not_posted',
        accountingStatus: 'draft_delivery',
        accountingConfirmed: false,
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
  confirmDeliveryAccounting,
  updateDeliveryTodayOrder,
  getMasterOrder,
  createMasterOrder,
  updateMasterOrder,
  cancelMasterOrder,
  deleteMasterOrder
};
