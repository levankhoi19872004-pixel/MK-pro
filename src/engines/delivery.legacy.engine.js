/* GENERATED FILE — edit src/engines/delivery.legacy.engine.source/part-01.jsfrag, src/engines/delivery.legacy.engine.source/part-02.jsfrag, src/engines/delivery.legacy.engine.source/part-03.jsfrag and run npm run build:source-bundles. */
'use strict';

const { toNumber, makeId } = require('../utils/common.util');
const deliveryFinance = require('../utils/deliveryFinance.util');
const dateUtil = require('../utils/date.util');
const { normalizeDebtAmount } = require('../constants/finance.constants');
const {
  SALES_STAFF_CODE_FIELDS,
  SALES_STAFF_NAME_FIELDS,
  DELIVERY_STAFF_CODE_FIELDS,
  DELIVERY_STAFF_NAME_FIELDS,
  USER_ACCOUNT_SALES_STAFF_CODE_FIELDS,
  USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS,
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName,
  pickUserAccountSalesStaffCode,
  pickUserAccountDeliveryStaffCode
} = require('../domain/staff/staffIdentity');
const { assertEngineReturnMutationAllowed } = require('../services/returns/DeliveryReturnMutationGuard');
const DefaultDeliveryPaymentStateReadService = require('../services/delivery/DeliveryPaymentStateReadService');
const canonicalFinancialReadConfig = require('../config/canonicalDeliveryFinancialRead.config');

function text(value) { return String(value == null ? '' : value).trim(); }
function lower(value) { return text(value).toLowerCase(); }
function unique(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }
function today() { return dateUtil.todayVN ? dateUtil.todayVN() : new Date().toISOString().slice(0, 10); }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function norm(value) { return lower(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim(); }
function compact(value) { return norm(value).replace(/[^a-z0-9]/g, ''); }
function truthy(value) { return ['1', 'true', 'yes', 'y'].includes(lower(value)); }
function isAccountingReopenPendingForPayment(order = {}) {
  const st = order && typeof order.status === 'object' ? order.status : {};
  const accountingStatus = lower(order.accountingStatus || st.accountingStatus);
  return Boolean(order.accountingNeedsReconfirm || order.needReAccounting || order.reAccountingRequired || order.adminAdjustmentOpen)
    || ['reopened', 'needs_reconfirm', 'needs_repost'].includes(accountingStatus);
}

function isAccountingConfirmedForPayment(order = {}) {
  if (!order || isAccountingReopenPendingForPayment(order)) return false;
  const st = order && typeof order.status === 'object' ? order.status : {};
  const accountingStatus = lower(order.accountingStatus || st.accountingStatus);
  return Boolean(order.accountingConfirmed || order.accountingLocked || order.editLocked)
    || ['confirmed', 'locked', 'posted', 'done'].includes(accountingStatus);
}

function escapeRegex(value) { return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cleanOrderCode(value) { return text(value).replace(/^RO[-_]?/i, ''); }
function prefixedReturnCode(value) { const clean = cleanOrderCode(value); return clean ? `RO-${clean}` : ''; }
function keyVariants(value) {
  const raw = text(value);
  const clean = cleanOrderCode(raw);
  return unique([raw, clean, prefixedReturnCode(raw)]);
}
function keyCompareVariants(value) {
  return unique(keyVariants(value).flatMap((item) => [item, compact(item), cleanOrderCode(item), compact(cleanOrderCode(item))]));
}
function returnOrderAmountFromItems(items = []) {
  return Math.round((Array.isArray(items) ? items : []).reduce((sum, item) => {
    const qty = returnQtyOf(item) || qtyOf(item);
    const price = priceOf(item);
    const computed = qty > 0 && price > 0 ? qty * price : toNumber(item.returnAmount ?? item.amount ?? 0);
    return sum + computed;
  }, 0));
}
function returnOrderQtyFromItems(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + (returnQtyOf(item) || qtyOf(item)), 0);
}
function hasPositiveReturnDocument(row = {}) {
  const items = Array.isArray(row.items) ? row.items : [];
  return returnOrderAmountFromItems(items) > 0 || toNumber(row.totalAmount ?? row.totalReturnAmount ?? row.returnAmount ?? row.amount ?? row.debtReduction) > 0;
}
function canonicalizeReturnDocument(row = {}) {
  const items = (Array.isArray(row.items) ? row.items : []).map((item) => {
    const qty = returnQtyOf(item) || qtyOf(item);
    const price = priceOf(item);
    const amount = Math.round(qty > 0 && price > 0 ? qty * price : toNumber(item.returnAmount ?? item.amount ?? 0));
    return {
      ...item,
      productCode: productCodeOf(item),
      code: productCodeOf(item),
      productName: productNameOf(item),
      name: productNameOf(item),
      returnQty: qty,
      qtyReturn: qty,
      returnQuantity: qty,
      returnedQty: qty,
      quantity: qty,
      qty,
      price,
      salePrice: price,
      unitPrice: price,
      returnAmount: amount,
      amount
    };
  }).filter((item) => item.productCode || item.productName || toNumber(item.returnQty) > 0);
  const itemAmount = returnOrderAmountFromItems(items);
  const totalAmount = itemAmount || Math.round(toNumber(row.totalAmount ?? row.totalReturnAmount ?? row.returnAmount ?? row.amount ?? row.debtReduction));
  const totalQuantity = returnOrderQtyFromItems(items) || toNumber(row.totalQuantity ?? row.quantity ?? row.qty);
  const id = text(row.id || row.code || row._id);
  const code = text(row.code || row.id || id);
  return {
    ...row,
    id,
    code,
    salesOrderId: text(row.salesOrderId || row.orderId || row.sourceOrderId || row.deliveryOrderId),
    salesOrderCode: text(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.deliveryOrderCode || cleanOrderCode(code)),
    orderId: text(row.orderId || row.salesOrderId || row.sourceOrderId || row.deliveryOrderId),
    orderCode: text(row.orderCode || row.salesOrderCode || row.sourceOrderCode || row.deliveryOrderCode || cleanOrderCode(code)),
    items,
    returnItems: items,
    totalQuantity,
    totalAmount,
    totalReturnAmount: totalAmount,
    amount: totalAmount,
    debtReduction: totalAmount
  };
}
function summarizeReturnRows(rows = []) {
  return rows.reduce((a, r) => {
    a.returnQty += toNumber(r.returnQty ?? r.totalQuantity);
    a.amount += toNumber(r.amount ?? r.totalAmount ?? r.debtReduction);
    return a;
  }, { returnQty: 0, amount: 0 });
}

function queryKeyword(query = {}, keys = []) {
  for (const key of keys) {
    const value = text(query[key]);
    if (value && !['all', 'tat ca', 'tất cả', '*'].includes(norm(value))) return value;
  }
  return '';
}

function staffValues(row = {}, fields = []) {
  return fields
    .flatMap((field) => {
      const value = row[field];
      if (Array.isArray(value)) return value;
      return [value];
    })
    .map(text)
    .filter(Boolean);
}

function matchesStaff(row = {}, keyword = '', fields = []) {
  const q = compact(keyword);
  const qText = norm(keyword);
  if (!q && !qText) return true;
  const values = staffValues(row, fields);
  return values.some((value) => {
    const valueCompact = compact(value);
    const valueText = norm(value);
    return (q && valueCompact.includes(q)) || (qText && valueText.includes(qText));
  });
}

const DELIVERY_STAFF_FIELDS = [
  'deliveryStaffCode',
  'deliveryStaffName',
  'deliveryCode',
  'deliveryName',
  'shipperCode',
  'shipperName',
  'nvghCode',
  'nvghName',
  'staffDeliveryCode',
  'staffDeliveryName'
];

const SALES_STAFF_FIELDS = [
  'salesStaffCode',
  'salesStaffName',
  'salesmanCode',
  'salesmanName',
  'staffCode',
  'staffName',
  'saleCode',
  'saleName',
  'nvbhCode',
  'nvbhName'
];

function applyStaffFilters(rows = [], query = {}) {
  const deliveryKeyword = queryKeyword(query, [
    'deliveryStaffCode',
    'deliveryStaffName',
    'deliveryStaff',
    'deliveryStaffKeyword',
    'deliveryCode',
    'deliveryName',
    'nvgh',
    'nvghCode',
    'nvghName'
  ]);
  const salesKeyword = queryKeyword(query, [
    'salesStaffCode',
    'salesStaffName',
    'salesStaff',
    'salesStaffKeyword',
    'salesCode',
    'salesName',
    'nvbh',
    'nvbhCode',
    'nvbhName'
  ]);

  return rows.filter((row) => {
    if (deliveryKeyword && !matchesStaff(row, deliveryKeyword, DELIVERY_STAFF_FIELDS)) return false;
    if (salesKeyword && !matchesStaff(row, salesKeyword, SALES_STAFF_FIELDS)) return false;
    return true;
  });
}

// DELIVERY_ORDERS_PERF_FILTER_START
function staffCodeVariantsForMongo(value) {
  const raw = text(value);
  if (!raw) return [];
  return unique([raw, raw.toLowerCase(), raw.toUpperCase()]);
}

function looksLikeStaffCode(value) {
  const raw = text(value);
  const c = compact(raw);
  return Boolean(c) && c.length <= 16 && !/\s/.test(raw);
}

function buildStaffMongoFilter(query = {}, type = '') {
  const keyword = type === 'delivery'
    ? queryKeyword(query, ['deliveryStaffCode', 'deliveryCode', 'nvghCode', 'staffDeliveryCode'])
    : queryKeyword(query, ['salesStaffCode', 'salesmanCode', 'salesCode', 'nvbhCode']);
  const nameKeyword = type === 'delivery'
    ? queryKeyword(query, ['deliveryStaffName', 'deliveryStaff', 'deliveryStaffKeyword', 'deliveryName', 'nvgh', 'nvghName'])
    : queryKeyword(query, ['salesStaffName', 'salesStaff', 'salesStaffKeyword', 'salesName', 'nvbh', 'nvbhName']);

  const codeValue = keyword || (looksLikeStaffCode(nameKeyword) ? nameKeyword : '');
  if (codeValue) {
    const values = staffCodeVariantsForMongo(codeValue);
    const fields = type === 'delivery'
      ? ['deliveryStaffCode', 'deliveryCode', 'shipperCode', 'nvghCode', 'staffDeliveryCode']
      : ['salesStaffCode', 'salesmanCode', 'saleCode', 'nvbhCode'];
    return { $or: fields.map((field) => ({ [field]: { $in: values } })) };
  }

  if (nameKeyword) {
    const rx = new RegExp(escapeRegex(nameKeyword), 'i');
    const fields = type === 'delivery'
      ? ['deliveryStaffName', 'deliveryName', 'shipperName', 'nvghName', 'staffDeliveryName']
      : ['salesStaffName', 'salesmanName', 'saleName', 'nvbhName'];
    return { $or: fields.map((field) => ({ [field]: rx })) };
  }

  return null;
}

function pushStaffMongoFilters(and = [], query = {}) {
  const deliveryFilter = buildStaffMongoFilter(query, 'delivery');
  const salesFilter = buildStaffMongoFilter(query, 'sales');
  if (deliveryFilter) and.push(deliveryFilter);
  if (salesFilter) and.push(salesFilter);
}
// DELIVERY_ORDERS_PERF_FILTER_END

const DELIVERY_ORDER_SELECT = [
  'id', 'code', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt', 'version',
  'customerId', 'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address', 'routeName',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'shipperCode', 'shipperName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed',
  'totalAmount', 'paidAmount', 'debtAmount', 'cashCollected', 'cashAmount', 'bankCollected', 'bankAmount', 'rewardAmount', 'returnAmount', 'returnedAmount',
  'items', 'note', 'masterOrderId', 'masterOrderCode', 'masterOrderNo', 'deliveryMasterId', 'deliveryMasterCode', 'mergeStatus'
].join(' ');

const DELIVERY_RETURN_SELECT = [
  'id', 'code', 'date', 'documentDate', 'returnDate', 'deliveryDate', 'createdAt', 'updatedAt',
  'salesOrderId', 'salesOrderCode', 'orderId', 'orderCode', 'sourceOrderId', 'sourceOrderCode', 'deliveryOrderId', 'deliveryOrderCode',
  'masterOrderId', 'masterOrderCode', 'masterReturnOrderId', 'masterReturnOrderCode',
  'customerCode', 'customerName', 'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'status', 'returnStatus', 'warehouseStatus', 'accountingStatus', 'returnMergeStatus',
  'items', 'returnItems', 'totalQuantity', 'quantity', 'qty', 'totalAmount', 'totalReturnAmount', 'amount', 'debtReduction', 'note'
].join(' ');

function directDeliveryCodeFromQuery(query = {}) {
  return queryKeyword(query, ['deliveryStaffCode', 'deliveryCode', 'nvghCode', 'staffDeliveryCode']);
}

function shouldTryFastDeliveryCodeQuery(query = {}) {
  return Boolean(directDeliveryCodeFromQuery(query)) && !query.salesStaffCode && !query.salesmanCode && !query.salesCode && !query.nvbhCode && !query.salesman;
}

// DELIVERY_MASTER_LINK_GUARD_START
function nonEmptyStringClause(field) {
  return { [field]: { $type: 'string', $gt: '' } };
}

function canonicalMasterAssignmentMongoClause() {
  return { $or: [nonEmptyStringClause('masterOrderId'), nonEmptyStringClause('masterOrderCode')] };
}

function legacyMasterAssignmentMongoClause() {
  return {
    $or: [
      nonEmptyStringClause('masterOrderNo'),
      nonEmptyStringClause('deliveryMasterId'),
      nonEmptyStringClause('deliveryMasterCode')
    ]
  };
}

function masterAssignmentMongoClause(options = {}) {
  return options.legacy ? legacyMasterAssignmentMongoClause() : canonicalMasterAssignmentMongoClause();
}
// DELIVERY_MASTER_LINK_GUARD_END

function orderIdOf(order = {}) { return text(order.id || order.orderId || order.salesOrderId || order._id); }
function orderCodeOf(order = {}) { return text(order.code || order.orderCode || order.salesOrderCode || order.displayOrderCode || order.id || order._id); }

// DELIVERY_DEDUP_SALES_ORDER_START
function canonicalDeliveryOrderKey(order = {}) {
  const businessCode = cleanOrderCode(order.salesOrderCode || order.orderCode || order.code || order.displayOrderCode);
  if (businessCode) return `code:${compact(businessCode)}`;
  const businessId = text(order.salesOrderId || order.orderId || order.id || order._id);
  return businessId ? `id:${businessId}` : '';
}

function statusScore(value) {
  const s = lower(value);
  if (['deleted', 'removed', 'void', 'cancelled', 'canceled'].includes(s)) return -1000;
  if (['delivered', 'completed', 'done'].includes(s)) return 80;
  if (['assigned', 'shipping', 'pending_delivery'].includes(s)) return 40;
  return 0;
}

function deliveryOrderCandidateScore(order = {}) {
  const st = order && typeof order.status === 'object' ? order.status : {};
  const updatedMs = Date.parse(order.updatedAt || order.modifiedAt || order.createdAt || '') || 0;
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  return statusScore(order.deletedAt ? 'deleted' : '')
    + statusScore(order.deliveryStatus || st.deliveryStatus || order.status)
    + (order.accountingConfirmed ? 20 : 0)
    + (order.stockPosted ? 10 : 0)
    + Math.min(itemCount, 50)
    + Math.min(Math.max(toNumber(order.totalAmount || order.amount || order.debtAmount), 0), 1000000000) / 1000000000
    + updatedMs / 100000000000000;
}

function dedupeDeliveryOrders(rows = []) {
  const byKey = new Map();
  const passthrough = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const key = canonicalDeliveryOrderKey(row);
    if (!key) {
      passthrough.push(row);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev || deliveryOrderCandidateScore(row) >= deliveryOrderCandidateScore(prev)) {
      byKey.set(key, row);
    }
  }
  return passthrough.concat(Array.from(byKey.values()));
}
// DELIVERY_DEDUP_SALES_ORDER_END
function productCodeOf(item = {}) { return text(item.productCode || item.code || item.productId || item.sku || item.id || item._id); }
function productNameOf(item = {}) { return text(item.productName || item.name || item.product || ''); }
function qtyOf(item = {}) { return toNumber(item.deliveredQty ?? item.soldQty ?? item.quantitySold ?? item.orderQty ?? item.totalQty ?? item.qtySold ?? item.quantity ?? item.qty ?? 0); }
function returnQtyOf(item = {}) { return toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantityReturn ?? 0); }
function priceOf(item = {}) { return toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0); }

function orderItemIndex(order = {}) {
  const map = new Map();
  for (const item of Array.isArray(order.items) ? order.items : []) {
    const code = productCodeOf(item);
    if (code && !map.has(code)) map.set(code, item);
  }
  return map;
}

function resolveReturnItemWithOrderLine(item = {}, orderLine = {}) {
  const productCode = productCodeOf(item) || productCodeOf(orderLine);
  const returnQty = returnQtyOf(item);
  const price = priceOf(item) || priceOf(orderLine);
  const productName = productNameOf(item) || productNameOf(orderLine);
  const returnAmount = Math.max(0, Math.round(returnQty * price));
  return {
    ...orderLine,
    ...item,
    productId: text(item.productId || orderLine.productId || productCode),
    productCode,
    code: productCode,
    productName,
    name: productName,
    returnQty,
    qtyReturn: returnQty,
    returnQuantity: returnQty,
    returnedQty: returnQty,
    price,
    salePrice: price,
    unitPrice: price,
    returnAmount,
    amount: returnAmount
  };
}

function activeReturnFilter() { return { status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] } }; }
function getReturnLifecycleService() {
  return require('../domain/lifecycle/ReturnLifecycleService');
}

function applyQuerySession(query, session) {
  if (session && query && typeof query.session === 'function') return query.session(session);
  return query;
}

function deliveryActorCodeOf(body = {}) {
  return text(body.actorDeliveryStaffCode || body.actorStaffCode || body.authenticatedStaffCode || '');
}

function isDeliveryOwnershipEnforced(body = {}) {
  return Boolean(body && body.enforceDeliveryOwnership);
}

function deliveryAssignedCodeOf(row = {}) {
  return text(
    row.deliveryStaffCode
    || row.deliveryCode
    || row.nvghCode
    || row.shipperCode
    || row.driverCode
    || row.staffDeliveryCode
  );
}

function deliveryOwnershipMatches(row = {}, body = {}) {
  if (!isDeliveryOwnershipEnforced(body)) return true;
  const actorCode = deliveryActorCodeOf(body);
  const assignedCode = deliveryAssignedCodeOf(row);
  return Boolean(actorCode && assignedCode && compact(assignedCode) === compact(actorCode));
}

function filterDeliveryOwnedRows(rows = [], body = {}) {
  if (!isDeliveryOwnershipEnforced(body)) return rows;
  return (Array.isArray(rows) ? rows : []).filter((row) => deliveryOwnershipMatches(row, body));
}

function assertDeliveryOwnership(order = {}, body = {}) {
  if (!isDeliveryOwnershipEnforced(body)) return;
  const actorCode = deliveryActorCodeOf(body);
  const assignedCode = deliveryAssignedCodeOf(order);

  if (!actorCode) {
    const err = new Error('Không xác định được mã nhân viên giao hàng đang đăng nhập');
    err.status = 403;
    err.code = 'DELIVERY_ACTOR_REQUIRED';
    throw err;
  }

  if (!assignedCode || compact(assignedCode) !== compact(actorCode)) {
    const err = new Error('Đơn giao hàng không thuộc nhân viên đang đăng nhập');
    err.status = 403;
    err.code = 'DELIVERY_ORDER_FORBIDDEN';
    throw err;
  }
}

function buildOrderLookup(value) {
  const key = text(value);
  if (!key) return null;
  const or = [{ id: key }, { code: key }, { orderCode: key }, { salesOrderId: key }, { salesOrderCode: key }];
  if (/^[a-f\d]{24}$/i.test(key)) or.push({ _id: key });
  return { $or: or };
}

function directOrderLookupCandidates(value) {
  const key = text(value);
  if (!key) return [];
  const candidates = [];
  const seen = new Set();
  const push = (filter) => {
    const signature = JSON.stringify(filter);
    if (!seen.has(signature)) {
      seen.add(signature);
      candidates.push(filter);
    }
  };

  if (/^SO[0-9A-Z_-]+$/i.test(key)) {
    push({ id: key });
    push({ code: key });
    push({ orderCode: key });
    push({ salesOrderId: key });
    push({ salesOrderCode: key });
    return candidates;
  }

  if (/^[a-f\d]{24}$/i.test(key)) push({ _id: key });
  push({ id: key });
  push({ code: key });
  push({ orderCode: key });
  push({ salesOrderId: key });
  push({ salesOrderCode: key });
  return candidates;
}

function versionedOrderFilter(key, current = {}) {
  const lookup = buildOrderLookup(key);
  const hasVersion = current.version !== undefined && current.version !== null && current.version !== '';
  const expectedVersion = hasVersion ? Number(current.version) : 0;
  const versionClause = hasVersion
    ? { version: expectedVersion }
    : { $or: [{ version: { $exists: false } }, { version: 0 }, { version: null }] };
  return { $and: [lookup, versionClause] };
}

function assertVersionedUpdate(updated) {
  if (updated) return updated;
  const err = new Error('Dữ liệu đơn đã thay đổi bởi thao tác khác. Vui lòng tải lại trước khi lưu.');
  err.status = 409;
  err.code = 'ORDER_VERSION_CONFLICT';
  throw err;
}

function returnMatchesOrder(ret = {}, order = {}) {
  const orderValues = unique([
    orderIdOf(order), order.salesOrderId, order.orderId, order.sourceOrderId, order.deliveryOrderId,
    orderCodeOf(order), order.salesOrderCode, order.orderCode, order.sourceOrderCode, order.deliveryOrderCode,
    order.id, order.code
  ]).flatMap(keyCompareVariants);
  const retValues = unique([
    ret.salesOrderId, ret.orderId, ret.sourceOrderId, ret.deliveryOrderId,
    ret.salesOrderCode, ret.orderCode, ret.sourceOrderCode, ret.deliveryOrderCode,
    ret.id, ret.code
  ]).flatMap(keyCompareVariants);
  const retSet = new Set(retValues);
  return orderValues.some((value) => retSet.has(value));
}

function normalizeReturnItemsFromOrders(returnOrders = []) {
  const byCode = new Map();
  for (const ret of returnOrders || []) {
    const status = lower(ret.status);
    if (['cancelled', 'canceled', 'void', 'deleted'].includes(status)) continue;
    for (const raw of Array.isArray(ret.items) ? ret.items : []) {
      const productCode = productCodeOf(raw);
      if (!productCode) continue;
      const prev = byCode.get(productCode) || {
        productCode,
        code: productCode,
        productName: productNameOf(raw),
        name: productNameOf(raw),
        returnQty: 0,
        qtyReturn: 0,
        returnQuantity: 0,
        returnedQty: 0,
        price: priceOf(raw),
        salePrice: priceOf(raw),
        unitPrice: priceOf(raw),
        returnAmount: 0,
        amount: 0
      };
      const qty = returnQtyOf(raw) || qtyOf(raw);
      const price = priceOf(raw) || prev.price || 0;
      prev.productName = prev.productName || productNameOf(raw);
      prev.name = prev.productName;
      prev.returnQty += qty;
      prev.qtyReturn = prev.returnQty;
      prev.returnQuantity = prev.returnQty;
      prev.returnedQty = prev.returnQty;
      prev.price = price;
      prev.salePrice = price;
      prev.unitPrice = price;
      prev.returnAmount = Math.round(prev.returnQty * price);
      prev.amount = prev.returnAmount;
      byCode.set(productCode, prev);
    }
  }
  return Array.from(byCode.values());
}


function flattenReturnOrderRows(ro = {}, order = {}) {
  const status = text(ro.status || ro.returnStatus || 'active');
  const base = {
    returnOrderId: text(ro.id || ro._id),
    returnOrderCode: text(ro.code || ro.id),
    salesOrderId: text(ro.salesOrderId || ro.orderId || order.salesOrderId || order.orderId),
    salesOrderCode: text(ro.salesOrderCode || ro.orderCode || order.salesOrderCode || order.orderCode),
    orderId: text(ro.orderId || ro.salesOrderId || order.orderId || order.salesOrderId),
    orderCode: text(ro.orderCode || ro.salesOrderCode || order.orderCode || order.salesOrderCode),
    customerCode: text(ro.customerCode || order.customerCode),
    customerName: text(ro.customerName || order.customerName),
    deliveryDate: text(ro.deliveryDate || ro.date || order.deliveryDate),
    status
  };
  const items = Array.isArray(ro.items) ? ro.items : [];
  if (!items.length) {
    return [{ ...base, productCode: '', productName: '', returnQty: 0, price: 0, amount: toNumber(ro.totalAmount || ro.amount || ro.totalReturnAmount || ro.debtReduction) }];
  }
  return items.map((item) => {
    const returnQty = returnQtyOf(item) || qtyOf(item);
    const price = priceOf(item);
    return {
      ...base,
      productCode: productCodeOf(item),
      productName: productNameOf(item),
      returnQty,
      price,
      amount: Math.round(returnQty > 0 && price > 0 ? returnQty * price : toNumber(item.returnAmount ?? item.amount ?? 0))
    };
  });
}

function buildCanonicalOrder(order = {}, relatedReturnOrders = [], financialState = null) {
  const returnItems = normalizeReturnItemsFromOrders(relatedReturnOrders);
  const returnAmount = returnItems.reduce((sum, item) => sum + toNumber(item.returnAmount || item.amount), 0);
/*masterOrderId:{$exists:true,$nin:[null, '']}*/
  const canonical = deliveryFinance.buildCanonicalDeliveryOrder(order, { returnItems, returnAmountOverride: returnAmount });
  const amounts = canonical.amounts || {};
  const legacyRow = {
    ...canonical,
    orderId: orderIdOf(order),
    orderCode: orderCodeOf(order),
    salesOrderId: text(order.salesOrderId || order.id || order._id),
    salesOrderCode: text(order.salesOrderCode || order.orderCode || order.code || orderCodeOf(order)),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    deliveryDate: text(order.deliveryDate || order.date || order.documentDate),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName),
    deliveryStaffCode: text(order.deliveryStaffCode),
    deliveryStaffName: text(order.deliveryStaffName),
    items: canonical.items,
    returnItems,
    returnOrders: relatedReturnOrders,
    amounts: {
      receivable: toNumber(amounts.receivable ?? amounts.totalReceivable),
      cash: toNumber(amounts.cash ?? amounts.cashAmount),
      bank: toNumber(amounts.bank ?? amounts.bankAmount),
      reward: toNumber(amounts.reward ?? amounts.rewardAmount),
      returnAmount: toNumber(amounts.returnAmount),
      processed: toNumber(amounts.processed),
      debt: normalizeDebtAmount(amounts.debt ?? amounts.debtAmount)
    },
    reconciliation: buildOrderReconciliation(amounts),
    status: {
      deliveryStatus: text(order.deliveryStatus || order.status || 'pending'),
      paymentStatus: normalizeDebtAmount(amounts.debt ?? amounts.debtAmount) <= 0 ? 'paid' : ((amounts.processed || 0) > 0 ? 'partial' : 'unpaid'),
      returnStatus: (amounts.returnAmount || 0) > 0 ? 'has_return' : 'none',
      accountingStatus: text(order.accountingStatus || '')
    }
  };
  if (!financialState || !financialState.financialContractVersion) return legacyRow;
  const canonicalRow = DefaultDeliveryPaymentStateReadService.applyDeliveryFinancialCompatibility(
    legacyRow,
    financialState,
    'delivery-app'
  );
  const canonicalAmounts = canonicalRow.amounts || {};
  return {
    ...canonicalRow,
    reconciliation: buildOrderReconciliation(canonicalAmounts),
    status: {
      ...legacyRow.status,
      paymentStatus: toNumber(financialState.openDebtAmount) <= 0
        ? 'paid'
        : (toNumber(financialState.totalHandledAmount) > 0 ? 'partial' : 'unpaid'),
      returnStatus: toNumber(financialState.returnAmount) > 0 ? 'has_return' : 'none'
    },
    paymentVersion: financialState.paymentVersion,
    paymentStateSource: financialState.paymentStateSource,
    returnStateSource: financialState.returnStateSource,
    financialContractVersion: financialState.financialContractVersion
  };
}

function buildOrderReconciliation(amounts = {}) {
  const receivable = toNumber(amounts.receivable ?? amounts.totalReceivable);
  const cash = toNumber(amounts.cash ?? amounts.cashAmount);
  const bank = toNumber(amounts.bank ?? amounts.bankAmount);
  const reward = toNumber(amounts.reward ?? amounts.rewardAmount);
  const offset = toNumber(amounts.offset ?? amounts.offsetAmount);
  const returnAmount = toNumber(amounts.returnAmount);
  const debt = normalizeDebtAmount(amounts.debt ?? amounts.debtAmount);
  const processed = cash + bank + reward + offset + returnAmount + debt;
  const difference = Math.round(receivable - processed);
  return {
    receivable,
    cash,
    bank,
    reward,
    offset,
    returnAmount,
    debt,
    processed,
    difference,
    balanced: Math.abs(difference) <= 1000,
    message: Math.abs(difference) <= 1000 ? 'Đối soát OK' : `Chênh lệch ${difference.toLocaleString('vi-VN')}`
  };
}

function summarizeOrders(rows = []) {
  return rows.reduce((acc, order) => {
    const a = order.amounts || {};
    acc.receivable += toNumber(a.receivable);
    acc.cash += toNumber(a.cash);
    acc.bank += toNumber(a.bank);
    acc.reward += toNumber(a.reward);
    acc.offset += toNumber(a.offset ?? a.offsetAmount);
    acc.returnAmount += toNumber(a.returnAmount);
    acc.debt += normalizeDebtAmount(a.debt);
    return acc;
  }, { receivable: 0, cash: 0, bank: 0, reward: 0, offset: 0, returnAmount: 0, debt: 0 });
}

function summarizeFinancialRowDiffs(legacyRows = [], canonicalRows = []) {
  const fields = ['receivable', 'cash', 'bank', 'reward', 'offset', 'returnAmount', 'debt'];
  const mismatchCounts = Object.fromEntries(fields.map((field) => [field, 0]));
  let mismatchedOrderCount = 0;
  const canonicalByKey = new Map((canonicalRows || []).map((row) => [text(row.orderId || row.orderCode), row]));
  for (const legacy of legacyRows || []) {
    const canonical = canonicalByKey.get(text(legacy.orderId || legacy.orderCode));
    if (!canonical) continue;
    let mismatched = false;
    for (const field of fields) {
      if (toNumber(legacy.amounts && legacy.amounts[field]) !== toNumber(canonical.amounts && canonical.amounts[field])) {
        mismatchCounts[field] += 1;
        mismatched = true;
      }
    }
    if (mismatched) mismatchedOrderCount += 1;
  }
  return { comparedOrderCount: Math.min(legacyRows.length, canonicalRows.length), mismatchedOrderCount, mismatchCounts };
}

const COMPLETED_DELIVERY_STATUSES = ['delivered', 'success', 'done', 'completed', 'accounting_confirmed'];
const DELIVERY_ALL = ['all', 'tat ca', 'tất cả', '*'];
const DELIVERY_DONE = COMPLETED_DELIVERY_STATUSES.concat(['da giao', 'đã giao']);
const DELIVERY_OPEN = ['open', 'processing', 'pending', 'assigned', 'not_delivered', 'not-delivered', 'chua giao', 'chưa giao'];
function deliveryStatusOf(row = {}) { const status = row.status && typeof row.status === 'object' ? row.status : {}; return lower(status.deliveryStatus || row.deliveryStatus || row.status || 'pending'); }
function isDeliveredOrder(row = {}) { return COMPLETED_DELIVERY_STATUSES.includes(deliveryStatusOf(row)); }
function queryDeliveryStatus(query = {}, includeDirect = false) {
  const keys = includeDirect ? ['statusFilter', 'deliveryStatusFilter', 'orderStatusFilter', 'status', 'deliveryStatus'] : ['statusFilter', 'deliveryStatusFilter', 'orderStatusFilter'];
  for (const key of keys) { const value = text(query[key]); if (value) return lower(value); }
  return '';
}
function wantsCompletedDeliveryOrders(query = {}) {
  const status = queryDeliveryStatus(query, true);
  return truthy(query.includeCompleted) || truthy(query.showCompleted) || truthy(query.includeDelivered) || DELIVERY_ALL.includes(status) || DELIVERY_DONE.includes(status);
}
function shouldExcludeCompletedDeliveryOrders(query = {}) { return !wantsCompletedDeliveryOrders(query); }
function openStatusMongoClause(field) { return { $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }, { [field]: { $nin: COMPLETED_DELIVERY_STATUSES } }] }; }

function applyDeliveryStatusFilter(rows = [], query = {}) {
  const statusFilter = queryDeliveryStatus(query) || queryDeliveryStatus(query, true);
  let filteredRows = rows;
  if (shouldExcludeCompletedDeliveryOrders(query)) filteredRows = filteredRows.filter((row) => !isDeliveredOrder(row));
  if (!statusFilter || DELIVERY_ALL.includes(statusFilter)) return filteredRows;
  if (DELIVERY_DONE.includes(statusFilter)) return rows.filter(isDeliveredOrder);
  if (DELIVERY_OPEN.includes(statusFilter)) return rows.filter((row) => !isDeliveredOrder(row));
  if (['return', 'returns', 'has_return', 'tra hang', 'trả hàng'].includes(statusFilter)) {
    return rows.filter((row) => toNumber(row.amounts && row.amounts.returnAmount) > 0 || toNumber(row.returnAmount || row.returnTotal || row.totalReturnAmount) > 0);
  }
  if (['debt', 'cong no', 'công nợ'].includes(statusFilter)) {
    return rows.filter((row) => normalizeDebtAmount((row.amounts && row.amounts.debt) ?? row.debtAmount ?? row.debt) > 0);
  }
  return rows;
}

class DeliveryEngine {
  constructor(models = {}) {
    this.SalesOrder = models.SalesOrder;
    this.MasterOrder = models.MasterOrder;
    this.ReturnOrder = models.ReturnOrder;
    this.OrderPaymentAllocation = models.OrderPaymentAllocation;
    this.DeliveryCloseoutVersion = models.DeliveryCloseoutVersion;
    this.DeliveryPaymentStateReadService = models.DeliveryPaymentStateReadService || DefaultDeliveryPaymentStateReadService;
    this.StockTransaction = models.StockTransaction;
    this.ArLedger = models.ArLedger;
    this.User = models.User;
  }


  staffCodeOf(user = {}, type = 'sales') {
    return type === 'delivery'
      ? text(pickDeliveryStaffCode(user) || pickUserAccountDeliveryStaffCode(user))
      : text(pickSalesStaffCode(user) || pickUserAccountSalesStaffCode(user));
  }

  staffNameOf(user = {}, type = 'sales') {
    return type === 'delivery'
      ? text(pickDeliveryStaffName(user))
      : text(pickSalesStaffName(user));
  }

  staffRoleOk(user = {}, type = '') {
    const roleText = norm([user.role, user.type, user.position, user.department, user.roleLabel].filter(Boolean).join(' '));
    const boolOk = type === 'delivery'
      ? Boolean(user.isDelivery || user.isDeliveryStaff || user.deliveryStaff)
      : Boolean(user.isSalesman || user.isSalesStaff || user.salesStaff);
    if (boolOk) return true;
    if (type === 'delivery') return ['delivery', 'shipper', 'nvgh', 'giao hang', 'giaohang'].some((key) => roleText.includes(norm(key)));
    return ['sales', 'sale', 'nvbh', 'ban hang', 'banhang', 'salesman'].some((key) => roleText.includes(norm(key)));
  }

  orderStaffCode(order = {}, type = '') {
    if (type === 'delivery') return text(order.deliveryStaffCode || order.shipperCode || order.driverCode || order.staffDeliveryCode);
    return text(order.salesStaffCode || order.salesmanCode || order.nvbhCode || order.saleCode || order.sellerCode);
  }

  orderStaffName(order = {}, type = '') {
    if (type === 'delivery') return text(order.deliveryStaffName || order.shipperName || order.driverName || order.staffDeliveryName);
    return text(order.salesStaffName || order.salesmanName || order.nvbhName || order.saleName || order.sellerName);
  }

  async buildStaffSystemIndex(orders = []) {
    const empty = { byCode: new Map(), byName: new Map() };
    if (!this.User || !orders.length) return empty;
    const keys = unique(orders.flatMap((order) => [
      this.orderStaffCode(order, 'sales'),
      this.orderStaffName(order, 'sales'),
      this.orderStaffCode(order, 'delivery'),
      this.orderStaffName(order, 'delivery')
    ])).filter(Boolean);
    if (!keys.length) return empty;
    const regexes = keys.map((key) => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
    const users = await this.User.find({
      isActive: { $ne: false },
      $or: [
        ...USER_ACCOUNT_SALES_STAFF_CODE_FIELDS.map((field) => ({ [field]: { $in: regexes } })),
        ...USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS.map((field) => ({ [field]: { $in: regexes } })),
        ...SALES_STAFF_NAME_FIELDS.map((field) => ({ [field]: { $in: regexes } })),
        ...DELIVERY_STAFF_NAME_FIELDS.map((field) => ({ [field]: { $in: regexes } }))
      ]
    }).select('id code staffCode employeeCode salesStaffCode salesStaffName salesmanCode salesmanName deliveryStaffCode deliveryStaffName shipperCode shipperName maNhanVien name fullName role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive').lean().catch(() => []);
    const byCode = new Map();
    const byName = new Map();
    for (const user of users || []) {
      const salesCode = this.staffCodeOf(user, 'sales');
      const deliveryCode = this.staffCodeOf(user, 'delivery');
      const salesName = this.staffNameOf(user, 'sales');
      const deliveryName = this.staffNameOf(user, 'delivery');
      const codeKeys = unique([salesCode, deliveryCode]).map(compact).filter(Boolean);
      const nameKeys = unique([salesName, deliveryName]).map(norm).filter(Boolean);
      for (const key of codeKeys) byCode.set(key, user);
      for (const key of nameKeys) byName.set(key, user);
    }
    return { byCode, byName };
  }

  verifyAssignedStaff(order = {}, staffIndex = { byCode: new Map(), byName: new Map() }, type = '') {
    const assignedCode = this.orderStaffCode(order, type);
    const assignedName = this.orderStaffName(order, type);
    const label = type === 'delivery' ? 'NVGH' : 'NVBH';
    let systemUser = assignedCode ? staffIndex.byCode.get(compact(assignedCode)) : null;
    if (!systemUser && assignedName) systemUser = staffIndex.byName.get(norm(assignedName));
    const systemCode = systemUser ? this.staffCodeOf(systemUser, type) : '';
    const systemName = systemUser ? this.staffNameOf(systemUser, type) : '';
    const codeMatches = Boolean(systemUser && assignedCode && compact(systemCode) === compact(assignedCode));
    const nameMatches = Boolean(systemUser && assignedName && norm(systemName) === norm(assignedName));
    const roleOk = Boolean(systemUser && this.staffRoleOk(systemUser, type));
    const ok = Boolean(systemUser && roleOk && (codeMatches || (!assignedCode && nameMatches)));
    let message = `${label} đúng mã hệ thống`;
    if (!assignedCode && !assignedName) message = `Thiếu ${label}`;
    else if (!systemUser) message = `${label} không tồn tại trong mục Tài khoản/Hệ thống`;
    else if (!roleOk) message = `${label} có mã hệ thống nhưng sai vai trò`;
    else if (!codeMatches && assignedCode) message = `${label} không khớp mã hệ thống`;
    return {
      type,
      label,
      ok,
      exists: Boolean(systemUser),
      roleOk,
      codeMatches,
      nameMatches,
      assignedCode,
      assignedName,
      systemCode,
      systemName,
      message
    };
  }

  async enrichStaffAssignment(rows = []) {
    const staffIndex = await this.buildStaffSystemIndex(rows);
    return rows.map((row) => {
      const sales = this.verifyAssignedStaff(row, staffIndex, 'sales');
      const delivery = this.verifyAssignedStaff(row, staffIndex, 'delivery');
      const ok = sales.ok && delivery.ok;
      return {
        ...row,
        staffAssignment: { ok, sales, delivery },
        staffAssignmentStatus: ok ? 'valid' : 'warning',
        staffAssignmentMessage: ok ? 'Đơn đã gán đúng NVBH/NVGH theo mã hệ thống' : [sales, delivery].filter((item) => !item.ok).map((item) => item.message).join('; ')
      };
    });
  }


  async execSalesOrderFind(filter = {}, { select = DELIVERY_ORDER_SELECT, sort = {}, limit = 1000 } = {}) {
    let query = this.SalesOrder.find(filter);

    if (query && typeof query.select === 'function') {
      query = query.select(select);
    }

    if (query && typeof query.sort === 'function') {
      query = query.sort(sort);
    }

    if (query && typeof query.limit === 'function') {
      query = query.limit(limit);
    }

    if (query && typeof query.lean === 'function') {
      return query.lean();
    }

    return query;
  }

  async resolveSalesOrderByKnownCode(key, options = {}) {
    const candidates = directOrderLookupCandidates(key);
    for (const filter of candidates) {
      let query = this.SalesOrder.findOne(filter);
      query = applyQuerySession(query, options.session);
      if (query && typeof query.select === 'function') query = query.select(DELIVERY_ORDER_SELECT);
      const order = query && typeof query.lean === 'function' ? await query.lean() : await query;
      if (order) return order;
    }

    const fallbackLookup = buildOrderLookup(key);
    if (!fallbackLookup) return null;
    let query = this.SalesOrder.findOne(fallbackLookup);
    query = applyQuerySession(query, options.session);
    if (query && typeof query.select === 'function') query = query.select(DELIVERY_ORDER_SELECT);
    return query && typeof query.lean === 'function' ? query.lean() : query;
  }

  async findOrders(query = {}) {
    const date = text(query.date || query.deliveryDate || today());
    const status = norm(query.status || query.deliveryStatus);
    const q = norm(query.q || query.keyword);

    const makeBaseFilter = () => {
      const filter = {};
      if (date) filter.deliveryDate = date;
      if (status && !['all', 'tat ca', 'tất cả', '*'].includes(status)) {
        filter.deliveryStatus = text(query.status || query.deliveryStatus);
      }
      if (!truthy(query.includeInactive) && !truthy(query.showInactive)) {
        filter.status = { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] };
      }
      return filter;
    };

    const applyKeywordToAnd = (and = []) => {
      if (!q) return;
      const rx = new RegExp(escapeRegex(query.q || query.keyword), 'i');
      and.push({ $or: [
        { code: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { customerCode: rx },
        { customerName: rx }
      ] });
    };

    let orders = [];
    const requestedLimit = Math.min(1000, Math.max(1, Number(query.limit || 1000)));

    const scopedSalesOrderLookup = async (linkClause, { fast = false } = {}) => {
      const filter = makeBaseFilter();
      const and = [linkClause];
      if (fast) {
        const deliveryCode = directDeliveryCodeFromQuery(query);
        and.push({ deliveryStaffCode: { $in: staffCodeVariantsForMongo(deliveryCode) } });
      } else {
        pushStaffMongoFilters(and, query);
      }
      if (shouldExcludeCompletedDeliveryOrders(query)) {
        and.push(openStatusMongoClause('deliveryStatus'));
        and.push(openStatusMongoClause('status'));
      }
      applyKeywordToAnd(and);
      filter.$and = and;
      return this.execSalesOrderFind(filter, {
        sort: fast
          ? { deliveryDate: -1, deliveryStaffCode: 1, customerName: 1, code: 1 }
          : { deliveryStaffCode: 1, customerName: 1, code: 1 },
        limit: fast ? Math.min(300, requestedLimit) : requestedLimit
      });
    };

    // Fast path cho app giao hàng: token đã bind deliveryStaffCode chính xác.
    // Phase36B: dùng field masterOrderId/masterOrderCode chuẩn trước, legacy chỉ fallback đã được scope ngày/NVGH.
    if (shouldTryFastDeliveryCodeQuery(query)) {
      orders = await scopedSalesOrderLookup(masterAssignmentMongoClause(), { fast: true });
      if (!orders.length) {
        orders = await scopedSalesOrderLookup(masterAssignmentMongoClause({ legacy: true }), { fast: true });
      }
    }

    if (!orders.length) {
      orders = await scopedSalesOrderLookup(masterAssignmentMongoClause());
      if (!orders.length) {
        orders = await scopedSalesOrderLookup(masterAssignmentMongoClause({ legacy: true }));
      }
    }

    if (!orders.length && date && this.MasterOrder) {
      const masters = await this.MasterOrder.find({ deliveryDate: date })
        .select('id code deliveryDate deliveryStaffCode deliveryStaffName childOrderIds children')
        .lean();
      const filteredMasters = applyStaffFilters(masters, query);
      const childIds = unique(filteredMasters.flatMap((m) => Array.isArray(m.childOrderIds) ? m.childOrderIds : []));
      if (childIds.length) {
        orders = await this.execSalesOrderFind(
          { $or: [{ id: { $in: childIds } }, { code: { $in: childIds } }] },
          { limit: 1000 }
        );
      }
    }

    orders = applyStaffFilters(orders, query);

    if (q) {
      orders = orders.filter((o) => [
        o.code,
        o.orderCode,
        o.salesOrderCode,
        o.customerCode,
        o.customerName,
        o.salesStaffCode,
        o.salesStaffName,
        o.staffCode,
        o.staffName,
        o.deliveryStaffCode,
        o.deliveryStaffName
      ].some((v) => norm(v).includes(q)));
    }

    return dedupeDeliveryOrders(orders);
  }


  async findReturnOrdersFor(orders = [], options = {}) {
    const ids = unique(orders.flatMap((o) => [orderIdOf(o), o.id, o._id, o.salesOrderId, o.orderId, o.sourceOrderId, o.deliveryOrderId]));
    const codes = unique(orders.flatMap((o) => [orderCodeOf(o), o.code, o.orderCode, o.salesOrderCode, o.sourceOrderCode, o.deliveryOrderCode]));
    const idVariants = unique(ids.flatMap(keyVariants));
    const codeVariants = unique(codes.flatMap(keyVariants));
    const or = [];
    if (idVariants.length) {
      or.push(
        { salesOrderId: { $in: idVariants } }, { orderId: { $in: idVariants } },
        { sourceOrderId: { $in: idVariants } }, { deliveryOrderId: { $in: idVariants } },
        { id: { $in: idVariants } }
      );
    }
    if (codeVariants.length) {
      or.push(
        { salesOrderCode: { $in: codeVariants } }, { orderCode: { $in: codeVariants } },
        { sourceOrderCode: { $in: codeVariants } }, { deliveryOrderCode: { $in: codeVariants } },
        { code: { $in: codeVariants } }, { id: { $in: codeVariants } }
      );
    }
    if (!or.length) return [];
    let query = this.ReturnOrder.find({ ...activeReturnFilter(), $or: or });
    query = applyQuerySession(query, options.session);
    if (query && typeof query.select === 'function') query = query.select(DELIVERY_RETURN_SELECT);
    const docs = await query.lean();
    return docs.map(canonicalizeReturnDocument).filter(hasPositiveReturnDocument);
  }

  async getCanonicalOrderByKey(key, options = {}) {
    const order = await this.resolveSalesOrderByKnownCode(key, options);
    if (!order) return null;
    const returns = await this.findReturnOrdersFor([order], options);
    return buildCanonicalOrder(order, returns.filter((ret) => returnMatchesOrder(ret, order)));
  }

  async listOrders(query = {}) {
    const options = arguments[1] || {};
    const financialReadMode = canonicalFinancialReadConfig.getCanonicalDeliveryFinancialReadMode(options);
    const shadowSampleRate = canonicalFinancialReadConfig.getShadowSampleRate(options);
    const canonicalComputationEnabled = canonicalFinancialReadConfig.shouldComputeCanonicalRead(financialReadMode, {
      ...options,
      shadowSampleRate
    });
    const shadowSampled = financialReadMode === canonicalFinancialReadConfig.MODES.SHADOW
      ? canonicalComputationEnabled
      : null;
    const orders = dedupeDeliveryOrders(await this.findOrders(query));
    let rows;
    let shadowDiffSummary = null;
    if (!canonicalComputationEnabled) {
      const returns = await this.findReturnOrdersFor(orders);
      rows = orders.map((order) => buildCanonicalOrder(order, returns.filter((ret) => returnMatchesOrder(ret, order))));
    } else {
      const financialResult = await this.DeliveryPaymentStateReadService.resolvePaymentStatesForOrders(orders, {
        models: {
          OrderPaymentAllocation: this.OrderPaymentAllocation,
          DeliveryCloseoutVersion: this.DeliveryCloseoutVersion,
          ReturnOrder: this.ReturnOrder
        },
        includeReturnState: true
      });
      const returnRowsFor = (order) => this.DeliveryPaymentStateReadService
        .returnRowsForOrder(order, financialResult.returnResult)
        .map(canonicalizeReturnDocument)
        .filter(hasPositiveReturnDocument);
      const legacyRows = orders.map((order) => buildCanonicalOrder(order, returnRowsFor(order)));
      const canonicalRows = orders.map((order) => buildCanonicalOrder(
        order,
        returnRowsFor(order),
        this.DeliveryPaymentStateReadService.stateForOrder(order, financialResult.statesByIdentity)
      ));
      shadowDiffSummary = summarizeFinancialRowDiffs(legacyRows, canonicalRows);
      rows = canonicalFinancialReadConfig.isCanonicalResponseEnabled(financialReadMode) ? canonicalRows : legacyRows;
    }
    rows = dedupeDeliveryOrders(applyDeliveryStatusFilter(rows, query));
    if (truthy(query.checkStaffAssignment) || truthy(query.checkStaff) || truthy(query.staffCheck)) {
      rows = await this.enrichStaffAssignment(rows);
    }
    return {
      rows,
      summary: summarizeOrders(rows),
      reconciliation: this.reconcileRows(rows),
      financialReadMode,
      financialContractVersion: DefaultDeliveryPaymentStateReadService.FINANCIAL_CONTRACT_VERSION,
      shadowSampleRate,
      shadowSampled,
      shadowDiffSummary
    };
  }

  normalizeReturnItems(sourceItems = [], order = {}) {
    const soldByCode = orderItemIndex(order);
    return (Array.isArray(sourceItems) ? sourceItems : [])
      .map((item) => {
        const productCode = productCodeOf(item);
        const orderLine = soldByCode.get(productCode) || {};
        return resolveReturnItemWithOrderLine(item, orderLine);
      })
      .filter((item) => item.productCode && item.returnQty > 0);
  }

  async saveReturn(body = {}) {
    const options = arguments[1] || {};
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const order = await this.resolveSalesOrderByKnownCode(key, options);
    if (!order) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }
    assertDeliveryOwnership(order, body);

    await assertEngineReturnMutationAllowed(this, order, body, options, returnMatchesOrder);

    const items = this.normalizeReturnItems(body.items, order);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.returnAmount || item.amount), 0);
    const stableId = `RO-${orderCodeOf(order).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const patch = {
      id: stableId,
      code: stableId,
      salesOrderId: orderIdOf(order),
      salesOrderCode: orderCodeOf(order),
      orderId: orderIdOf(order),
      orderCode: orderCodeOf(order),
      customerId: text(order.customerId),
      customerCode: text(order.customerCode),
      customerName: text(order.customerName),
      deliveryDate: text(order.deliveryDate || body.deliveryDate || today()),
      date: text(body.date || order.deliveryDate || today()),
      documentDate: text(body.documentDate || body.date || order.deliveryDate || today()),
      // ===== SCOPED FIX: ORDER_DATA_LINEAGE_ENGINE_RETURN_SNAPSHOT_STAFF_START =====
      deliveryStaffCode: text(order.deliveryStaffCode || body.deliveryStaffCode),
      deliveryStaffName: text(order.deliveryStaffName || body.deliveryStaffName),
      salesStaffCode: text(order.salesStaffCode || order.salesmanCode || body.salesStaffCode),
      salesStaffName: text(order.salesStaffName || order.salesmanName || body.salesStaffName),
      salesmanCode: text(order.salesmanCode || order.salesStaffCode || body.salesmanCode),
      salesmanName: text(order.salesmanName || order.salesStaffName || body.salesmanName),
      staffCode: text(order.deliveryStaffCode || body.deliveryStaffCode),
      staffName: text(order.deliveryStaffName || body.deliveryStaffName),
      // ===== SCOPED FIX: ORDER_DATA_LINEAGE_ENGINE_RETURN_SNAPSHOT_STAFF_END =====
      source: 'canonical_delivery_engine',
      refType: items.length ? 'canonicalDeliveryReturn' : 'canonicalDeliveryReturnClear',
      returnType: text(body.returnType || 'partial') || 'partial',
      returnStatus: items.length ? 'waiting_receive' : 'cancelled',
      status: items.length ? 'waiting_receive' : 'cancelled',
      accountingConfirmed: false,
      accountingStatus: items.length ? 'pending' : 'cancelled',
      items,
      totalQuantity: items.reduce((sum, item) => sum + toNumber(item.returnQty), 0),
      totalAmount,
      totalReturnAmount: totalAmount,
      amount: totalAmount,
      debtReduction: totalAmount,
      note: text(body.note) || (items.length ? 'Cập nhật hàng trả từ DeliveryEngine' : 'Xóa hàng trả về 0 từ DeliveryEngine'),
      updatedAt: new Date().toISOString(),
      clearedAt: items.length ? '' : new Date().toISOString()
    };

    const result = options.session
      ? await getReturnLifecycleService().createPendingReturn(patch, options)
      : await getReturnLifecycleService().createPendingReturn(patch);
    if (result && result.error) {
      const err = new Error(result.error);
      err.status = result.status || 400;
      throw err;
    }
    const returnOrder = (result && result.returnOrder) || result;

    // V46 rule: returnOrders is the single source of truth for return goods.
    // Do not mirror returnAmount/returnItems into salesOrders. All delivery views must reload/overlay from returnOrders.
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(order), options);
    const returnRows = flattenReturnOrderRows(returnOrder, canonical || order);
    return {
      order: canonical,
      returnOrder,
      returns: returnRows,
      returnOrders: returnRows,
      rows: returnRows,
      message: items.length ? 'Đã lưu hàng trả' : 'Đã xóa hàng trả về 0'
    };
  }
  async savePayment(body = {}, options = {}) {
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const current = await this.getCanonicalOrderByKey(key, options);
    if (!current) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }
    assertDeliveryOwnership(current, body);
    // MK-SCOPED-FIX: PAYMENT_REACCOUNTING_GUARD_START
    // Chỉ khoanh vùng nghiệp vụ lưu thu tiền app giao hàng.
    // Đã xác nhận kế toán thì không cho sửa, trừ khi admin đã mở khóa/reopen.
    const accountingConfirmed = isAccountingConfirmedForPayment(current);
    const accountingReopened = isAccountingReopenPendingForPayment(current);
    if (accountingConfirmed && !accountingReopened) {
      const err = new Error('Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền');
      err.status = 423;
      throw err;
    }
    // MK-SCOPED-FIX: PAYMENT_REACCOUNTING_GUARD_END

    const cashAmount = Math.max(0, num(body.cashAmount ?? body.cashCollected));
    const bankAmount = Math.max(0, num(body.bankAmount ?? body.bankCollected ?? body.transferAmount));
    const rewardAmount = Math.max(0, num(body.rewardAmount ?? body.bonusAmount));
    const returnAmount = toNumber(current.amounts && current.amounts.returnAmount);
    const receivable = toNumber(current.amounts && current.amounts.receivable);
    const paidByCurrentRequest = cashAmount + bankAmount + rewardAmount + returnAmount;
    if (paidByCurrentRequest - receivable > 1000) {
      const err = new Error(`Tổng thu/trả (${paidByCurrentRequest.toLocaleString('vi-VN')}) vượt phải thu (${receivable.toLocaleString('vi-VN')})`);
      err.status = 400;
      throw err;
    }

    const allocation = {
      type: 'delivery_collection',
      source: 'DeliveryEngine',
      date: text(body.date || today()),
      cashAmount,
      bankAmount,
      rewardAmount,
      returnAmount,
      amount: cashAmount + bankAmount + rewardAmount,
      salesOrderId: current.salesOrderId,
      salesOrderCode: current.salesOrderCode,
      orderId: current.orderId,
      orderCode: current.orderCode,
      deliveryStaffCode: text(body.deliveryStaffCode || current.deliveryStaffCode),
      deliveryStaffName: text(body.deliveryStaffName || current.deliveryStaffName),
      createdAt: new Date().toISOString()
    };

    const patch = {
      deliveryPayment: allocation,
      paymentAllocations: [allocation],
      deliveryPaymentSource: 'DeliveryEngine',
      // Legacy mirrors kept for old reports only. Canonical reads still go through DeliveryEngine.
      cashCollected: cashAmount,
      cashAmount,
      bankCollected: bankAmount,
      bankAmount,
      transferAmount: bankAmount,
      rewardAmount,
      displayRewardAmount: rewardAmount,
      paidAmount: cashAmount + bankAmount,
      collectedAmount: cashAmount + bankAmount,
      // MK-SCOPED-FIX: PAYMENT_REACCOUNTING_STATUS_START
      // Sau khi admin mở khóa và nhân viên lưu lại tiền, bắt buộc kế toán xác nhận lại
      // để service kế toán đảo AR cũ và post AR mới.
      ...(accountingReopened ? {
        accountingConfirmed: false,
        accountingLocked: false,
        editLocked: false,
        accountingNeedsReconfirm: true,
        needReAccounting: true,
        reAccountingRequired: true,
        adminAdjustmentOpen: true,
        accountingStatus: 'needs_reconfirm',
        arStatus: 'needs_reconfirm',
        lifecycleStatus: 'needs_reconfirm',
        financialSyncStatus: 'needs_reconfirm',
        arPostedAt: ''
      } : {
        accountingStatus: current.accountingStatus || 'pending_accounting'
      }),
      // MK-SCOPED-FIX: PAYMENT_REACCOUNTING_STATUS_END
      updatedAt: new Date().toISOString()
    };
    const updated = assertVersionedUpdate(await this.SalesOrder.findOneAndUpdate(
      versionedOrderFilter(key, current),
      { $set: patch, $inc: { version: 1 } },
      { new: true, lean: true, session: options.session }
    ));
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(updated), options);
    return { order: canonical, allocation, message: 'Đã lưu thu tiền' };
  }

  async confirm(body = {}, options = {}) {
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const current = await this.getCanonicalOrderByKey(key, options);
    if (!current) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }
    assertDeliveryOwnership(current, body);
    if (current.reconciliation && !current.reconciliation.balanced) {
      const err = new Error(current.reconciliation.message || 'Đơn chưa cân đối, không thể xác nhận giao');
      err.status = 400;
      throw err;
    }
    const deliveryStatus = text(body.deliveryStatus || body.status || 'delivered');
    const isDelivered = ['delivered', 'success', 'done', 'completed'].includes(lower(deliveryStatus));
    const patch = {
      deliveryStatus: isDelivered ? 'delivered' : deliveryStatus,
      status: isDelivered ? 'delivered' : deliveryStatus,
      deliveryStaffCode: text(body.deliveryStaffCode || current.deliveryStaffCode),
      deliveryStaffName: text(body.deliveryStaffName || current.deliveryStaffName),
      staffCode: text(body.deliveryStaffCode || current.deliveryStaffCode),
      staffName: text(body.deliveryStaffName || current.deliveryStaffName),
      deliveryNote: text(body.note || body.deliveryNote),
      deliveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = assertVersionedUpdate(await this.SalesOrder.findOneAndUpdate(
      versionedOrderFilter(key, current),
      { $set: patch, $inc: { version: 1 } },
      { new: true, lean: true, session: options.session }
    ));
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(updated), options);
    return { order: canonical, message: 'Đã xác nhận giao hàng' };
  }

  reconcileRows(rows = []) {
    const summary = summarizeOrders(rows);
    const difference = Math.round(summary.receivable - summary.cash - summary.bank - summary.reward - summary.returnAmount - summary.debt);
    return {
      ...summary,
      difference,
      balanced: Math.abs(difference) <= 1000,
      message: Math.abs(difference) <= 1000 ? 'Đối soát OK' : `Chênh lệch ${difference.toLocaleString('vi-VN')}`
    };
  }

  async listReturnDocuments(query = {}) {
    const filter = { ...activeReturnFilter() };
    const and = [];
    const dateFrom = text(query.dateFrom || query.fromDate || query.from || (query.dateMode === 'today' ? (query.date || today()) : ''));
    const dateTo = text(query.dateTo || query.toDate || query.to || (query.dateMode === 'today' ? (query.date || today()) : ''));
    if (dateFrom || dateTo) {
      const range = {};
      if (dateFrom) range.$gte = dateFrom;
      if (dateTo) range.$lte = dateTo;
      and.push({ $or: [{ date: range }, { documentDate: range }, { deliveryDate: range }, { returnDate: range }] });
    }

    const directKeys = unique([query.salesOrderId, query.orderId, query.salesOrderCode, query.orderCode, query.orderKey, query.code, query.id]);
    if (directKeys.length) {
      const values = unique(directKeys.flatMap(keyVariants));
      and.push({ $or: [
        { salesOrderId: { $in: values } }, { orderId: { $in: values } },
        { sourceOrderId: { $in: values } }, { deliveryOrderId: { $in: values } },
        { salesOrderCode: { $in: values } }, { orderCode: { $in: values } },
        { sourceOrderCode: { $in: values } }, { deliveryOrderCode: { $in: values } },
        { id: { $in: values } }, { code: { $in: values } }
      ] });
    }

    if (query.masterOrderId) filter.masterOrderId = text(query.masterOrderId);
    if (query.masterOrderCode) filter.masterOrderCode = text(query.masterOrderCode);
    if (query.customerCode) filter.customerCode = text(query.customerCode);
    if (query.deliveryStaffCode || query.deliveryCode || query.nvghCode || query.delivery) {
      const rx = new RegExp(escapeRegex(query.deliveryStaffCode || query.deliveryCode || query.nvghCode || query.delivery), 'i');
      and.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }, { deliveryCode: rx }, { deliveryName: rx }, { nvghCode: rx }, { nvghName: rx }] });
    }
    if (query.salesStaffCode || query.salesmanCode || query.nvbhCode || query.salesman) {
      const rx = new RegExp(escapeRegex(query.salesStaffCode || query.salesmanCode || query.nvbhCode || query.salesman), 'i');
      and.push({ $or: [{ salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { salesmanName: rx }, { nvbhCode: rx }, { nvbhName: rx }] });
    }
    const keyword = text(query.q || query.keyword || query.search);
    if (keyword) {
      const rx = new RegExp(escapeRegex(keyword), 'i');
      and.push({ $or: [
        { id: rx }, { code: rx }, { salesOrderCode: rx }, { orderCode: rx },
        { customerCode: rx }, { customerName: rx }, { deliveryStaffCode: rx }, { deliveryStaffName: rx },
        { salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { salesmanName: rx }, { note: rx }
      ] });
    }
    if (and.length) filter.$and = and;

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(500, Math.max(1, Number(query.limit || 100)));
    const skip = (page - 1) * limit;
    const docs = await this.ReturnOrder.find(filter).select(DELIVERY_RETURN_SELECT).sort({ createdAt: -1, code: -1 }).skip(skip).limit(limit).lean();
    const returnOrders = docs.map(canonicalizeReturnDocument).filter((row) => String(query.includeZeroValue ?? query.showZero ?? '0') === '1' || hasPositiveReturnDocument(row));
    const rows = returnOrders.flatMap((ro) => flattenReturnOrderRows(ro, {}));
    return { returnOrders, returns: returnOrders, rows, summary: summarizeReturnRows(rows) };
  }

  async listReturns(query = {}) {
    const splitKeys = (value) => Array.isArray(value)
      ? value
      : text(value).split(',').map((item) => item.trim()).filter(Boolean);
    const directKeys = unique([
      query.salesOrderId, query.orderId, query.salesOrderCode, query.orderCode, query.orderKey,
      ...splitKeys(query.salesOrderIds || query.orderIds),
      ...splitKeys(query.salesOrderCodes || query.orderCodes)
    ]);
    let result = null;
    let orders = [];

    // V46 single-source rule:
    // When a selected order asks for returns, read returnOrders directly first.
    // Do not depend on SalesOrder resolution, date filters, or preloaded list cache.
    if (directKeys.length) {
      const or = [];
      const values = unique(directKeys.flatMap(keyVariants));
      for (const value of values) {
        or.push(
          { salesOrderId: value }, { orderId: value }, { salesOrderCode: value }, { orderCode: value },
          { sourceOrderId: value }, { sourceOrderCode: value }, { deliveryOrderId: value }, { deliveryOrderCode: value },
          { id: value }, { code: value }
        );
      }
      let directReturnsRaw = [];
      if (or.length) {
        let directQuery = this.ReturnOrder.find({ ...activeReturnFilter(), $or: or });
        if (directQuery && typeof directQuery.select === 'function') directQuery = directQuery.select(DELIVERY_RETURN_SELECT);
        const directDocs = directQuery && typeof directQuery.lean === 'function' ? await directQuery.lean() : await directQuery;
        directReturnsRaw = (directDocs || []).map(canonicalizeReturnDocument).filter(hasPositiveReturnDocument);
      }
      const directReturns = filterDeliveryOwnedRows(directReturnsRaw, query);
      if (directReturnsRaw.length && !directReturns.length && isDeliveryOwnershipEnforced(query)) {
        return { rows: [], returnOrdersRaw: [], summary: summarizeReturnRows([]) };
      }
      if (directReturns.length) {
        // ReturnOrders là SSoT của hàng trả. Với truy vấn trực tiếp theo đơn,
        // không cần gọi SalesOrder.findOne chỉ để bổ sung fallback hiển thị.
        // Điều này loại bỏ N+1 SalesOrder.findOne 400-600ms khi App mở tab Hàng trả.
        const directRows = directReturns.flatMap((ro) => flattenReturnOrderRows(ro, {}));
        return { rows: directRows, returnOrdersRaw: directReturns, summary: summarizeReturnRows(directRows) };
      }

      // Không có returnOrders chính thức => trả rỗng ngay. Không fallback sang SalesOrder vì
      // màn Hàng trả chỉ cần dữ liệu hàng trả đã lưu, và fallback cũ tạo findOne chậm cho từng đơn.
      return { rows: [], returnOrdersRaw: [], summary: summarizeReturnRows([]) };
    } else {
      // Fast path: danh sách hàng trả nên đọc trực tiếp returnOrders theo ngày/NVGH.
      // Bản cũ gọi listOrders() trước nên phát sinh SalesOrder.find lớn dù API chỉ cần phiếu trả.
      const directReturnDocs = await this.listReturnDocuments(query);
      if ((directReturnDocs.rows || []).length || query.deliveryStaffCode || query.delivery || query.date || query.deliveryDate) {
        return {
          rows: directReturnDocs.rows || [],
          returnOrdersRaw: directReturnDocs.returnOrders || [],
          summary: directReturnDocs.summary || summarizeReturnRows(directReturnDocs.rows || [])
        };
      }
      result = await this.listOrders(query);
      orders = result.rows || [];
    }

    const orderById = new Map();
    const orderByCode = new Map();
    for (const order of orders || []) {
      for (const id of unique([order.orderId, order.salesOrderId, order.id])) orderById.set(id, order);
      for (const code of unique([order.orderCode, order.salesOrderCode, order.code])) orderByCode.set(code, order);
    }

    const returnOrders = await this.findReturnOrdersFor(orders);
    const rows = [];
    for (const ro of returnOrders || []) {
      const order = orderById.get(text(ro.salesOrderId || ro.orderId || ro.sourceOrderId || ro.deliveryOrderId))
        || orderByCode.get(text(ro.salesOrderCode || ro.orderCode || ro.sourceOrderCode || ro.deliveryOrderCode))
        || {};
      rows.push(...flattenReturnOrderRows(ro, order));
    }
    return { rows, returnOrdersRaw: returnOrders.map(canonicalizeReturnDocument), summary: summarizeReturnRows(rows) };
  }

  async reconciliation(query = {}) {
    const result = await this.listOrders(query);
    return result.reconciliation;
  }
}

function buildDeliveryAssignment(order = {}) { return order; }

module.exports = {
  DeliveryEngine,
  buildDeliveryAssignment,
  buildCanonicalOrder,
  buildOrderReconciliation,
  summarizeOrders,
  helpers: {
    text,
    unique,
    orderIdOf,
    orderCodeOf,
    productCodeOf,
    returnMatchesOrder,
    buildOrderLookup,
    canonicalizeReturnDocument,
    summarizeReturnRows
  }
};
