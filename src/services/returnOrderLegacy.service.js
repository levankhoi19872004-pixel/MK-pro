'use strict';

const dateUtil = require('../utils/date.util');
const queryGuard = require('../utils/queryGuard.util');
const { escapeRegex } = require('../utils/query.util');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const orderRepository = require('../repositories/orderRepository');
const customerRepository = require('../repositories/customerRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const InventoryPostingService = require('../domain/posting/InventoryPostingService');
const postingEngine = require('../engines/posting.engine');
const financialService = require('./financialService');
const auditService = require('./auditService');
const ReturnOrder = require('../models/ReturnOrder');
const ReturnStateMachine = require('../domain/lifecycle/ReturnStateMachine');
const { RETURN_STATES } = ReturnStateMachine;

const {
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName
} = require('../domain/staff/staffIdentity');

const ACTIVE_RETURN_ORDER_STATUSES = [
  'draft',
  'pending',
  'active',
  'waiting_receive',
  'pending_warehouse_receive',
  'merged',
  'delivered',
  'completed',
  'has_return'
];


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
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled', 'cleared'].includes(status) || Boolean(row.deletedAt);
}

function getReturnOrderValue(row = {}) {
  return toNumber(row.debtReduction ?? row.totalAmount ?? row.amount ?? row.totalValue);
}

function hasPositiveReturnValue(row = {}) {
  return getReturnOrderValue(row) > 0;
}

// ===== SCOPED FIX: RETURN_ORDER_POST_AR_DIRECT_START =====
// AR-RETURN chỉ được ghi sau khi kế toán xác nhận phiếu trả.
// Nhận kho chỉ cộng tồn, không tự ghi công nợ.
async function postReturnOrderArIfNeeded(returnOrder = {}, options = {}) {
  const amount = getReturnOrderValue(returnOrder);
  if (!returnOrder || amount <= 0) return { entry: null, returnOrder };

  ReturnStateMachine.assertCanPostAR(returnOrder);

  const entry = await postingEngine.postReturnOrderAR({
    ...returnOrder,
    debtReduction: amount,
    amount,
    totalReturnAmount: amount,
    source: 'returnOrders',
    accountingConfirmed: true,
    accountingStatus: RETURN_STATES.ACCOUNTING_CONFIRMED
  }, { ...options, skipIfExists: true });

  if (!entry) return { entry: null, returnOrder };

  const statePatch = ReturnStateMachine.patchForState(returnOrder, RETURN_STATES.POSTED_TO_AR);
  const patched = {
    ...returnOrder,
    ...statePatch,
    returnState: RETURN_STATES.POSTED_TO_AR,
    stateChangedAt: dateUtil.nowIso(),
    arLedgerId: entry.id || entry.code || returnOrder.arLedgerId || ''
  };
  await returnOrderRepository.upsert(patched, options);
  return { entry, returnOrder: patched };
}
// ===== SCOPED FIX: RETURN_ORDER_POST_AR_DIRECT_END =====

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildReturnOrderLookupFilter(body = {}) {
  const id = String(body.id || '').trim();
  const code = String(body.code || '').trim();
  const salesOrderId = String(body.salesOrderId || body.orderId || body.sourceOrderId || body.deliveryOrderId || '').trim();
  const salesOrderCode = String(body.salesOrderCode || body.orderCode || body.sourceOrderCode || body.deliveryOrderCode || '').trim();
  const or = [];
  if (id) or.push({ id });
  if (code) or.push({ code });
  if (salesOrderId) {
    or.push({ salesOrderId });
    or.push({ orderId: salesOrderId });
    or.push({ sourceOrderId: salesOrderId });
    or.push({ deliveryOrderId: salesOrderId });
  }
  if (salesOrderCode) {
    or.push({ salesOrderCode });
    or.push({ orderCode: salesOrderCode });
    or.push({ sourceOrderCode: salesOrderCode });
    or.push({ deliveryOrderCode: salesOrderCode });
  }
  return or.length ? { $or: or } : null;
}


function canonicalOrderCodeFromSalesOrder(salesOrder = {}, fallback = {}) {
  return String(
    salesOrder.code ||
    salesOrder.orderCode ||
    salesOrder.salesOrderCode ||
    fallback.salesOrderCode ||
    fallback.orderCode ||
    fallback.code ||
    ''
  ).trim();
}

function canonicalOrderIdFromSalesOrder(salesOrder = {}, fallback = {}) {
  return String(
    salesOrder.id ||
    salesOrder._id ||
    fallback.salesOrderId ||
    fallback.orderId ||
    fallback.id ||
    ''
  ).trim();
}

function buildCanonicalReturnCode(salesOrder = {}, fallback = {}) {
  const code = canonicalOrderCodeFromSalesOrder(salesOrder, fallback);
  if (!code) return '';
  const clean = String(code).replace(/^RO[-_]?/i, '').trim();
  return clean ? `RO-${clean}` : '';
}

function buildCanonicalReturnLookup({ salesOrderId = '', salesOrderCode = '', returnCode = '' } = {}) {
  const or = [];
  if (returnCode) {
    or.push({ code: returnCode });
    or.push({ id: returnCode });
  }
  if (salesOrderId) {
    or.push({ salesOrderId });
    or.push({ orderId: salesOrderId });
    or.push({ sourceOrderId: salesOrderId });
    or.push({ deliveryOrderId: salesOrderId });
  }
  if (salesOrderCode) {
    or.push({ salesOrderCode });
    or.push({ orderCode: salesOrderCode });
    or.push({ sourceOrderCode: salesOrderCode });
    or.push({ deliveryOrderCode: salesOrderCode });
    or.push({ code: `RO-${String(salesOrderCode).replace(/^RO[-_]?/i, '')}` });
  }
  return or.length ? { $or: or, status: { $nin: ['deleted'] } } : null;
}

function scoreReturnOrderCandidate(row = {}, returnCode = '') {
  const status = String(row.status || row.returnStatus || '').toLowerCase();
  let score = 0;
  if (returnCode && (String(row.code || '') === returnCode || String(row.id || '') === returnCode)) score += 1000;
  if (String(row.code || '').startsWith('RO-')) score += 200;
  if (String(row.id || '').startsWith('RO-')) score += 100;
  if (['waiting_receive', 'pending', 'draft', 'active', 'has_return'].includes(status)) score += 80;
  if (status === 'cleared') score += 40;
  if (String(row.id || '').startsWith('RO-DRAFT-')) score += 10;
  if (String(row.id || '').startsWith('RO-MOBILE-')) score -= 20;
  if (String(row.code || '').startsWith('THH')) score -= 80;
  if (['cancelled', 'canceled', 'cleared', 'void', 'deleted', 'removed', 'duplicate_cancelled'].includes(status)) score -= 500;
  return score;
}

async function findExistingReturnOrderForSalesOrder({ salesOrderId = '', salesOrderCode = '', returnCode = '' } = {}) {
  const filter = buildCanonicalReturnLookup({ salesOrderId, salesOrderCode, returnCode });
  if (!filter) return null;
  const rows = await returnOrderRepository.findAll(filter, { sort: { createdAt: 1 }, limit: 50 });
  return (rows || [])
    .filter((row) => row && !isInactiveStatus(row))
    .sort((a, b) => scoreReturnOrderCandidate(b, returnCode) - scoreReturnOrderCandidate(a, returnCode))[0] || null;
}

async function cancelDuplicateReturnOrders({ keepId, keepCode = '', salesOrderId = '', salesOrderCode = '', returnCode = '' } = {}) {
  const filter = buildCanonicalReturnLookup({ salesOrderId, salesOrderCode, returnCode });
  if (!filter) return { cancelled: 0 };
  const candidates = await returnOrderRepository.findAll(filter, { sort: { createdAt: 1 }, limit: 100 });
  const now = dateUtil.nowIso();
  let cancelled = 0;
  for (const row of candidates || []) {
    if (!row) continue;
    const sameKeep = (keepId && String(row._id || row.id || '') === String(keepId))
      || (keepCode && (String(row.code || '') === String(keepCode) || String(row.id || '') === String(keepCode)));
    if (sameKeep) continue;
    const status = String(row.status || '').toLowerCase();
    if (['deleted', 'duplicate_cancelled'].includes(status)) continue;
    if ((row.returnMergeStatus || 'unmerged') === 'merged' || row.masterReturnOrderId || row.masterReturnOrderCode) continue;
    if (isPostedReturnStatus(row.status) || String(row.warehouseReceiveStatus || '').toLowerCase() === 'received') continue;
    await returnOrderRepository.upsert({
      ...row,
      status: 'duplicate_cancelled',
      returnStatus: 'duplicate_cancelled',
      warehouseReceiveStatus: 'duplicate_cancelled',
      accountingStatus: 'duplicate_cancelled',
      items: [],
      amount: 0,
      totalAmount: 0,
      totalQuantity: 0,
      debtReduction: 0,
      totalReturnAmount: 0,
      duplicateReason: 'Trùng phiếu trả cùng salesOrderId/salesOrderCode',
      updatedAt: now
    });
    cancelled += 1;
  }
  return { cancelled };
}

async function findReturnOrdersBySalesOrderRefs(orders = [], options = {}) {
  const ids = [];
  const codes = [];
  for (const order of orders || []) {
    ids.push(order?.salesOrderId, order?.orderId, order?.sourceOrderId, order?.deliveryOrderId, order?.id, order?._id);
    codes.push(order?.salesOrderCode, order?.orderCode, order?.sourceOrderCode, order?.deliveryOrderCode, order?.code);
  }
  const orderIds = uniqueStrings(ids);
  const orderCodes = uniqueStrings(codes);
  const or = [];
  if (orderIds.length) {
    or.push({ salesOrderId: { $in: orderIds } });
    or.push({ orderId: { $in: orderIds } });
    or.push({ sourceOrderId: { $in: orderIds } });
    or.push({ deliveryOrderId: { $in: orderIds } });
  }
  if (orderCodes.length) {
    or.push({ salesOrderCode: { $in: orderCodes } });
    or.push({ orderCode: { $in: orderCodes } });
    or.push({ sourceOrderCode: { $in: orderCodes } });
    or.push({ deliveryOrderCode: { $in: orderCodes } });
  }
  if (!or.length) return [];
  return returnOrderRepository.findAll({ $or: or }, {
    ...options,
    projection: {
      id: 1, code: 1, salesOrderId: 1, salesOrderCode: 1, orderId: 1, orderCode: 1,
      sourceOrderId: 1, sourceOrderCode: 1, deliveryOrderId: 1, deliveryOrderCode: 1,
      masterOrderId: 1, masterOrderCode: 1, masterReturnOrderId: 1, masterReturnOrderCode: 1,
      customerId: 1, customerCode: 1, customerName: 1,
      salesStaffId: 1, salesStaffCode: 1, salesStaffName: 1, salesmanCode: 1, salesmanName: 1,
      deliveryStaffId: 1, deliveryStaffCode: 1, deliveryStaffName: 1,
      staffCode: 1, staffName: 1, items: 1, totalQuantity: 1, totalAmount: 1, amount: 1, debtReduction: 1,
      status: 1, returnStatus: 1, returnMergeStatus: 1, warehouseReceiveStatus: 1,
      date: 1, documentDate: 1, deliveryDate: 1, routeName: 1, deliveryRoute: 1, createdAt: 1, updatedAt: 1
    }
  });
}

function buildFastReturnCode(body = {}, existing = null, salesOrder = null) {
  const canonical = buildCanonicalReturnCode(salesOrder || {}, body || {});
  return String(canonical || existing?.code || body.code || `THH${makeId('')}`).trim();
}

async function listReturnOrders(query = {}) {
  // returnOrders là nguồn duy nhất. Service đọc trực tiếp repository để tránh
  // vòng phụ thuộc returnOrderService -> DeliveryEngine -> ReturnLifecycleService.
  const filter = {
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] }
  };
  const and = [];
  const from = dateUtil.toDateOnly(query.dateFrom || query.fromDate || query.from || '');
  const to = dateUtil.toDateOnly(query.dateTo || query.toDate || query.to || query.date || '');
  const exactDate = dateUtil.toDateOnly(query.date || '');
  if (from || to || exactDate) {
    const range = exactDate ? exactDate : {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {})
    };
    and.push({ $or: [
      { date: range }, { documentDate: range }, { deliveryDate: range }, { returnDate: range }
    ] });
  }

  const directValues = uniqueStrings([
    query.salesOrderId, query.orderId, query.salesOrderCode, query.orderCode,
    query.orderKey, query.code, query.id
  ]);
  if (directValues.length) {
    and.push({ $or: [
      { salesOrderId: { $in: directValues } }, { orderId: { $in: directValues } },
      { sourceOrderId: { $in: directValues } }, { deliveryOrderId: { $in: directValues } },
      { salesOrderCode: { $in: directValues } }, { orderCode: { $in: directValues } },
      { sourceOrderCode: { $in: directValues } }, { deliveryOrderCode: { $in: directValues } },
      { id: { $in: directValues } }, { code: { $in: directValues } }
    ] });
  }

  if (query.masterOrderId) filter.masterOrderId = String(query.masterOrderId).trim();
  if (query.masterOrderCode) filter.masterOrderCode = String(query.masterOrderCode).trim();
  if (query.customerCode) filter.customerCode = String(query.customerCode).trim();

  const deliveryKeyword = String(query.deliveryStaffCode || query.deliveryCode || query.nvghCode || query.delivery || '').trim();
  if (deliveryKeyword) {
    const rx = new RegExp(escapeRegex(deliveryKeyword), 'i');
    and.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }, { deliveryCode: rx }, { deliveryName: rx }, { nvghCode: rx }, { nvghName: rx }] });
  }
  const salesKeyword = String(query.salesStaffCode || query.salesmanCode || query.nvbhCode || query.salesman || '').trim();
  if (salesKeyword) {
    const rx = new RegExp(escapeRegex(salesKeyword), 'i');
    and.push({ $or: [{ salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { salesmanName: rx }, { nvbhCode: rx }, { nvbhName: rx }] });
  }
  const keyword = String(query.q || query.keyword || query.search || '').trim();
  if (keyword) {
    const rx = new RegExp(escapeRegex(keyword), 'i');
    and.push({ $or: [
      { id: rx }, { code: rx }, { salesOrderCode: rx }, { orderCode: rx },
      { customerCode: rx }, { customerName: rx }, { deliveryStaffCode: rx },
      { deliveryStaffName: rx }, { salesStaffCode: rx }, { salesStaffName: rx }, { note: rx }
    ] });
  }
  if (and.length) filter.$and = and;

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(500, Math.max(1, Number(query.limit || 100)));
  const docs = await returnOrderRepository.findAll(filter, {
    sort: { createdAt: -1, code: -1 },
    skip: (page - 1) * limit,
    limit
  });

  const includeZeroValue = String(query.includeZeroValue ?? query.showZero ?? '0') === '1';
  const seen = new Set();
  return docs
    .map(toClient)
    .filter((order) => includeZeroValue || hasPositiveReturnValue(order))
    .filter((order) => {
      const stableKey = String(order.id || order.code || order._id || '').trim();
      if (!stableKey) return true;
      if (seen.has(stableKey)) return false;
      seen.add(stableKey);
      return true;
    });
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
  const salesOrder = await resolveSalesOrder(body).catch(() => null);
  const salesOrderId = canonicalOrderIdFromSalesOrder(salesOrder || {}, body || {});
  const salesOrderCode = canonicalOrderCodeFromSalesOrder(salesOrder || {}, body || {});
  const returnCode = buildCanonicalReturnCode(salesOrder || {}, { ...body, salesOrderCode });
  const canonical = await findExistingReturnOrderForSalesOrder({ salesOrderId, salesOrderCode, returnCode });
  if (canonical) return canonical;
  const filter = buildReturnOrderLookupFilter(body);
  if (!filter) return null;
  const candidates = await returnOrderRepository.findAll(filter, { sort: { updatedAt: -1, createdAt: -1 }, limit: 20 });
  return candidates.find((row) => !isInactiveStatus(row)) || null;
}


async function clearExistingDeliveryReturnOrders(body = {}) {
  const filter = buildReturnOrderLookupFilter(body);
  if (!filter) return { returnOrder: null, cleared: 0, rows: [] };

  const candidates = await returnOrderRepository.findAll(filter, {
    sort: { updatedAt: -1, createdAt: -1 },
    limit: 50
  });

  const now = dateUtil.nowIso();
  const note = String(body.note || 'NVGH sửa số lượng hàng trả về 0 trên app giao hàng').trim();
  const clearableRows = (candidates || []).filter((row) => {
    if (!row || isInactiveStatus(row)) return false;
    if ((row.returnMergeStatus || 'unmerged') === 'merged' || row.masterReturnOrderId || row.masterReturnOrderCode) return false;
    if (isPostedReturnStatus(row.status)) return false;
    return true;
  });

  let lastCleared = null;
  for (const row of clearableRows) {
    const cleared = {
      ...row,
      items: [],
      totalQuantity: 0,
      totalReturnAmount: 0,
      totalAmount: 0,
      amount: 0,
      debtReduction: 0,
      status: 'cleared',
      returnStatus: 'cleared',
      accountingStatus: 'cleared',
      warehouseReceiveStatus: 'cleared',
      refType: row.refType || body.refType || 'mobileDeliveryReturnClear',
      note,
      clearedAt: now,
      postedAt: '',
      receivedAt: '',
      updatedAt: now
    };
    await returnOrderRepository.upsert(cleared);
    lastCleared = cleared;
  }

  return {
    returnOrder: lastCleared ? toClient(lastCleared) : null,
    cleared: clearableRows.length,
    rows: clearableRows
  };
}



function isPostedReturnStatus(status = '') {
  const state = ReturnStateMachine.normalizeReturnState(status);
  return [
    RETURN_STATES.RECEIVED,
    RETURN_STATES.ACCOUNTING_CONFIRMED,
    RETURN_STATES.POSTED_TO_AR
  ].includes(state);
}

function isPendingReturnStatus(status = '') {
  const state = ReturnStateMachine.normalizeReturnState(status);
  return [
    RETURN_STATES.DRAFT,
    RETURN_STATES.WAITING_RECEIVE
  ].includes(state);
}

function isEditableReturnOrder(row = {}) {
  try {
    ReturnStateMachine.assertCanEdit(row);
    return true;
  } catch (_) {
    return false;
  }
}

function guardReturnOrderEdit(row = {}, messagePrefix = '') {
  try {
    ReturnStateMachine.assertCanEdit(row);
    return null;
  } catch (err) {
    return {
      error: messagePrefix || err.message,
      message: err.message,
      code: err.code,
      status: 400
    };
  }
}

function guardReturnOrderCancel(row = {}) {
  try {
    ReturnStateMachine.assertCanCancel(row);
    return null;
  } catch (err) {
    return {
      error: err.message,
      code: err.code,
      status: 400
    };
  }
}

function isReturnOrderLockedForCancel(row = {}) {
  try {
    ReturnStateMachine.assertCanCancel(row);
    return false;
  } catch (_) {
    return true;
  }
}

function cancelReasonFrom(body = {}, fallback = 'Khách lấy lại hàng') {
  return String(body.cancelReason || body.reason || body.note || fallback).trim();
}

async function updateSalesOrderReturnLink(salesOrder = null, patch = {}, options = {}) {
  if (!salesOrder || (!salesOrder.id && !salesOrder.code)) return null;
  const updated = {
    ...salesOrder,
    ...patch,
    updatedAt: dateUtil.nowIso()
  };
  await orderRepository.upsert(updated, options);
  return updated;
}

async function auditReturnOrder(action, before = null, after = null, note = '') {
  await auditService.log(action, {
    refType: 'returnOrder',
    refId: (after || before || {}).id || '',
    refCode: (after || before || {}).code || '',
    before,
    after,
    note
  });
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

  const existing = await findExistingReturnOrder(body);
  const totalAmount = toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const returnDate = resolveReturnDocumentDate(body, salesOrder || {}, existing || {});
  const returnOrder = {
    ...(existing || {}),
    ...body,
    id: String(buildCanonicalReturnCode(salesOrder || {}, body) || existing?.id || body.id || makeId('RO')).trim(),
    code: buildFastReturnCode(body, existing, salesOrder),
    date: returnDate,
    documentDate: returnDate,
    deliveryDate: returnDate,
    salesOrderId: salesOrder?.id || body.salesOrderId || body.orderId || existing?.salesOrderId || '',
    salesOrderCode: salesOrder?.code || body.salesOrderCode || body.orderCode || existing?.salesOrderCode || '',
    orderId: salesOrder?.id || body.orderId || body.salesOrderId || existing?.orderId || existing?.salesOrderId || '',
    orderCode: salesOrder?.code || body.orderCode || body.salesOrderCode || existing?.orderCode || existing?.salesOrderCode || '',
    customerId: customer?.id || body.customerId || salesOrder?.customerId || existing?.customerId || '',
    customerCode: customer?.code || body.customerCode || salesOrder?.customerCode || existing?.customerCode || '',
    customerName: customer?.name || body.customerName || salesOrder?.customerName || existing?.customerName || '',
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_RETURN_SNAPSHOT_STAFF_START =====
    // ReturnOrder snapshot nhân sự tại thời điểm tạo: NVBH từ salesOrders, NVGH từ salesOrders/master sync/body.
    salesStaffId: salesOrder?.salesStaffId || body.salesStaffId || existing?.salesStaffId || '',
    salesStaffCode: pickSalesStaffCode(salesOrder) || pickSalesStaffCode(body) || pickSalesStaffCode(existing),
    salesStaffName: pickSalesStaffName(salesOrder) || pickSalesStaffName(body) || pickSalesStaffName(existing),
    salesmanCode: pickSalesStaffCode(salesOrder) || pickSalesStaffCode(body) || pickSalesStaffCode(existing),
    salesmanName: pickSalesStaffName(salesOrder) || pickSalesStaffName(body) || pickSalesStaffName(existing),
    deliveryStaffId: salesOrder?.deliveryStaffId || body.deliveryStaffId || existing?.deliveryStaffId || '',
    deliveryStaffCode: pickDeliveryStaffCode(salesOrder) || pickDeliveryStaffCode(body) || pickDeliveryStaffCode(existing),
    deliveryStaffName: pickDeliveryStaffName(salesOrder) || pickDeliveryStaffName(body) || pickDeliveryStaffName(existing),
    staffCode: pickDeliveryStaffCode(salesOrder) || pickDeliveryStaffCode(body) || pickDeliveryStaffCode(existing),
    staffName: pickDeliveryStaffName(salesOrder) || pickDeliveryStaffName(body) || pickDeliveryStaffName(existing),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_RETURN_SNAPSHOT_STAFF_END =====
    note: String(body.note ?? existing?.note ?? '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount,
    amount: toNumber(body.amount ?? totalAmount),
    debtReduction: toNumber(body.debtReduction ?? totalAmount),
    status: body.status || existing?.status || RETURN_STATES.WAITING_RECEIVE,
    returnMergeStatus: body.returnMergeStatus || existing?.returnMergeStatus || 'unmerged',
    warehouseReceiveStatus: body.warehouseReceiveStatus || existing?.warehouseReceiveStatus || (isPostedReturnStatus(body.status) ? RETURN_STATES.RECEIVED : RETURN_STATES.WAITING_RECEIVE),
    source: body.source || existing?.source || 'returnOrders',
    accountingStatus: body.accountingStatus || existing?.accountingStatus || '',
    accountingConfirmed: Boolean(body.accountingConfirmed ?? existing?.accountingConfirmed ?? false),
    createdAt: existing?.createdAt || body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  return { returnOrder, existing };
}

async function createReturnOrder(body = {}) {
  const built = await buildReturnOrderDocument({
    ...body,
    status: body.status || RETURN_STATES.WAITING_RECEIVE,
    warehouseReceiveStatus: body.warehouseReceiveStatus || RETURN_STATES.WAITING_RECEIVE
  });
  if (built.error) return built;
  const { returnOrder, existing } = built;

  let finalReturnOrder = null;
  await withMongoTransaction(async (session) => {
    // Legacy createReturnOrder vẫn giữ hành vi cũ: tạo phiếu, nhập kho và ghi AR ngay.
    // Nhưng lifecycle nội bộ chạy đúng: received -> accounting_confirmed -> posted_to_ar.
    if (existing && isPostedReturnStatus(existing.status)) {
      await InventoryPostingService.reverseMovement(existing, {
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

    const receivedReturnOrder = {
      ...returnOrder,
      ...ReturnStateMachine.patchForState(returnOrder, RETURN_STATES.RECEIVED),
      returnState: RETURN_STATES.RECEIVED
    };

    const accountingConfirmedReturnOrder = {
      ...receivedReturnOrder,
      ...ReturnStateMachine.patchForState(receivedReturnOrder, RETURN_STATES.ACCOUNTING_CONFIRMED),
      returnState: RETURN_STATES.ACCOUNTING_CONFIRMED,
      accountingConfirmedBy: body.confirmedBy || body.user || 'system',
      accountingNote: body.note || returnOrder.accountingNote || ''
    };

    await returnOrderRepository.upsert(accountingConfirmedReturnOrder, { session });
    await InventoryPostingService.postReturnIn(receivedReturnOrder, { session });

    const posted = await postReturnOrderArIfNeeded(accountingConfirmedReturnOrder, { session });
    finalReturnOrder = posted.returnOrder || accountingConfirmedReturnOrder;
  });

  return { returnOrder: toClient(finalReturnOrder || { ...returnOrder, ...ReturnStateMachine.patchForState(returnOrder, RETURN_STATES.POSTED_TO_AR) }), updatedExisting: Boolean(existing) };
}

function normalizeDeliveryReturnItems(rawItems = [], salesOrder = null) {
  const salesItems = new Map((salesOrder?.items || []).map((item) => [String(item.productCode || item.code || item.productId || '').trim(), item]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productCode = String(raw.productCode || raw.code || raw.productId || '').trim();
      const original = salesItems.get(productCode) || {};
      const qtyReturn = toNumber(raw.qtyReturn ?? raw.returnQty ?? raw.returnQuantity ?? raw.returnedQty ?? raw.quantity ?? raw.qty ?? 0);
      const price = toNumber(raw.price ?? raw.salePrice ?? raw.unitPrice ?? original.price ?? original.salePrice ?? original.unitPrice ?? 0);
      return {
        ...original,
        ...raw,
        productId: raw.productId || original.productId || productCode,
        productCode: productCode || original.productCode || original.code || '',
        productName: raw.productName || raw.name || original.productName || original.name || '',
        quantity: qtyReturn,
        qty: qtyReturn,
        qtyReturn,
        returnQty: qtyReturn,
        returnQuantity: qtyReturn,
        returnedQty: qtyReturn,
        price,
        salePrice: price,
        unitPrice: price,
        amount: Math.round(toNumber(raw.amount ?? qtyReturn * price)),
        reason: raw.reason || ''
      };
    })
    .filter((item) => item.productCode && toNumber(item.qtyReturn) > 0);
}

async function upsertDeliveryReturnOrder(body = {}, options = {}) {
  const salesOrder = await resolveSalesOrder(body);
  const salesOrderId = canonicalOrderIdFromSalesOrder(salesOrder || {}, body || {});
  const salesOrderCode = canonicalOrderCodeFromSalesOrder(salesOrder || {}, body || {});
  if (!salesOrderId && !salesOrderCode) {
    return { error: 'Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả', status: 400 };
  }

  const returnCode = buildCanonicalReturnCode(salesOrder || {}, { ...body, salesOrderCode });
  const customer = await resolveCustomer(body, salesOrder);
  if (!customer && !body.customerName && !salesOrder?.customerName) {
    return { error: 'Không tìm thấy khách hàng', status: 404 };
  }

  const existing = await findExistingReturnOrderForSalesOrder({ salesOrderId, salesOrderCode, returnCode });
  if (existing && ((existing.returnMergeStatus || 'unmerged') === 'merged' || existing.masterReturnOrderId || existing.masterReturnOrderCode)) {
    return { error: 'Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng', status: 400 };
  }
  if (existing) {
    const editGuard = guardReturnOrderEdit(existing, 'Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng');
    if (editGuard) return editGuard;
  }

  const items = normalizeDeliveryReturnItems(body.items, salesOrder);
  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.qtyReturn), 0);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount ?? toNumber(item.qtyReturn) * toNumber(item.price || item.salePrice || item.unitPrice)), 0);
  const now = dateUtil.nowIso();

  const payload = {
    ...(existing || {}),
    ...body,
    id: returnCode || existing?.id || body.id || makeId('RO'),
    code: returnCode || existing?.code || body.code || makeId('RO'),
    date: dateUtil.toDateOnly(body.date || body.documentDate || existing?.date || salesOrder?.deliveryDate || dateUtil.todayVN()),
    documentDate: dateUtil.toDateOnly(body.documentDate || body.date || existing?.documentDate || salesOrder?.date || dateUtil.todayVN()),
    deliveryDate: dateUtil.toDateOnly(body.deliveryDate || salesOrder?.deliveryDate || existing?.deliveryDate || body.date || dateUtil.todayVN()),
    salesOrderId,
    salesOrderCode,
    orderId: salesOrderId,
    orderCode: salesOrderCode,
    customerId: customer?.id || body.customerId || salesOrder?.customerId || existing?.customerId || '',
    customerCode: customer?.code || body.customerCode || salesOrder?.customerCode || existing?.customerCode || '',
    customerName: customer?.name || body.customerName || salesOrder?.customerName || existing?.customerName || '',
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_DELIVERY_RETURN_SNAPSHOT_STAFF_START =====
    salesStaffId: salesOrder?.salesStaffId || body.salesStaffId || existing?.salesStaffId || '',
    salesStaffCode: pickSalesStaffCode(salesOrder) || pickSalesStaffCode(body) || pickSalesStaffCode(existing),
    salesStaffName: pickSalesStaffName(salesOrder) || pickSalesStaffName(body) || pickSalesStaffName(existing),
    salesmanCode: pickSalesStaffCode(salesOrder) || pickSalesStaffCode(body) || pickSalesStaffCode(existing),
    salesmanName: pickSalesStaffName(salesOrder) || pickSalesStaffName(body) || pickSalesStaffName(existing),
    deliveryStaffId: salesOrder?.deliveryStaffId || body.deliveryStaffId || existing?.deliveryStaffId || '',
    deliveryStaffCode: pickDeliveryStaffCode(salesOrder) || pickDeliveryStaffCode(body) || pickDeliveryStaffCode(existing),
    deliveryStaffName: pickDeliveryStaffName(salesOrder) || pickDeliveryStaffName(body) || pickDeliveryStaffName(existing),
    staffCode: pickDeliveryStaffCode(salesOrder) || pickDeliveryStaffCode(body) || pickDeliveryStaffCode(existing),
    staffName: pickDeliveryStaffName(salesOrder) || pickDeliveryStaffName(body) || pickDeliveryStaffName(existing),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_DELIVERY_RETURN_SNAPSHOT_STAFF_END =====
    items: totalQuantity > 0 ? items : [],
    totalQuantity: totalQuantity > 0 ? totalQuantity : 0,
    totalAmount: totalQuantity > 0 ? totalAmount : 0,
    amount: totalQuantity > 0 ? totalAmount : 0,
    debtReduction: totalQuantity > 0 ? totalAmount : 0,
    totalReturnAmount: totalQuantity > 0 ? totalAmount : 0,
    status: totalQuantity > 0 ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.CANCELLED,
    returnStatus: totalQuantity > 0 ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.CANCELLED,
    returnState: totalQuantity > 0 ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.CANCELLED,
    returnMergeStatus: existing?.returnMergeStatus || body.returnMergeStatus || 'unmerged',
    warehouseReceiveStatus: totalQuantity > 0 ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.CANCELLED,
    source: body.source || existing?.source || 'mobile_delivery',
    accountingStatus: totalQuantity > 0 ? 'pending' : RETURN_STATES.CANCELLED,
    accountingConfirmed: false,
    postedAt: '',
    receivedAt: '',
    note: String(body.note ?? existing?.note ?? '').trim(),
    clearedAt: totalQuantity > 0 ? '' : now,
    updatedAt: now,
    createdAt: existing?.createdAt || body.createdAt || now
  };

  await returnOrderRepository.upsert(payload, options);
  await cancelDuplicateReturnOrders({
    keepId: existing?._id || payload.id,
    keepCode: payload.code,
    salesOrderId,
    salesOrderCode,
    returnCode: payload.code
  });

  const saved = await findExistingReturnOrderForSalesOrder({ salesOrderId, salesOrderCode, returnCode: payload.code }) || payload;
  return { returnOrder: toClient(saved), updatedExisting: Boolean(existing), canonicalCode: payload.code };
}


async function createPendingReturnOrder(body = {}, options = {}) {
  const built = await buildReturnOrderDocument({
    ...body,
    status: body.status || RETURN_STATES.WAITING_RECEIVE,
    returnMergeStatus: body.returnMergeStatus || 'unmerged',
    warehouseReceiveStatus: body.warehouseReceiveStatus || RETURN_STATES.WAITING_RECEIVE
  });
  if (built.error) return built;
  const { returnOrder, existing } = built;
  const pendingQty = toNumber(returnOrder.totalQuantity ?? 0)
    || (Array.isArray(returnOrder.items) ? returnOrder.items.reduce((sum, item) => sum + toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.quantity ?? item.qty ?? 0), 0) : 0);

  // Nếu nguồn web/ERP gửi danh sách trả = 0 thì không được tạo lại RO-DRAFT waiting_receive.
  // Chỉ clear phiếu tạm cũ nếu có, rồi trả về.
  if (pendingQty <= 0) {
    const clearResult = await clearExistingDeliveryReturnOrders(returnOrder);
    return {
      returnOrder: clearResult.returnOrder || toClient({ ...returnOrder, items: [], totalQuantity: 0, totalAmount: 0, amount: 0, debtReduction: 0, status: RETURN_STATES.CANCELLED, returnStatus: RETURN_STATES.CANCELLED, returnState: RETURN_STATES.CANCELLED, warehouseReceiveStatus: RETURN_STATES.CANCELLED, accountingStatus: RETURN_STATES.CANCELLED }),
      updatedExisting: clearResult.cleared > 0,
      cleared: clearResult.cleared,
      skippedCreate: clearResult.cleared <= 0
    };
  }

  if (existing && ((existing.returnMergeStatus || 'unmerged') === 'merged' || existing.masterReturnOrderId || existing.masterReturnOrderCode)) {
    return { error: 'Phiếu trả hàng đã gộp đơn tổng, không được sửa từ màn giao hàng', status: 400 };
  }
  if (existing) {
    const editGuard = guardReturnOrderEdit(existing, 'Phiếu trả hàng đã ghi sổ/kho đã nhận, không được sửa từ màn giao hàng');
    if (editGuard) return editGuard;
  }

  const pendingReturnOrder = {
    ...returnOrder,
    ...ReturnStateMachine.patchForState(returnOrder, RETURN_STATES.WAITING_RECEIVE),
    returnState: RETURN_STATES.WAITING_RECEIVE,
    returnMergeStatus: 'unmerged',
    postedAt: '',
    receivedAt: ''
  };
  await returnOrderRepository.upsert(pendingReturnOrder, options);

  // V45 chuẩn: đơn trả từ app giao hàng chỉ là đề nghị/ghi nhận tạm.
  // Không post AR-RETURN và không sync công nợ tại đây; AR chỉ ghi khi kế toán xác nhận báo cáo giao hàng.

  return { returnOrder: toClient({ ...pendingReturnOrder, status: RETURN_STATES.WAITING_RECEIVE, warehouseReceiveStatus: RETURN_STATES.WAITING_RECEIVE }), updatedExisting: Boolean(existing) };
}

async function confirmReceiveReturnOrder(idOrCode, options = {}) {
  const current = await returnOrderRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu trả hàng', status: 404 };

  const currentState = ReturnStateMachine.getReturnState(current);
  if (currentState === RETURN_STATES.RECEIVED || currentState === RETURN_STATES.ACCOUNTING_CONFIRMED || currentState === RETURN_STATES.POSTED_TO_AR) {
    return { returnOrder: toClient(current), alreadyReceived: true };
  }

  try {
    ReturnStateMachine.assertTransition(current, RETURN_STATES.RECEIVED, 'confirm_receive');
  } catch (err) {
    return { error: err.message, code: err.code, status: 400 };
  }

  let received = {
    ...current,
    ...ReturnStateMachine.patchForState(current, RETURN_STATES.RECEIVED),
    returnState: RETURN_STATES.RECEIVED,
    stateChangedAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };

  await withMongoTransaction(async (session) => {
    await returnOrderRepository.upsert(received, { session });
    await InventoryPostingService.postReturnIn(received, { session });
  });

  return { returnOrder: toClient(received), alreadyReceived: false };
}

async function confirmAccountingReturnOrder(idOrCode, body = {}, options = {}) {
  const current = await returnOrderRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu trả hàng', status: 404 };

  try {
    ReturnStateMachine.assertCanConfirmAccounting(current);
  } catch (err) {
    return { error: err.message, code: err.code, status: 400 };
  }

  let postedReturnOrder = null;

  await withMongoTransaction(async (session) => {
    const accountingConfirmed = {
      ...current,
      ...ReturnStateMachine.patchForState(current, RETURN_STATES.ACCOUNTING_CONFIRMED),
      returnState: RETURN_STATES.ACCOUNTING_CONFIRMED,
      accountingConfirmedBy: body.confirmedBy || body.user || options.user?.code || 'system',
      accountingNote: body.note || current.accountingNote || '',
      stateChangedAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    };

    ReturnStateMachine.assertTransition(current, RETURN_STATES.ACCOUNTING_CONFIRMED, 'confirm_accounting');

    await returnOrderRepository.upsert(accountingConfirmed, { session });

    const posted = await postReturnOrderArIfNeeded(accountingConfirmed, { session });
    postedReturnOrder = posted.returnOrder || accountingConfirmed;
  });

  return { returnOrder: toClient(postedReturnOrder) };
}

function returnLineKey(item = {}) {
  return [
    String(item.productCode || item.code || item.productId || '').trim(),
    String(item.unit || item.baseUnit || '').trim(),
    String(toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0))
  ].join('|');
}

function orderItemToReturnDraftItem(item = {}, existedItem = {}) {
  const soldQty = toNumber(item.quantity ?? item.qty ?? item.totalQty ?? item.soldQty ?? 0);
  const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? existedItem.price ?? existedItem.salePrice ?? 0);
  const returnQty = toNumber(existedItem.returnQty ?? existedItem.qtyReturn ?? existedItem.returnQuantity ?? existedItem.quantity ?? 0);
  return {
    ...existedItem,
    productId: item.productId || existedItem.productId || item.productCode || item.code || '',
    productCode: String(item.productCode || item.code || item.productId || existedItem.productCode || '').trim(),
    productName: String(item.productName || item.name || existedItem.productName || '').trim(),
    unit: String(item.unit || item.baseUnit || existedItem.unit || '').trim(),
    soldQty,
    price,
    salePrice: price,
    unitPrice: price,
    soldAmount: Math.round(soldQty * price),
    returnQty,
    qtyReturn: returnQty,
    returnQuantity: returnQty,
    returnedQty: returnQty,
    quantity: returnQty,
    qty: returnQty,
    returnAmount: Math.round(returnQty * price),
    amount: Math.round(returnQty * price),
    lineKey: returnLineKey({ ...item, price })
  };
}

function hasReturnQuantity(row = {}) {
  return (Array.isArray(row.items) ? row.items : []).some((item) => toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.quantity ?? 0) > 0)
    || toNumber(row.totalReturnAmount ?? row.totalAmount ?? row.amount ?? row.debtReduction ?? 0) > 0;
}

function summarizeReturnDraftItems(items = []) {
  const totalSoldAmount = items.reduce((sum, item) => sum + toNumber(item.soldAmount ?? toNumber(item.soldQty) * toNumber(item.price)), 0);
  const totalReturnAmount = items.reduce((sum, item) => sum + toNumber(item.returnAmount ?? toNumber(item.returnQty) * toNumber(item.price)), 0);
  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.returnQty ?? item.qtyReturn ?? item.quantity), 0);
  return {
    totalSoldAmount: Math.round(totalSoldAmount),
    totalReturnAmount: Math.round(totalReturnAmount),
    totalQuantity,
    totalAmount: Math.round(totalReturnAmount),
    amount: Math.round(totalReturnAmount),
    debtReduction: Math.round(totalReturnAmount)
  };
}

async function findBySalesOrder(order = {}) {
  const rows = await findReturnOrdersBySalesOrderRefs([order], { sort: { updatedAt: -1, createdAt: -1 }, limit: 20 });
  return rows.find((row) => row && !isInactiveStatus(row)) || null;
}

function resolveReturnDocumentDate(body = {}, salesOrder = {}, existing = {}) {
  return dateUtil.toDateOnly(
    body.deliveryDate ||
    body.date ||
    body.documentDate ||
    salesOrder.deliveryDate ||
    salesOrder.date ||
    existing.deliveryDate ||
    existing.date ||
    existing.documentDate ||
    dateUtil.todayVN()
  );
}

function buildReturnDraftFromSalesOrder(order = {}, existing = null) {
  const existingItemsByKey = new Map();
  for (const item of (Array.isArray(existing?.items) ? existing.items : [])) {
    existingItemsByKey.set(String(item.lineKey || returnLineKey(item)).trim(), item);
  }
  const items = (Array.isArray(order.items) ? order.items : [])
    .map((item) => {
      const key = returnLineKey(item);
      return orderItemToReturnDraftItem(item, existingItemsByKey.get(key) || {});
    })
    .filter((item) => item.productCode || item.productName);
  const summary = summarizeReturnDraftItems(items);
  const hasReturn = summary.totalReturnAmount > 0 || items.some((item) => toNumber(item.returnQty) > 0);
  return {
    ...(existing || {}),
    id: String(buildCanonicalReturnCode(order, existing) || existing?.id || makeId('RO')).trim(),
    code: String(buildCanonicalReturnCode(order, existing) || existing?.code || makeId('RO')).trim(),
    date: dateUtil.toDateOnly(order.deliveryDate || existing?.deliveryDate || order.date || existing?.date || dateUtil.todayVN()),
    documentDate: dateUtil.toDateOnly(order.deliveryDate || existing?.deliveryDate || order.date || order.orderDate || existing?.documentDate || existing?.date || dateUtil.todayVN()),
    salesOrderId: order.id || existing?.salesOrderId || '',
    salesOrderCode: order.code || existing?.salesOrderCode || '',
    orderId: order.id || existing?.orderId || '',
    orderCode: order.code || existing?.orderCode || '',
    customerId: order.customerId || existing?.customerId || '',
    customerCode: order.customerCode || existing?.customerCode || '',
    customerName: order.customerName || existing?.customerName || '',
    salesStaffId: order.salesStaffId || existing?.salesStaffId || '',
    salesStaffCode: pickSalesStaffCode(order) || pickSalesStaffCode(existing),
    salesStaffName: pickSalesStaffName(order) || pickSalesStaffName(existing),
    // legacy display only, not business source: staff* trên returnOrders đại diện NVGH, không đại diện NVBH.
    staffCode: pickDeliveryStaffCode(order) || pickDeliveryStaffCode(existing),
    staffName: pickDeliveryStaffName(order) || pickDeliveryStaffName(existing),
    masterOrderId: order.masterOrderId || existing?.masterOrderId || '',
    masterOrderCode: order.masterOrderCode || existing?.masterOrderCode || '',
    deliveryStaffId: order.deliveryStaffId || existing?.deliveryStaffId || '',
    deliveryStaffCode: pickDeliveryStaffCode(order) || pickDeliveryStaffCode(existing),
    deliveryStaffName: pickDeliveryStaffName(order) || pickDeliveryStaffName(existing),
    deliveryDate: dateUtil.toDateOnly(order.deliveryDate || existing?.deliveryDate || order.date || dateUtil.todayVN()),
    routeName: order.routeName || order.deliveryRoute || existing?.routeName || '',
    deliveryRoute: order.deliveryRoute || order.routeName || existing?.deliveryRoute || '',
    items,
    ...summary,
    status: existing && isPostedReturnStatus(existing.status) ? existing.status : (hasReturn ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.DRAFT),
    returnStatus: hasReturn ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.DRAFT,
    returnState: hasReturn ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.DRAFT,
    returnMergeStatus: existing?.returnMergeStatus || 'unmerged',
    warehouseReceiveStatus: hasReturn ? (existing?.warehouseReceiveStatus || RETURN_STATES.WAITING_RECEIVE) : RETURN_STATES.DRAFT,
    source: existing?.source || 'sales_order_draft',
    createdFrom: existing?.createdFrom || 'sales_order',
    accountingStatus: hasReturn ? (existing?.accountingStatus || 'pending') : RETURN_STATES.DRAFT,
    accountingConfirmed: Boolean(existing?.accountingConfirmed),
    postedAt: existing?.postedAt || '',
    cancelledAt: '',
    deletedAt: '',
    updatedAt: dateUtil.nowIso(),
    createdAt: existing?.createdAt || dateUtil.nowIso()
  };
}

async function ensureReturnDraftForSalesOrder(order = {}, options = {}) {
  if (!order || (!order.id && !order.code)) return null;
  const existing = await findBySalesOrder(order);
  if (!existing) {
    // V45 lazy return-order: không tạo RO-DRAFT rỗng khi chỉ tạo/sửa đơn bán.
    // Trả draft ảo cho UI nếu cần hiển thị form hàng trả, nhưng không ghi Mongo.
    return { returnOrder: toClient(buildReturnDraftFromSalesOrder(order, null)), virtualDraft: true, skipped: 'no_return_quantity' };
  }
  if (isPostedReturnStatus(existing.status)) return { returnOrder: toClient(existing), skipped: 'posted' };
  const draft = buildReturnDraftFromSalesOrder(order, existing);
  if (!hasReturnQuantity(draft)) {
    const cleared = {
      ...draft,
      items: [],
      totalQuantity: 0,
      totalReturnAmount: 0,
      totalAmount: 0,
      amount: 0,
      debtReduction: 0,
      status: RETURN_STATES.CANCELLED,
      returnStatus: RETURN_STATES.CANCELLED,
      returnState: RETURN_STATES.CANCELLED,
      warehouseReceiveStatus: RETURN_STATES.CANCELLED,
      accountingStatus: RETURN_STATES.CANCELLED,
      cancelReason: '',
      cancelledAt: '',
      clearedAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso(),
      note: 'Đồng bộ đơn bán: không còn số lượng trả'
    };
    if (!options.dryRun) {
      await returnOrderRepository.upsert(cleared, options);
      await updateSalesOrderReturnLink(order, { hasReturn: false, returnOrderId: '', returnOrderCode: '', returnAmount: 0 }, options);
      await auditReturnOrder('clear_return_order', existing, cleared, cleared.note);
    }
    return { returnOrder: toClient(cleared), cleared: true };
  }
  await returnOrderRepository.upsert(draft, options);
  await updateSalesOrderReturnLink(order, {
    hasReturn: true,
    returnOrderId: draft.id || '',
    returnOrderCode: draft.code || '',
    returnAmount: toNumber(draft.totalAmount ?? draft.amount ?? 0)
  }, options);
  return { returnOrder: toClient(draft), updatedExisting: true };
}

async function syncReturnDraftWithSalesOrder(order = {}, options = {}) {
  const existing = await findBySalesOrder(order);
  if (!existing) return { skipped: 'not_found' };
  return ensureReturnDraftForSalesOrder(order, options);
}

async function cancelReturnDraftForSalesOrder(order = {}, options = {}) {
  const existing = await findBySalesOrder(order);
  if (!existing) return { skipped: 'not_found' };
  if (isReturnOrderLockedForCancel(existing)) {
    return { error: 'Phiếu trả hàng đã nhập kho/ghi sổ. Vui lòng tạo phiếu đảo trước khi hủy đơn.', status: 400 };
  }
  const cancelled = {
    ...existing,
    ...ReturnStateMachine.patchForState(existing, RETURN_STATES.CANCELLED),
    returnState: RETURN_STATES.CANCELLED,
    cancelReason: cancelReasonFrom(options, 'Huỷ theo đơn bán/giao'),
    cancelledAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  if (options.dryRun) return { returnOrder: toClient(cancelled), dryRun: true };
  await returnOrderRepository.upsert(cancelled, options);
  await updateSalesOrderReturnLink(order, { hasReturn: false, returnOrderId: '', returnOrderCode: '', returnAmount: 0 }, options);
  await auditReturnOrder('cancel_return_order', existing, cancelled, cancelled.cancelReason);
  return { returnOrder: toClient(cancelled) };
}

async function restoreReturnDraftForSalesOrder(order = {}, options = {}) {
  const existing = await findBySalesOrder(order);
  if (!existing) {
    return { returnOrder: toClient(buildReturnDraftFromSalesOrder(order, null)), virtualDraft: true, skipped: 'no_existing_return_order' };
  }
  const draft = buildReturnDraftFromSalesOrder(order, existing);
  if (!hasReturnQuantity(draft)) return { returnOrder: toClient(draft), virtualDraft: true, skipped: 'no_return_quantity' };
  draft.status = hasReturnQuantity(draft) ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.DRAFT;
  draft.returnStatus = draft.status;
  draft.returnState = draft.status;
  draft.cancelledAt = '';
  await returnOrderRepository.upsert(draft, options);
  await updateSalesOrderReturnLink(order, { hasReturn: true, returnOrderId: draft.id || '', returnOrderCode: draft.code || '', returnAmount: toNumber(draft.totalAmount ?? draft.amount ?? 0) }, options);
  return { returnOrder: toClient(draft), updatedExisting: Boolean(existing) };
}

async function attachMasterOrderToReturnDrafts(masterOrder = {}, childOrders = [], options = {}) {
  const orderIds = uniqueStrings((childOrders || []).flatMap((child) => [child?.id, child?._id, child?.salesOrderId, child?.orderId]));
  const orderCodes = uniqueStrings((childOrders || []).flatMap((child) => [child?.code, child?.orderCode, child?.salesOrderCode]));
  const or = [];
  if (orderIds.length) {
    or.push({ salesOrderId: { $in: orderIds } });
    or.push({ orderId: { $in: orderIds } });
  }
  if (orderCodes.length) {
    or.push({ salesOrderCode: { $in: orderCodes } });
    or.push({ orderCode: { $in: orderCodes } });
  }
  if (!or.length) return [];
  const update = {
    $set: {
      masterOrderId: masterOrder.id || '',
      masterOrderCode: masterOrder.code || '',
      deliveryStaffId: masterOrder.deliveryStaffId || '',
      deliveryStaffCode: masterOrder.deliveryStaffCode || '',
      deliveryStaffName: masterOrder.deliveryStaffName || '',
      deliveryDate: dateUtil.toDateOnly(masterOrder.deliveryDate || masterOrder.date || dateUtil.todayVN()),
      routeName: masterOrder.routeName || '',
      deliveryRoute: masterOrder.deliveryRoute || masterOrder.routeName || '',
      date: dateUtil.toDateOnly(masterOrder.deliveryDate || masterOrder.date || dateUtil.todayVN()),
      updatedAt: dateUtil.nowIso()
    }
  };
  await ReturnOrder.updateMany(
    { $or: or, status: { $in: ACTIVE_RETURN_ORDER_STATUSES } },
    update,
    options.session ? { session: options.session } : {}
  );
  return findReturnOrdersBySalesOrderRefs(childOrders);
}


async function detachMasterOrderFromReturnDrafts(childOrders = [], options = {}) {
  const orderIds = uniqueStrings((childOrders || []).flatMap((child) => [child?.id, child?._id, child?.salesOrderId, child?.orderId]));
  const orderCodes = uniqueStrings((childOrders || []).flatMap((child) => [child?.code, child?.orderCode, child?.salesOrderCode]));
  const or = [];
  if (orderIds.length) {
    or.push({ salesOrderId: { $in: orderIds } });
    or.push({ orderId: { $in: orderIds } });
  }
  if (orderCodes.length) {
    or.push({ salesOrderCode: { $in: orderCodes } });
    or.push({ orderCode: { $in: orderCodes } });
  }
  if (!or.length) return [];

  const expectedMasterKeys = uniqueStrings([
    options.expectedMasterOrderId,
    options.expectedMasterOrderCode
  ]);
  const filter = {
    $or: or,
    status: { $in: ACTIVE_RETURN_ORDER_STATUSES }
  };
  if (expectedMasterKeys.length) {
    filter.$and = [{
      $or: [
        { masterOrderId: { $in: expectedMasterKeys } },
        { masterOrderCode: { $in: expectedMasterKeys } },
        { deliveryMasterId: { $in: expectedMasterKeys } },
        { deliveryMasterCode: { $in: expectedMasterKeys } }
      ]
    }];
  }

  await ReturnOrder.updateMany(
    filter,
    {
      $set: { updatedAt: dateUtil.nowIso() },
      $unset: {
        masterOrderId: '',
        masterOrderCode: '',
        deliveryMasterId: '',
        deliveryMasterCode: '',
        deliveryStaffId: '',
        deliveryStaffCode: '',
        deliveryStaffName: '',
        deliveryCode: '',
        deliveryName: '',
        shipperCode: '',
        shipperName: '',
        nvghCode: '',
        nvghName: '',
        staffDeliveryCode: '',
        staffDeliveryName: '',
        driverId: '',
        driverCode: '',
        driverName: '',
        staffCode: '',
        staffName: '',
        deliveryDate: '',
        routeName: '',
        deliveryRoute: ''
      }
    },
    options.session ? { session: options.session } : {}
  );
  return findReturnOrdersBySalesOrderRefs(childOrders);
}


async function getReturnOrderBySalesOrderKey(salesOrderIdOrCode, query = {}, options = {}) {
  const key = String(salesOrderIdOrCode || query.salesOrderId || query.salesOrderCode || query.orderId || query.orderCode || '').trim();
  if (!key) return { error: 'Thiếu salesOrderId/salesOrderCode', status: 400 };
  const salesOrder = await orderRepository.findByIdOrCode(key);
  const lookup = {
    salesOrderId: salesOrder?.id || query.salesOrderId || query.orderId || key,
    salesOrderCode: salesOrder?.code || query.salesOrderCode || query.orderCode || key
  };
  let existing = await findExistingReturnOrder(lookup);

  // Lazy return-order: GET chỉ trả draft ảo để UI hiển thị đủ dòng hàng, không ghi RO-DRAFT rỗng vào Mongo.
  if (salesOrder && options.ensureDraft !== false && (!existing || !isPostedReturnStatus(existing.status))) {
    const virtualDraft = buildReturnDraftFromSalesOrder(salesOrder, existing || null);
    return { returnOrder: toClient(virtualDraft), virtualDraft: !existing };
  }
  if (!existing) return { returnOrder: null };
  return { returnOrder: toClient(existing) };
}

async function updateReturnDraftItemsBySalesOrder(salesOrderIdOrCode, body = {}, options = {}) {
  const key = String(salesOrderIdOrCode || body.salesOrderId || body.salesOrderCode || body.orderId || body.orderCode || '').trim();
  if (!key) return { error: 'Thiếu salesOrderId/salesOrderCode', status: 400 };
  const salesOrder = await orderRepository.findByIdOrCode(key);
  const lookup = {
    ...body,
    salesOrderId: salesOrder?.id || body.salesOrderId || body.orderId || key,
    salesOrderCode: salesOrder?.code || body.salesOrderCode || body.orderCode || key
  };
  let current = await findExistingReturnOrder(lookup);
  if (!current && salesOrder) {
    // Chỉ dựng draft trong bộ nhớ. Nếu tổng returnQty > 0 mới upsert sau khi tính xong.
    current = buildReturnDraftFromSalesOrder(salesOrder, null);
  }
  if (!current) return { error: 'Không tìm thấy đơn gốc để tạo/cập nhật phiếu trả hàng', status: 404 };

  const editGuard = guardReturnOrderEdit(current, 'Phiếu trả hàng đã nhập kho/ghi sổ, không được sửa. Vui lòng tạo phiếu đảo nếu khách lấy lại hàng.');
  if (editGuard) return editGuard;
  if ((current.returnMergeStatus || 'unmerged') === 'merged' || current.masterReturnOrderId || current.masterReturnOrderCode) {
    return { error: 'Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả', status: 400 };
  }

  const inputItems = Array.isArray(body.items) ? body.items : [];
  const inputByCode = new Map();
  const inputByKey = new Map();
  for (const raw of inputItems) {
    const code = String(raw.productCode || raw.code || raw.productId || '').trim();
    const lineKey = String(raw.lineKey || returnLineKey(raw)).trim();
    if (code) inputByCode.set(code, raw);
    if (lineKey) inputByKey.set(lineKey, raw);
  }

  // Khi lưu từ app hoặc phần mềm, danh sách chuẩn vẫn phải lấy từ order.items gốc.
  // current.items có thể chỉ chứa các dòng đã trả của dữ liệu cũ, nên không được dùng làm danh sách chính nếu có salesOrder.
  const baseItems = Array.isArray(salesOrder?.items) && salesOrder.items.length
    ? buildReturnDraftFromSalesOrder(salesOrder, current).items
    : (Array.isArray(current.items) ? current.items : []);

  const items = baseItems.map((item) => {
    const key = String(item.lineKey || returnLineKey(item)).trim();
    const code = String(item.productCode || item.code || item.productId || '').trim();
    const raw = inputByKey.get(key) || inputByCode.get(code) || null;
    const nextReturnQty = raw ? toNumber(raw.returnQty ?? raw.qtyReturn ?? raw.returnQuantity ?? raw.quantity ?? 0) : toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? 0);
    const soldQty = toNumber(item.soldQty ?? item.quantitySold ?? item.orderQty ?? item.totalQty ?? item.qtySold ?? 0);
    if (nextReturnQty < 0) throw new Error('Số lượng trả không được âm');
    if (soldQty > 0 && nextReturnQty > soldQty) throw new Error(`Số lượng trả ${item.productCode || item.productName} không được lớn hơn số lượng giao`);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0);
    return {
      ...item,
      returnQty: nextReturnQty,
      qtyReturn: nextReturnQty,
      returnQuantity: nextReturnQty,
      returnedQty: nextReturnQty,
      quantity: nextReturnQty,
      qty: nextReturnQty,
      returnAmount: Math.round(nextReturnQty * price),
      amount: Math.round(nextReturnQty * price),
      lineKey: key
    };
  });

  const summary = summarizeReturnDraftItems(items);
  const hasReturn = summary.totalReturnAmount > 0 || items.some((item) => toNumber(item.returnQty) > 0);
  const returnDate = resolveReturnDocumentDate(body, salesOrder || {}, current || {});
  const baseUpdated = {
    ...current,
    ...summary,
    date: returnDate,
    deliveryDate: returnDate,
    documentDate: returnDate,
    items,
    source: body.source || current.source || 'returnOrders',
    updatedFrom: body.source || body.updatedFrom || 'unknown',
    updatedBy: body.updatedBy || body.user || current.updatedBy || '',
    updatedAt: dateUtil.nowIso()
  };

  if (!hasReturn) {
    const clearResult = await clearExistingDeliveryReturnOrders({ ...lookup, ...body, note: body.note || 'Đã sửa hàng trả về 0 từ phần mềm' });
    const cleared = {
      ...baseUpdated,
      items: [],
      totalQuantity: 0,
      totalReturnAmount: 0,
      totalAmount: 0,
      amount: 0,
      debtReduction: 0,
      status: RETURN_STATES.CANCELLED,
      returnStatus: RETURN_STATES.CANCELLED,
      returnState: RETURN_STATES.CANCELLED,
      warehouseReceiveStatus: RETURN_STATES.CANCELLED,
      accountingStatus: RETURN_STATES.CANCELLED,
      cancelReason: '',
      cancelledAt: '',
      clearedAt: dateUtil.nowIso(),
      note: body.note || 'Đã sửa hàng trả về 0 từ phần mềm'
    };
    if (salesOrder) await updateSalesOrderReturnLink(salesOrder, { hasReturn: false, returnOrderId: '', returnOrderCode: '', returnAmount: 0 }, options);
    if (clearResult.cleared > 0) await auditReturnOrder('clear_return_order', current, clearResult.returnOrder || cleared, cleared.note);
    return { returnOrder: clearResult.returnOrder || toClient(cleared), cleared: clearResult.cleared > 0, skippedCreate: clearResult.cleared <= 0 };
  }

  const updated = {
    ...baseUpdated,
    ...ReturnStateMachine.patchForState(baseUpdated, RETURN_STATES.WAITING_RECEIVE),
    returnState: RETURN_STATES.WAITING_RECEIVE,
    accountingStatus: 'pending',
    cancelledAt: '',
    cancelReason: ''
  };
  await returnOrderRepository.upsert(updated, options);
  if (salesOrder) {
    await updateSalesOrderReturnLink(salesOrder, {
      hasReturn: true,
      returnOrderId: updated.id || '',
      returnOrderCode: updated.code || '',
      returnAmount: toNumber(updated.totalAmount ?? updated.amount ?? 0)
    }, options);
  }
  await auditReturnOrder(current && current.status === 'cancelled' ? 'restore_return_order' : 'upsert_return_order', current, updated, 'Cập nhật số lượng hàng trả');
  return { returnOrder: toClient(updated) };
}

async function cancelReturnOrderById(idOrCode, body = {}, options = {}) {
  const current = await returnOrderRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu trả hàng', status: 404 };
  const cancelGuard = guardReturnOrderCancel(current);
  if (cancelGuard) return cancelGuard;
  if ((current.returnMergeStatus || 'unmerged') === 'merged' || current.masterReturnOrderId || current.masterReturnOrderCode) {
    return { error: 'Phiếu trả hàng đã gộp đơn tổng trả hàng, cần hủy gộp trước', status: 400 };
  }
  const cancelled = {
    ...current,
    ...ReturnStateMachine.patchForState(current, RETURN_STATES.CANCELLED),
    returnState: RETURN_STATES.CANCELLED,
    warehouseReceiveStatus: 'cancelled',
    accountingStatus: 'cancelled',
    cancelReason: cancelReasonFrom(body, 'Khách lấy lại hàng'),
    cancelledAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await returnOrderRepository.upsert(cancelled, options);
  const salesKey = current.salesOrderId || current.orderId || current.salesOrderCode || current.orderCode || '';
  const salesOrder = salesKey ? await orderRepository.findByIdOrCode(salesKey) : null;
  if (salesOrder) await updateSalesOrderReturnLink(salesOrder, { hasReturn: false, returnOrderId: '', returnOrderCode: '', returnAmount: 0 }, options);
  await auditReturnOrder('cancel_return_order', current, cancelled, cancelled.cancelReason);
  return { returnOrder: toClient(cancelled) };
}

async function updateReturnDraftItems(idOrCode, body = {}, options = {}) {
  const current = await returnOrderRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy đơn chờ trả hàng', status: 404 };
  const editGuard = guardReturnOrderEdit(current, 'Phiếu trả hàng đã ghi sổ/kho, không được sửa');
  if (editGuard) return editGuard;
  if ((current.returnMergeStatus || 'unmerged') === 'merged' || current.masterReturnOrderId || current.masterReturnOrderCode) {
    return { error: 'Phiếu trả hàng đã gộp đơn tổng trả hàng, không được sửa số lượng trả', status: 400 };
  }
  const inputItems = Array.isArray(body.items) ? body.items : [];
  const inputByKey = new Map();
  for (const raw of inputItems) {
    const key = String(raw.lineKey || returnLineKey(raw)).trim();
    if (key) inputByKey.set(key, raw);
  }
  const items = (Array.isArray(current.items) ? current.items : []).map((item) => {
    const key = String(item.lineKey || returnLineKey(item)).trim();
    const raw = inputByKey.get(key) || inputItems.find((x) => String(x.productCode || x.code || '').trim() === String(item.productCode || '').trim());
    const nextReturnQty = raw ? toNumber(raw.returnQty ?? raw.qtyReturn ?? raw.returnQuantity ?? raw.quantity ?? 0) : toNumber(item.returnQty ?? item.qtyReturn ?? item.quantity ?? 0);
    const soldQty = toNumber(item.soldQty ?? item.quantitySold ?? 0);
    if (nextReturnQty < 0) throw new Error('Số lượng trả không được âm');
    if (nextReturnQty > soldQty) throw new Error(`Số lượng trả ${item.productCode || item.productName} không được lớn hơn số lượng bán`);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0);
    return {
      ...item,
      returnQty: nextReturnQty,
      qtyReturn: nextReturnQty,
      returnQuantity: nextReturnQty,
      returnedQty: nextReturnQty,
      quantity: nextReturnQty,
      qty: nextReturnQty,
      returnAmount: Math.round(nextReturnQty * price),
      amount: Math.round(nextReturnQty * price),
      lineKey: key
    };
  });
  const summary = summarizeReturnDraftItems(items);
  const hasReturn = summary.totalReturnAmount > 0 || items.some((item) => toNumber(item.returnQty) > 0);
  const status = hasReturn ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.CANCELLED;
  const returnDate = resolveReturnDocumentDate(body, {}, current || {});
  const updated = {
    ...current,
    ...(hasReturn ? summary : { totalQuantity: 0, totalReturnAmount: 0, totalAmount: 0, amount: 0, debtReduction: 0 }),
    date: returnDate,
    deliveryDate: returnDate,
    documentDate: returnDate,
    items: hasReturn ? items : [],
    status,
    returnStatus: status,
    returnState: status,
    warehouseReceiveStatus: hasReturn ? RETURN_STATES.WAITING_RECEIVE : RETURN_STATES.CANCELLED,
    accountingStatus: hasReturn ? 'pending' : RETURN_STATES.CANCELLED,
    cancelReason: '',
    cancelledAt: '',
    clearedAt: hasReturn ? '' : dateUtil.nowIso(),
    note: hasReturn ? current.note : (body.note || 'Đã sửa hàng trả về 0'),
    updatedAt: dateUtil.nowIso()
  };
  await returnOrderRepository.upsert(updated, options);
  return { returnOrder: toClient(updated), cleared: !hasReturn };
}

module.exports = { listReturnOrders, createReturnOrder, createPendingReturnOrder, upsertDeliveryReturnOrder, buildCanonicalReturnCode, findExistingReturnOrderForSalesOrder, cancelDuplicateReturnOrders, confirmReceiveReturnOrder, confirmAccountingReturnOrder, ensureReturnDraftForSalesOrder, syncReturnDraftWithSalesOrder, cancelReturnDraftForSalesOrder, restoreReturnDraftForSalesOrder, attachMasterOrderToReturnDrafts, detachMasterOrderFromReturnDrafts, getReturnOrderBySalesOrderKey, updateReturnDraftItemsBySalesOrder, updateReturnDraftItems, cancelReturnOrderById, toClient };
