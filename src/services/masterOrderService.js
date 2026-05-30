'use strict';

const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const userRepository = require('../repositories/userRepository');
const orderService = require('./orderService');
const returnOrderService = require('./returnOrderService');
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


function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(row.deletedAt);
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
  return `erp_delivery_return:${order.id || order.code || ''}`;
}

async function findErpDeliveryReturnOrders(order = {}) {
  const key = buildErpDeliveryReturnKey(order);
  const rows = await returnOrderRepository.findAll();
  return rows.filter((row) => (
    row.erpDeliveryReturnKey === key
    || (row.source === 'erp_delivery_return' && String(row.salesOrderId || row.orderId || '') === String(order.id || ''))
    || (row.source === 'erp_delivery_return' && String(row.salesOrderCode || row.orderCode || '') === String(order.code || ''))
  ));
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
    source: 'erp_delivery_return',
    refType: 'erpDeliveryReturn',
    deliveryStaffCode: updatedOrder.deliveryStaffCode || '',
    deliveryStaffName: updatedOrder.deliveryStaffName || '',
    staffCode: updatedOrder.deliveryStaffCode || '',
    staffName: updatedOrder.deliveryStaffName || '',
    routeName: updatedOrder.routeName || updatedOrder.deliveryRoute || '',
    note: updatedOrder.deliveryNote || `ERP đơn giao trả hàng ${updatedOrder.code || updatedOrder.id || ''}`
  };

  if (existing) {
    if ((existing.returnMergeStatus || 'unmerged') === 'merged' || existing.masterReturnOrderId || existing.masterReturnOrderCode) {
      // Phiếu đã gộp/kho đang xử lý thì không ghi đè chứng từ cũ; chỉ giữ số liệu trên đơn giao.
      return existing;
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
  return Math.max(0, Math.round(
    deliveryDebtBase(order)
    - toNumber(order.cashCollected ?? order.cashAmount ?? 0)
    - toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0)
    - deliveryRewardAmount(order)
    - deliveryReturnAmount(order)
  ));
}

function statusForDeliveryRow(order = {}) {
  const raw = String(order.deliveryStatus || order.status || 'pending').toLowerCase();
  const debt = calculateDeliveryDebt(order);
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

  const masterOrders = await listMasterOrders({ excludeInactive: 1 });
  const rows = [];

  for (const master of masterOrders) {
    if (isInactiveStatus(master)) continue;
    const children = Array.isArray(master.children) ? master.children : [];
    for (const child of children) {
      if (isInactiveStatus(child)) continue;
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
        totalAmount: toNumber(child.totalAmount || 0),
        debtBeforeCollection: deliveryDebtBase(child),
        cashCollected: toNumber(child.cashCollected ?? child.cashAmount ?? 0),
        bankCollected: toNumber(child.bankCollected ?? child.transferAmount ?? child.bankAmount ?? 0),
        returnAmount: deliveryReturnAmount(child),
        rewardAmount: deliveryRewardAmount(child),
        debt: calculateDeliveryDebt(child),
        debtAmount: calculateDeliveryDebt(child),
        items: Array.isArray(child.items) ? child.items : [],
        returnItems: Array.isArray(child.returnItems || child.deliveryReturnItems) ? (child.returnItems || child.deliveryReturnItems) : [],
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


async function updateDeliveryTodayOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn giao hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn đã hủy/xóa, không thể chỉnh sửa giao hàng', status: 400 };

  const debtBeforeCollection = toNumber(body.debtBeforeCollection ?? current.debtBeforeCollection ?? current.totalAmount ?? current.debtAmount ?? 0);
  const cashCollected = toNumber(body.cashCollected ?? current.cashCollected ?? current.cashAmount ?? 0);
  const bankCollected = toNumber(body.bankCollected ?? current.bankCollected ?? current.transferAmount ?? current.bankAmount ?? 0);
  const returnAmount = toNumber(body.returnAmount ?? current.returnAmount ?? 0);
  const rewardAmount = toNumber(body.rewardAmount ?? current.rewardAmount ?? current.displayRewardAmount ?? 0);
  const returnItems = Array.isArray(body.returnItems) ? body.returnItems : (Array.isArray(current.returnItems) ? current.returnItems : []);
  // Công thức chuẩn duy nhất cho toàn bộ luồng giao hàng:
  // Còn nợ = Phải thu - Tiền mặt - Chuyển khoản - Trả thưởng - Tổng tiền hàng trả
  const debtAmount = calculateDeliveryDebt({ debtBeforeCollection, cashCollected, bankCollected, returnAmount, rewardAmount });
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
    returnAmount,
    rewardAmount,
    returnItems,
    deliveryReturnItems: returnItems,
    debtAmount,
    debt: debtAmount,
    deliveryNote: String(body.deliveryNote ?? current.deliveryNote ?? '').trim(),
    updatedAt: nowIso()
  };

  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(updated, { session });
  });

  // ERP Web cũng phải sinh/chỉnh phiếu trả hàng thật trong returnOrders.
  // Nếu không, màn Đơn trả hàng / Đơn tổng trả hàng sẽ không thấy hàng trả dù đơn giao đã có returnAmount.
  await syncErpDeliveryReturnOrder(updated, returnItems);

  return { salesOrder: updated };
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
  updateDeliveryTodayOrder,
  getMasterOrder,
  createMasterOrder,
  updateMasterOrder,
  cancelMasterOrder,
  deleteMasterOrder
};
