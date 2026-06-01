'use strict';

const returnOrderRepository = require('../repositories/returnOrderRepository');
const orderRepository = require('../repositories/orderRepository');
const customerRepository = require('../repositories/customerRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const inventoryService = require('./inventoryService');
const postingEngine = require('../engines/posting.engine');
const financialService = require('./financialService');

function today() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }

function buildReturnCode(existingOrders = []) {
  const max = existingOrders.reduce((result, order) => {
    const match = String(order.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `THH${String(max + 1).padStart(5, '0')}`;
}

function toClient(order) {
  return {
    ...order,
    id: order.id || order.code,
    code: order.code || order.id,
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount)
  };
}

function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(row.deletedAt);
}

async function listReturnOrders(query = {}) {
  const q = normalizeText(query.q);
  const dateFrom = String(query.dateFrom || '').slice(0, 10);
  const dateTo = String(query.dateTo || '').slice(0, 10);
  const excludeInactive = String(query.excludeInactive ?? '1') !== '0';
  const orders = await returnOrderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  const seenSalesReturns = new Set();
  return orders
    .map(toClient)
    .filter((order) => !excludeInactive || !isInactiveStatus(order))
    .filter((order) => {
      const d = String(order.date || order.documentDate || order.createdAt || '').slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    })
    .filter((order) => {
      // V45 chuẩn: App giao hàng và ERP đều ghi chung collection returnOrders.
      // Vì dữ liệu cũ có thể đã sinh trùng từ nhiều source, màn danh sách chỉ hiển thị 1 phiếu hiệu lực / 1 đơn bán.
      const salesKey = String(order.salesOrderId || order.orderId || order.salesOrderCode || order.orderCode || '').trim();
      if (!salesKey) return true;
      if (seenSalesReturns.has(salesKey)) return false;
      seenSalesReturns.add(salesKey);
      return true;
    })
    .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.salesOrderCode, order.staffName, order.deliveryStaffName, order.note].some((value) => normalizeText(value).includes(q)));
}

async function resolveSalesOrder(body = {}) {
  const key = String(body.salesOrderId || body.salesOrderCode || body.orderId || body.orderCode || '').trim();
  return key ? orderRepository.findByIdOrCode(key) : null;
}

async function resolveCustomer(body = {}, salesOrder = null) {
  const key = String(body.customerId || body.customerCode || body.customerName || salesOrder?.customerId || salesOrder?.customerCode || '').trim();
  return key ? customerRepository.findByIdOrCode(key) : null;
}

function normalizeItems(rawItems = [], salesOrder = null) {
  const salesItems = new Map((salesOrder?.items || []).map((item) => [String(item.productCode || item.code || item.productId || '').trim(), item]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productCode = String(raw.productCode || raw.code || raw.productId || '').trim();
      const original = salesItems.get(productCode) || {};
      const quantity = toNumber(raw.qtyReturn ?? raw.returnQuantity ?? raw.returnedQty ?? raw.returnQty ?? raw.quantity ?? raw.qty);
      const price = toNumber(raw.price ?? raw.salePrice ?? raw.unitPrice ?? original.price ?? original.salePrice ?? 0);
      return {
        ...original,
        ...raw,
        productId: raw.productId || original.productId || productCode,
        productCode: productCode || original.productCode || original.code || '',
        productName: raw.productName || raw.name || original.productName || original.name || '',
        quantity,
        qty: quantity,
        price,
        salePrice: price,
        amount: toNumber(raw.amount ?? quantity * price)
      };
    })
    .filter((item) => item.quantity > 0 || item.productCode || item.productName);
}

async function findExistingReturnOrder(body = {}) {
  const candidates = await returnOrderRepository.findAll();
  const id = String(body.id || '').trim();
  const code = String(body.code || '').trim();
  const salesOrderId = String(body.salesOrderId || '').trim();
  const salesOrderCode = String(body.salesOrderCode || '').trim();

  return candidates.find((row) => {
    if (isInactiveStatus(row)) return false;

    // Ưu tiên cập nhật đúng chứng từ khi có id/code phiếu trả.
    if (id && String(row.id || '').trim() === id) return true;
    if (code && String(row.code || '').trim() === code) return true;

    // V45 chuẩn: app và ERP cùng 1 nguồn returnOrders.
    // 1 đơn bán = 1 phiếu trả hiệu lực, chỉ dedup theo salesOrderId/salesOrderCode chuẩn.
    if (salesOrderId && String(row.salesOrderId || '').trim() === salesOrderId) return true;
    if (salesOrderCode && String(row.salesOrderCode || '').trim() === salesOrderCode) return true;

    return false;
  }) || null;
}



function isPostedReturnStatus(status = '') {
  return ['posted', 'received', 'warehouse_received', 'completed'].includes(String(status || '').toLowerCase());
}

function isPendingReturnStatus(status = '') {
  return ['waiting_receive', 'pending_warehouse_receive', 'pending', 'draft'].includes(String(status || '').toLowerCase());
}

async function buildReturnOrderDocument(body = {}) {
  const salesOrder = await resolveSalesOrder(body);
  const customer = await resolveCustomer(body, salesOrder);
  if (!customer && !body.customerName && !salesOrder?.customerName) return { error: 'Không tìm thấy khách hàng', status: 404 };
  const items = normalizeItems(body.items, salesOrder).filter((item) => toNumber(item.quantity) > 0);
  if (!items.length) return { error: 'Phiếu trả hàng chưa có dòng hàng', status: 400 };
  const sourceText = String(body.source || body.refType || '').toLowerCase();
  const requiresSalesKey = ['mobileDeliveryReturn', 'erpDeliveryReturn'].includes(String(body.refType || ''))
    || String(body.source || '') === 'returnOrders'
    || sourceText.includes('mobile_delivery')
    || sourceText.includes('mobiledelivery');
  if (requiresSalesKey && !String(body.salesOrderId || '').trim() && !String(body.salesOrderCode || '').trim()) {
    return { error: 'Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả', status: 400 };
  }

  const existingOrders = await returnOrderRepository.findAll();
  const existing = await findExistingReturnOrder(body);
  const totalAmount = toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const returnOrder = {
    ...(existing || {}),
    ...body,
    id: String(existing?.id || body.id || makeId('RO')).trim(),
    code: String(existing?.code || body.code || buildReturnCode(existingOrders)).trim(),
    date: String(body.date || existing?.date || today()).slice(0, 10),
    documentDate: String(body.documentDate || body.date || existing?.documentDate || existing?.date || today()).slice(0, 10),
    salesOrderId: salesOrder?.id || body.salesOrderId || body.orderId || existing?.salesOrderId || '',
    salesOrderCode: salesOrder?.code || body.salesOrderCode || body.orderCode || existing?.salesOrderCode || '',
    orderId: salesOrder?.id || body.orderId || body.salesOrderId || existing?.orderId || existing?.salesOrderId || '',
    orderCode: salesOrder?.code || body.orderCode || body.salesOrderCode || existing?.orderCode || existing?.salesOrderCode || '',
    customerId: customer?.id || body.customerId || salesOrder?.customerId || existing?.customerId || '',
    customerCode: customer?.code || body.customerCode || salesOrder?.customerCode || existing?.customerCode || '',
    customerName: customer?.name || body.customerName || salesOrder?.customerName || existing?.customerName || '',
    deliveryStaffId: body.deliveryStaffId || existing?.deliveryStaffId || salesOrder?.deliveryStaffId || '',
    deliveryStaffCode: body.deliveryStaffCode || existing?.deliveryStaffCode || salesOrder?.deliveryStaffCode || '',
    deliveryStaffName: body.deliveryStaffName || existing?.deliveryStaffName || salesOrder?.deliveryStaffName || '',
    staffCode: body.staffCode || body.deliveryStaffCode || existing?.staffCode || existing?.deliveryStaffCode || '',
    staffName: body.staffName || body.deliveryStaffName || existing?.staffName || existing?.deliveryStaffName || '',
    note: String(body.note ?? existing?.note ?? '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount,
    amount: toNumber(body.amount ?? totalAmount),
    debtReduction: toNumber(body.debtReduction ?? totalAmount),
    status: body.status || existing?.status || 'posted',
    returnMergeStatus: body.returnMergeStatus || existing?.returnMergeStatus || 'unmerged',
    warehouseReceiveStatus: body.warehouseReceiveStatus || existing?.warehouseReceiveStatus || (isPostedReturnStatus(body.status) ? 'received' : 'waiting_receive'),
    source: body.source || existing?.source || 'returnOrders',
    accountingStatus: body.accountingStatus || existing?.accountingStatus || '',
    accountingConfirmed: Boolean(body.accountingConfirmed ?? existing?.accountingConfirmed ?? false),
    createdAt: existing?.createdAt || body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  return { returnOrder, existing };
}

async function createReturnOrder(body = {}) {
  const built = await buildReturnOrderDocument({ ...body, status: body.status || 'posted', warehouseReceiveStatus: body.warehouseReceiveStatus || 'received' });
  if (built.error) return built;
  const { returnOrder, existing } = built;

  await withMongoTransaction(async (session) => {
    // Phiếu tạo trực tiếp ở menu Trả hàng vẫn giữ hành vi cũ: ghi sổ ngay.
    // Luồng giao hàng ERP không dùng hàm này nữa mà dùng createPendingReturnOrder().
    if (existing && isPostedReturnStatus(existing.status)) {
      await inventoryService.reverseStockMovement(existing, {
        type: 'RETURN',
        reverseType: 'RETURN_UPDATE_REVERSAL',
        direction: 'IN',
        refType: 'RETURN_ORDER',
        refId: existing.id || existing.code,
        refCode: existing.code || existing.id,
        date: existing.date,
        note: 'Đảo nhập kho phiếu trả hàng trước khi cập nhật'
      }, { session });
      await postingEngine.reverseReturnOrderAR(existing, { session });
    }

    await returnOrderRepository.upsert({
      ...returnOrder,
      status: 'posted',
      warehouseReceiveStatus: 'received',
      postedAt: returnOrder.postedAt || nowIso()
    }, { session });
    await inventoryService.postStockMovement(returnOrder, {
      type: 'RETURN',
      direction: 'IN',
      refType: 'RETURN_ORDER',
      refId: returnOrder.id || returnOrder.code,
      refCode: returnOrder.code || returnOrder.id,
      date: returnOrder.date,
      note: existing ? 'Cập nhật nhập lại kho theo phiếu trả hàng' : 'Nhập lại kho theo phiếu trả hàng'
    }, { session });
    // V45 chuẩn kế toán: phiếu trả hàng / kho nhận hàng chỉ nhập lại tồn kho.
    // KHÔNG ghi AR-RETURN ở bước này vì kế toán chưa xác nhận giảm công nợ.
    // AR-RETURN chỉ được post ở luồng kế toán xác nhận công nợ.
  });
  return { returnOrder: toClient({ ...returnOrder, status: 'posted', warehouseReceiveStatus: 'received' }), updatedExisting: Boolean(existing) };
}

async function createPendingReturnOrder(body = {}, options = {}) {
  const built = await buildReturnOrderDocument({
    ...body,
    status: body.status || 'waiting_receive',
    returnMergeStatus: body.returnMergeStatus || 'unmerged',
    warehouseReceiveStatus: body.warehouseReceiveStatus || 'waiting_receive'
  });
  if (built.error) return built;
  const { returnOrder, existing } = built;

  if (existing && ((existing.returnMergeStatus || 'unmerged') === 'merged' || existing.masterReturnOrderId || existing.masterReturnOrderCode)) {
    return { error: 'Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng', status: 400 };
  }
  if (existing && isPostedReturnStatus(existing.status)) {
    return { error: 'Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng', status: 400 };
  }

  const pendingReturnOrder = {
    ...returnOrder,
    status: 'waiting_receive',
    returnMergeStatus: 'unmerged',
    warehouseReceiveStatus: 'waiting_receive',
    accountingStatus: 'pending',
    accountingConfirmed: false,
    postedAt: '',
    receivedAt: ''
  };
  await returnOrderRepository.upsert(pendingReturnOrder, options);

  // V45 chuẩn: đơn trả từ app giao hàng chỉ là đề nghị/ghi nhận tạm.
  // Không post AR-RETURN và không sync công nợ tại đây; AR chỉ ghi khi kế toán xác nhận báo cáo giao hàng.

  return { returnOrder: toClient({ ...pendingReturnOrder, status: 'waiting_receive', warehouseReceiveStatus: 'waiting_receive' }), updatedExisting: Boolean(existing) };
}

async function confirmReceiveReturnOrder(idOrCode, options = {}) {
  const current = await returnOrderRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu trả hàng', status: 404 };
  if (['cancelled', 'canceled', 'void', 'deleted'].includes(String(current.status || '').toLowerCase())) {
    return { error: 'Phiếu trả hàng đã hủy/xóa, không thể nhập kho', status: 400 };
  }
  if (isPostedReturnStatus(current.status) || String(current.warehouseReceiveStatus || '').toLowerCase() === 'received') {
    return { returnOrder: toClient(current), alreadyReceived: true };
  }

  const received = {
    ...current,
    status: 'received',
    warehouseReceiveStatus: 'received',
    receivedAt: nowIso(),
    postedAt: current.postedAt || nowIso(),
    updatedAt: nowIso()
  };

  await withMongoTransaction(async (session) => {
    await returnOrderRepository.upsert(received, { session });
    await inventoryService.postStockMovement(received, {
      type: 'RETURN',
      direction: 'IN',
      refType: 'RETURN_ORDER',
      refId: received.id || received.code,
      refCode: received.code || received.id,
      date: received.date,
      note: 'Kho xác nhận nhận hàng trả - nhập lại tồn'
    }, { session });
    // Kho xác nhận hàng trả chỉ ảnh hưởng tồn kho.
    // Không post AR-RETURN và không sync công nợ ở đây.
    // Kế toán sẽ ghi giảm công nợ ở màn xác nhận công nợ/giao hàng.
  });

  return { returnOrder: toClient(received), alreadyReceived: false };
}

module.exports = { listReturnOrders, createReturnOrder, createPendingReturnOrder, confirmReceiveReturnOrder, toClient };
