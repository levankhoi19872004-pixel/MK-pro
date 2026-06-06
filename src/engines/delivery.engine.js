'use strict';

const { toNumber, makeId } = require('../utils/common.util');
const deliveryFinance = require('../utils/deliveryFinance.util');
const dateUtil = require('../utils/date.util');

function text(value) { return String(value == null ? '' : value).trim(); }
function lower(value) { return text(value).toLowerCase(); }
function unique(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }
function today() { return dateUtil.todayVN ? dateUtil.todayVN() : new Date().toISOString().slice(0, 10); }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function norm(value) { return lower(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim(); }
function compact(value) { return norm(value).replace(/[^a-z0-9]/g, ''); }
function truthy(value) { return ['1', 'true', 'yes', 'y'].includes(lower(value)); }

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

function activeReturnFilter() { return { status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] } }; }

function buildOrderLookup(value) {
  const key = text(value);
  if (!key) return null;
  const or = [{ id: key }, { code: key }, { orderCode: key }, { salesOrderId: key }, { salesOrderCode: key }];
  if (/^[a-f\d]{24}$/i.test(key)) or.push({ _id: key });
  return { $or: or };
}

function returnMatchesOrder(ret = {}, order = {}) {
  const ids = unique([orderIdOf(order), order.salesOrderId, order.orderId]);
  const codes = unique([orderCodeOf(order), order.salesOrderCode, order.orderCode, order.code]);
  const retIds = unique([ret.salesOrderId, ret.orderId, ret.sourceOrderId, ret.deliveryOrderId]);
  const retCodes = unique([ret.salesOrderCode, ret.orderCode, ret.sourceOrderCode, ret.deliveryOrderCode, ret.code && String(ret.code).replace(/^RO[-_]?/i, '')]);
  return ids.some((id) => retIds.includes(id)) || codes.some((code) => retCodes.includes(code));
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
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.staffCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.staffName),
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
      debt: toNumber(amounts.debt ?? amounts.debtAmount)
    },
    reconciliation: buildOrderReconciliation(amounts),
    status: {
      deliveryStatus: text(order.deliveryStatus || order.status || 'pending'),
      paymentStatus: (amounts.debt || 0) <= 0 ? 'paid' : ((amounts.processed || 0) > 0 ? 'partial' : 'unpaid'),
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
  const debt = toNumber(amounts.debt ?? amounts.debtAmount);
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
    acc.debt += toNumber(a.debt);
    return acc;
  }, { receivable: 0, cash: 0, bank: 0, reward: 0, returnAmount: 0, debt: 0 });
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


  staffCodeOf(user = {}) {
    return text(user.staffCode || user.code || user.employeeCode || user.salesStaffCode || user.deliveryStaffCode || user.maNhanVien || user.employeeId || user.staffId || user.username || user.id || user._id);
  }

  staffNameOf(user = {}) {
    return text(user.fullName || user.name || user.staffName || user.displayName || user.username || this.staffCodeOf(user));
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
    return text(order.salesStaffCode || order.salesmanCode || order.staffCode || order.saleCode || order.sellerCode);
  }

  orderStaffName(order = {}, type = '') {
    if (type === 'delivery') return text(order.deliveryStaffName || order.shipperName || order.driverName || order.staffDeliveryName);
    return text(order.salesStaffName || order.salesmanName || order.staffName || order.saleName || order.sellerName);
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
        { staffCode: { $in: regexes } },
        { code: { $in: regexes } },
        { employeeCode: { $in: regexes } },
        { salesStaffCode: { $in: regexes } },
        { deliveryStaffCode: { $in: regexes } },
        { username: { $in: regexes } },
        { fullName: { $in: regexes } },
        { name: { $in: regexes } }
      ]
    }).select('id staffCode code employeeCode salesStaffCode deliveryStaffCode username name fullName role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive').lean().catch(() => []);
    const byCode = new Map();
    const byName = new Map();
    for (const user of users || []) {
      const code = this.staffCodeOf(user);
      const name = this.staffNameOf(user);
      const codeKeys = unique([user.staffCode, user.code, user.employeeCode, user.salesStaffCode, user.deliveryStaffCode, user.username, user.maNhanVien, user.employeeId, user.staffId, code]).map(compact).filter(Boolean);
      const nameKeys = unique([user.fullName, user.name, user.staffName, user.displayName, name]).map(norm).filter(Boolean);
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
    const systemCode = systemUser ? this.staffCodeOf(systemUser) : '';
    const systemName = systemUser ? this.staffNameOf(systemUser) : '';
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
    const ids = unique(orders.flatMap((o) => [orderIdOf(o), o.id, o._id, o.salesOrderId, o.orderId]));
    const codes = unique(orders.flatMap((o) => [orderCodeOf(o), o.code, o.orderCode, o.salesOrderCode]));
    const or = [];
    if (ids.length) or.push({ salesOrderId: { $in: ids } }, { orderId: { $in: ids } }, { sourceOrderId: { $in: ids } }, { deliveryOrderId: { $in: ids } });
    if (codes.length) or.push({ salesOrderCode: { $in: codes } }, { orderCode: { $in: codes } }, { sourceOrderCode: { $in: codes } }, { deliveryOrderCode: { $in: codes } });
    if (!or.length) return [];
    return this.ReturnOrder.find({ ...activeReturnFilter(), $or: or }).lean();
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
      deliveryStaffCode: text(body.deliveryStaffCode || order.deliveryStaffCode),
      deliveryStaffName: text(body.deliveryStaffName || order.deliveryStaffName),
      salesStaffCode: text(body.salesStaffCode || order.salesStaffCode || order.staffCode),
      salesStaffName: text(body.salesStaffName || order.salesStaffName || order.staffName),
      staffCode: text(body.deliveryStaffCode || order.deliveryStaffCode),
      staffName: text(body.deliveryStaffName || order.deliveryStaffName),
      source: 'canonical_delivery_engine',
      refType: items.length ? 'canonicalDeliveryReturn' : 'canonicalDeliveryReturnClear',
      returnType: text(body.returnType || 'partial') || 'partial',
      returnStatus: items.length ? 'active' : 'cleared',
      status: items.length ? 'active' : 'cleared',
      accountingConfirmed: false,
      accountingStatus: items.length ? 'pending' : 'cleared',
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

    const returnOrder = await this.ReturnOrder.findOneAndUpdate(
      { $or: [{ id: stableId }, { code: stableId }, { salesOrderId: orderIdOf(order), salesOrderCode: orderCodeOf(order) }, { orderId: orderIdOf(order), orderCode: orderCodeOf(order) }] },
      { $set: patch, $setOnInsert: { createdAt: new Date().toISOString() } },
      { upsert: true, new: true, lean: true }
    );

    // V46 rule: returnOrders is the single source of truth for return goods.
    // Do not mirror returnAmount/returnItems into salesOrders. All delivery views must reload/overlay from returnOrders.
    const canonical = await this.getCanonicalOrderByKey(orderIdOf(order));
    return { order: canonical, returnOrder, message: items.length ? 'Đã lưu hàng trả' : 'Đã xóa hàng trả về 0' };
  }

  async savePayment(body = {}) {
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const current = await this.getCanonicalOrderByKey(key);
    if (!current) {
      const err = new Error('Không tìm thấy đơn giao hàng');
      err.status = 404;
      throw err;
    }
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

  async listReturns(query = {}) {
    const directKey = text(query.salesOrderId || query.orderId || query.salesOrderCode || query.orderCode || query.orderKey);
    let result = null;
    let orders = [];

    // V46 professional rule:
    // Tab Hàng trả must be able to reload by the selected order key immediately after saving.
    // Do not depend only on current list filters (date/NVGH/NVBH/status/q), because a stale or
    // broad filter can hide the just-saved returnOrder and make the UI look like the save failed.
    if (directKey) {
      const order = await this.getCanonicalOrderByKey(directKey);
      orders = order ? [order] : [];
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
      const status = text(ro.status || ro.returnStatus || 'active');
      const items = Array.isArray(ro.items) ? ro.items : [];
      if (!items.length) {
        rows.push({
          returnOrderId: text(ro.id || ro._id),
          returnOrderCode: text(ro.code || ro.id),
          salesOrderId: text(ro.salesOrderId || ro.orderId || order.salesOrderId || order.orderId),
          salesOrderCode: text(ro.salesOrderCode || ro.orderCode || order.salesOrderCode || order.orderCode),
          customerCode: text(ro.customerCode || order.customerCode),
          customerName: text(ro.customerName || order.customerName),
          deliveryDate: text(ro.deliveryDate || ro.date || order.deliveryDate),
          productCode: '',
          productName: '',
          returnQty: 0,
          price: 0,
          amount: toNumber(ro.totalAmount || ro.amount || ro.totalReturnAmount || ro.debtReduction),
          status
        });
        continue;
      }
      for (const item of items) {
        const returnQty = returnQtyOf(item) || qtyOf(item);
        const price = priceOf(item);
        rows.push({
          returnOrderId: text(ro.id || ro._id),
          returnOrderCode: text(ro.code || ro.id),
          salesOrderId: text(ro.salesOrderId || ro.orderId || order.salesOrderId || order.orderId),
          salesOrderCode: text(ro.salesOrderCode || ro.orderCode || order.salesOrderCode || order.orderCode),
          customerCode: text(ro.customerCode || order.customerCode),
          customerName: text(ro.customerName || order.customerName),
          deliveryDate: text(ro.deliveryDate || ro.date || order.deliveryDate),
          productCode: productCodeOf(item),
          productName: productNameOf(item),
          returnQty,
          price,
          amount: toNumber(item.returnAmount || item.amount || Math.round(returnQty * price)),
          status
        });
      }
    }
    return { rows, summary: rows.reduce((a, r) => { a.returnQty += toNumber(r.returnQty); a.amount += toNumber(r.amount); return a; }, { returnQty: 0, amount: 0 }) };
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
    buildOrderLookup
  }
};
