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
  return returnOrderAmountFromItems(items) > 0 || toNumber(row.totalAmount ?? row.totalReturnAmount ?? row.amount ?? row.debtReduction) > 0;
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
  const totalAmount = itemAmount || Math.round(toNumber(row.totalAmount ?? row.totalReturnAmount ?? row.amount ?? row.debtReduction));
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


function orderIdOf(order = {}) { return text(order.id || order.orderId || order.salesOrderId || order._id); }
function orderCodeOf(order = {}) { return text(order.code || order.orderCode || order.salesOrderCode || order.displayOrderCode || order.id || order._id); }
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
  // Lazy require để tránh vòng phụ thuộc với returnOrderService.
  return require('../domain/lifecycle/ReturnLifecycleService');
}

function buildOrderLookup(value) {
  const key = text(value);
  if (!key) return null;
  const or = [{ id: key }, { code: key }, { orderCode: key }, { salesOrderId: key }, { salesOrderCode: key }];
  if (/^[a-f\d]{24}$/i.test(key)) or.push({ _id: key });
  return { $or: or };
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

function buildCanonicalOrder(order = {}, relatedReturnOrders = []) {
  const returnItems = normalizeReturnItemsFromOrders(relatedReturnOrders);
  const returnAmount = returnItems.reduce((sum, item) => sum + toNumber(item.returnAmount || item.amount), 0);
  const canonical = deliveryFinance.buildCanonicalDeliveryOrder(order, { returnItems, returnAmountOverride: returnAmount });
  const amounts = canonical.amounts || {};
  return {
    ...canonical,
    orderId: orderIdOf(order),
    orderCode: orderCodeOf(order),
    salesOrderId: text(order.salesOrderId || order.id || order._id),
    salesOrderCode: text(order.salesOrderCode || order.orderCode || order.code || orderCodeOf(order)),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    deliveryDate: text(order.deliveryDate || order.date || order.documentDate),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_DELIVERY_ENGINE_DISPLAY_STAFF_START =====
    // DeliveryEngine không suy luận NVBH từ staffCode/staffName vì các field đó có thể là NVGH.
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_DELIVERY_ENGINE_DISPLAY_STAFF_END =====
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
}

function buildOrderReconciliation(amounts = {}) {
  const receivable = toNumber(amounts.receivable ?? amounts.totalReceivable);
  const cash = toNumber(amounts.cash ?? amounts.cashAmount);
  const bank = toNumber(amounts.bank ?? amounts.bankAmount);
  const reward = toNumber(amounts.reward ?? amounts.rewardAmount);
  const returnAmount = toNumber(amounts.returnAmount);
  const debt = normalizeDebtAmount(amounts.debt ?? amounts.debtAmount);
  const processed = cash + bank + reward + returnAmount + debt;
  const difference = Math.round(receivable - processed);
  return {
    receivable,
    cash,
    bank,
    reward,
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
    acc.returnAmount += toNumber(a.returnAmount);
    acc.debt += normalizeDebtAmount(a.debt);
    return acc;
  }, { receivable: 0, cash: 0, bank: 0, reward: 0, returnAmount: 0, debt: 0 });
}

function deliveryStatusOf(row = {}) {
  const status = row.status && typeof row.status === 'object' ? row.status : {};
  return lower(status.deliveryStatus || row.deliveryStatus || row.status || 'pending');
}

function isDeliveredOrder(row = {}) {
  return ['delivered', 'success', 'done', 'completed'].includes(deliveryStatusOf(row));
}

function applyDeliveryStatusFilter(rows = [], query = {}) {
  const statusFilter = lower(query.statusFilter || query.deliveryStatusFilter || query.orderStatusFilter || 'all');
  if (!statusFilter || ['all', 'tat ca', 'tất cả', '*'].includes(statusFilter)) return rows;

  if (['delivered', 'da giao', 'đã giao'].includes(statusFilter)) {
    return rows.filter(isDeliveredOrder);
  }

  if (['pending', 'not_delivered', 'not-delivered', 'chua giao', 'chưa giao'].includes(statusFilter)) {
    return rows.filter((row) => !isDeliveredOrder(row));
  }

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

  async findOrders(query = {}) {
    const date = text(query.date || query.deliveryDate || today());
    const filter = {};
    if (date) filter.deliveryDate = date;

    const status = norm(query.status);
    if (status && !['all', 'tat ca', 'tất cả', '*'].includes(status)) {
      filter.deliveryStatus = text(query.status);
    }

    // Không lọc NVGH/NVBH trực tiếp bằng 1 field Mongo ở đây.
    // Dữ liệu cũ có nhiều tên field khác nhau (salesStaffCode/staffCode/salesmanCode,
    // deliveryStaffCode/shipperCode/staffDeliveryCode...). Nếu query DB theo 1 field,
    // hệ thống dễ trả sai hoặc rơi vào nhánh masterOrder và bỏ qua lọc NVBH.
    let orders = await this.SalesOrder.find(filter)
      .sort({ deliveryStaffCode: 1, customerName: 1, code: 1 })
      .limit(1000)
      .lean();

    if (!orders.length && date && this.MasterOrder) {
      const masters = await this.MasterOrder.find({ deliveryDate: date }).lean();
      const filteredMasters = applyStaffFilters(masters, query);
      const childIds = unique(filteredMasters.flatMap((m) => Array.isArray(m.childOrderIds) ? m.childOrderIds : []));
      if (childIds.length) {
        orders = await this.SalesOrder.find({ $or: [{ id: { $in: childIds } }, { code: { $in: childIds } }] })
          .limit(1000)
          .lean();
      }
    }

    orders = applyStaffFilters(orders, query);

    const q = norm(query.q || query.keyword);
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
    return orders;
  }

  async findReturnOrdersFor(orders = []) {
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
    const docs = await this.ReturnOrder.find({ ...activeReturnFilter(), $or: or }).lean();
    return docs.map(canonicalizeReturnDocument).filter(hasPositiveReturnDocument);
  }

  async getCanonicalOrderByKey(key) {
    const lookup = buildOrderLookup(key);
    if (!lookup) return null;
    const order = await this.SalesOrder.findOne(lookup).lean();
    if (!order) return null;
    const returns = await this.findReturnOrdersFor([order]);
    return buildCanonicalOrder(order, returns.filter((ret) => returnMatchesOrder(ret, order)));
  }

  async listOrders(query = {}) {
    const orders = await this.findOrders(query);
    const returns = await this.findReturnOrdersFor(orders);
    let rows = orders.map((order) => buildCanonicalOrder(order, returns.filter((ret) => returnMatchesOrder(ret, order))));
    rows = applyDeliveryStatusFilter(rows, query);
    if (truthy(query.checkStaffAssignment) || truthy(query.checkStaff) || query.staffCheck !== '0') {
      rows = await this.enrichStaffAssignment(rows);
    }
    return { rows, summary: summarizeOrders(rows), reconciliation: this.reconcileRows(rows) };
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
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const order = await this.SalesOrder.findOne(buildOrderLookup(key)).lean();
    if (!order) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }

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

    const result = await getReturnLifecycleService().createPendingReturn(patch);
    if (result && result.error) {
      const err = new Error(result.error);
      err.status = result.status || 400;
      throw err;
    }
    const returnOrder = (result && result.returnOrder) || result;

    // V46 rule: returnOrders is the single source of truth for return goods.
    // Do not mirror returnAmount/returnItems into salesOrders. All delivery views must reload/overlay from returnOrders.
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(order));
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

  async savePayment(body = {}) {
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const current = await this.getCanonicalOrderByKey(key);
    if (!current) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }
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
    const updated = await this.SalesOrder.findOneAndUpdate(buildOrderLookup(key), { $set: patch }, { new: true, lean: true });
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(updated));
    return { order: canonical, allocation, message: 'Đã lưu thu tiền' };
  }

  async confirm(body = {}) {
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const current = await this.getCanonicalOrderByKey(key);
    if (!current) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }
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
    const updated = await this.SalesOrder.findOneAndUpdate(buildOrderLookup(key), { $set: patch }, { new: true, lean: true });
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(updated));
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
    const docs = await this.ReturnOrder.find(filter).sort({ createdAt: -1, code: -1 }).skip(skip).limit(limit).lean();
    const returnOrders = docs.map(canonicalizeReturnDocument).filter((row) => String(query.includeZeroValue ?? query.showZero ?? '0') === '1' || hasPositiveReturnDocument(row));
    const rows = returnOrders.flatMap((ro) => flattenReturnOrderRows(ro, {}));
    return { returnOrders, returns: returnOrders, rows, summary: summarizeReturnRows(rows) };
  }

  async listReturns(query = {}) {
    const directKeys = unique([query.salesOrderId, query.orderId, query.salesOrderCode, query.orderCode, query.orderKey]);
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
      const directReturns = or.length ? (await this.ReturnOrder.find({ ...activeReturnFilter(), $or: or }).lean()).map(canonicalizeReturnDocument).filter(hasPositiveReturnDocument) : [];
      if (directReturns.length) {
        let fallbackOrder = {};
        for (const key of directKeys) {
          fallbackOrder = await this.getCanonicalOrderByKey(key) || {};
          if (fallbackOrder && (fallbackOrder.orderId || fallbackOrder.orderCode)) break;
        }
        const directRows = directReturns.flatMap((ro) => flattenReturnOrderRows(ro, fallbackOrder));
        return { rows: directRows, returnOrdersRaw: directReturns, summary: summarizeReturnRows(directRows) };
      }

      for (const key of directKeys) {
        const order = await this.getCanonicalOrderByKey(key);
        if (order) { orders = [order]; break; }
      }
      result = { rows: orders };
    } else {
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
