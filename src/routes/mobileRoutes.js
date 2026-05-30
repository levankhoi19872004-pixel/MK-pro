'use strict';

/**
 * Mobile API V45 - standalone Mongo routes.
 *
 * Lý do sửa: app giao hàng đang gọi /api/mobile/... nhưng nhóm route mobile
 * chưa được mount vào src/routes/index.js, nên toàn bộ request rơi vào fallback
 * "API không tồn tại". File này cung cấp đầy đủ route mobile tối thiểu để
 * app bán hàng/giao hàng hoạt động trực tiếp trên MongoDB.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Staff = require('../models/Staff');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const Receipt = require('../models/Receipt');
const ReturnOrder = require('../models/ReturnOrder');
const Cashbook = require('../models/Cashbook');
const Bankbook = require('../models/Bankbook');
const Inventory = require('../models/Inventory');
const InventoryLegacy = require('../models/InventoryLegacy');
const { makeId, toNumber, stripMongoFields } = require('../utils/common.util');
const inventoryService = require('../services/inventoryService');
const searchService = require('../services/searchService');
const returnOrderService = require('../services/returnOrderService');

const router = express.Router();

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};

const ACCESS_TOKEN_EXPIRES_IN = process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN || '1d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.MOBILE_REFRESH_TOKEN_EXPIRES_IN || '30d';

function jwtSecret() {
  return process.env.JWT_SECRET || process.env.MOBILE_JWT_SECRET || 'mk-pro-v45-mobile-secret-change-me';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();
}

function getDocId(doc) {
  return String(doc?.id || doc?._id || '').trim();
}

function sameText(a, b) {
  return normalizeText(a) && normalizeText(a) === normalizeText(b);
}

function ok(res, body = {}, status = 200) {
  return res.status(status).json({ ok: true, success: true, ...body });
}

function fail(res, status, message) {
  return res.status(status).json({ ok: false, success: false, message });
}

function signToken(user, expiresIn = ACCESS_TOKEN_EXPIRES_IN) {
  return jwt.sign(user, jwtSecret(), { expiresIn });
}

function buildSafeUser(staff) {
  const role = ['admin', 'accountant', 'sales', 'delivery'].includes(String(staff.role || staff.type || '').trim())
    ? String(staff.role || staff.type).trim()
    : (staff.isDelivery ? 'delivery' : staff.isSalesman ? 'sales' : 'sales');
  const code = String(staff.code || staff.staffCode || staff.username || staff._id || '').trim();
  return {
    id: String(staff.id || code || staff._id || '').trim(),
    code,
    username: String(staff.username || code || '').trim(),
    name: String(staff.name || staff.fullName || staff.username || code || '').trim(),
    role,
    roleLabel: ROLE_LABELS[role] || role
  };
}

async function checkPassword(password, hashOrPlain) {
  const stored = String(hashOrPlain || '').trim();
  if (!stored) return String(password || '') === '123456';
  if (/^\$2[aby]\$\d{2}\$/.test(stored)) return bcrypt.compare(String(password || ''), stored);
  return String(password || '') === stored;
}

function requireMobileLogin(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return fail(res, 401, 'Bạn chưa đăng nhập mobile app');
  try {
    req.mobileUser = jwt.verify(token, jwtSecret());
    return next();
  } catch (err) {
    return fail(res, 401, 'Phiên đăng nhập đã hết hạn');
  }
}

function requireMobileRole(roles = []) {
  return (req, res, next) => {
    const role = String(req.mobileUser?.role || '').trim();
    if (role === 'admin' || roles.includes(role)) return next();
    return fail(res, 403, 'Bạn không có quyền sử dụng chức năng này');
  };
}

function buildRegexFilter(q, fields, base = { isActive: { $ne: false } }) {
  const keyword = String(q || '').trim();
  const filter = { ...base };
  if (keyword) filter.$or = fields.map((field) => ({ [field]: { $regex: keyword, $options: 'i' } }));
  return filter;
}


function productCodeOf(product) {
  return String(product?.code || product?.sku || product?.productCode || product?.id || product?._id || '').trim();
}

function productNameOf(product) {
  return String(product?.name || product?.productName || '').trim();
}

function openSaleQtyFromRows(rows = []) {
  return rows.reduce((sum, row) => {
    const onHand = toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.stockQuantity);
    const reserved = toNumber(row.reservedQty ?? row.reserved ?? 0);
    const qty = row.availableQty !== undefined && row.availableQty !== null
      ? toNumber(row.availableQty)
      : Math.max(0, onHand - reserved);
    return sum + qty;
  }, 0);
}

async function getOpenSaleQty(product) {
  const code = productCodeOf(product);
  const ids = [
    code,
    String(product?.sku || '').trim(),
    String(product?.productCode || '').trim(),
    String(product?.id || '').trim(),
    String(product?._id || '').trim()
  ].filter(Boolean);
  if (!ids.length) return 0;

  const filter = {
    $or: [
      { productCode: { $in: ids } },
      { productId: { $in: ids } },
      { code: { $in: ids } },
      { sku: { $in: ids } }
    ]
  };

  const [snapshotRows, legacyRows] = await Promise.all([
    Inventory.find(filter).lean(),
    InventoryLegacy.find(filter).lean()
  ]);

  const snapshotQty = openSaleQtyFromRows(snapshotRows);
  const legacyQty = openSaleQtyFromRows(legacyRows);

  // V45 fix: app bán hàng phải kiểm tra tồn cùng nguồn với báo cáo/gợi ý.
  // Nếu inventorySnapshots chưa rebuild hoặc đang là 0 nhưng collection inventories cũ có tồn,
  // dùng inventories làm fallback để tránh báo "Tồn 0 lẻ" sai khi kho thực tế còn hàng.
  if (legacyQty > 0 && (snapshotRows.length === 0 || snapshotQty <= 0)) return legacyQty;
  return snapshotQty;
}

function formatOpenSaleQty(quantity, conversionRate = 1) {
  const qty = Math.max(0, toNumber(quantity));
  const rate = Math.max(1, toNumber(conversionRate) || 1);
  const cases = Math.floor(qty / rate);
  const loose = qty % rate;
  return `${cases}/${loose}`;
}

async function buildMobileProductRow(product) {
  const availableQty = await getOpenSaleQty(product);
  const conversionRate = Math.max(1, toNumber(product.conversionRate || product.qtyPerCase || product.packingQty || 1));
  return {
    ...stripMongoFields(product),
    id: productCodeOf(product),
    code: productCodeOf(product),
    name: productNameOf(product),
    price: toNumber(product.salePrice || product.price),
    salePrice: toNumber(product.salePrice || product.price),
    conversionRate,
    availableQty,
    stockQuantity: availableQty,
    stockDisplay: formatOpenSaleQty(availableQty, conversionRate)
  };
}

async function assertItemsWithinOpenStock(items = [], oldItems = []) {
  const oldQtyByCode = new Map();
  for (const item of oldItems || []) {
    const code = String(item.productCode || item.code || item.productId || '').trim();
    if (!code) continue;
    oldQtyByCode.set(code, toNumber(oldQtyByCode.get(code)) + toNumber(item.quantity || item.qty));
  }

  for (const item of items || []) {
    const code = String(item.productCode || item.code || item.productId || '').trim();
    if (!code) return 'Có dòng sản phẩm thiếu mã sản phẩm';
    const product = await Product.findOne({
      isActive: { $ne: false },
      $or: [{ code }, { sku: code }, { productCode: code }, { id: code }, ...(code.match(/^[a-f\d]{24}$/i) ? [{ _id: code }] : [])]
    }).lean();
    if (!product) return `Không tìm thấy sản phẩm: ${code}`;
    const qty = toNumber(item.quantity || item.qty);
    if (qty <= 0) return `Số lượng phải lớn hơn 0: ${code}`;
    const availableQty = await getOpenSaleQty(product);
    const ownOldQty = toNumber(oldQtyByCode.get(code));
    if (qty > availableQty + ownOldQty) {
      return `Số lượng vượt tồn mở bán: ${code}. Tồn ${formatOpenSaleQty(availableQty + ownOldQty, product.conversionRate || 1)}, cần ${formatOpenSaleQty(qty, product.conversionRate || 1)}`;
    }
  }
  return '';
}

function orderCode(order) {
  return String(order.code || order.orderNo || order.orderCode || order.id || order._id || '').trim();
}

function orderDeliveryDate(order) {
  return String(order.deliveryDate || order.ngayGiao || order.shipDate || order.orderDate || order.date || '').slice(0, 10);
}

function masterChildIds(master) {
  const raw = master.childOrderIds || master.childOrders || master.orderIds || master.orders || [];
  return Array.isArray(raw) ? raw.map((item) => String(item?.id || item?.code || item?._id || item).trim()).filter(Boolean) : [];
}

function masterCode(master) {
  return String(master?.code || master?.masterOrderNo || master?.orderNo || master?.id || master?._id || '').trim();
}

function masterKeys(master) {
  return [getDocId(master), masterCode(master), master?.masterOrderNo, master?.orderNo, master?._id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function isActiveMasterOrder(master) {
  if (!master) return false;
  const inactiveStatuses = [
    'cancelled', 'canceled', 'void', 'deleted', 'inactive', 'archived',
    'da huy', 'dahuy', 'huy', 'đã hủy', 'đã huỷ', 'hủy', 'huỷ'
  ];
  const status = normalizeText(master.status || master.masterStatus || master.state);
  return !inactiveStatuses.includes(status);
}

function orderAssignedToUser(order, master, user) {
  if (!user || user.role === 'admin') return true;
  const candidates = [
    order.deliveryStaffCode,
    order.deliveryStaffName,
    order.driverCode,
    order.driverId,
    order.driverName,
    order.shipperCode,
    order.shipperName,
    master?.deliveryStaffCode,
    master?.deliveryStaffName,
    master?.driverCode,
    master?.driverId,
    master?.driverName,
    master?.shipperCode,
    master?.shipperName
  ];
  return candidates.some((value) => sameText(value, user.code) || sameText(value, user.name) || sameText(value, user.id));
}

function isApprovedForDelivery(order, master) {
  const status = normalizeText(order.deliveryStatus || order.status || master?.status);
  if (['cancelled', 'canceled', 'void', 'draft', 'deleted'].includes(status)) return false;
  // Đơn con đã nằm trong masterOrder là đủ điều kiện hiện ở app giao hàng.
  if (master) return true;
  return ['approved', 'pending', 'confirmed', 'delivering', 'delivery_pending', 'new', ''].includes(status);
}

function isActiveDeliveryStatus(order) {
  const status = normalizeText(order.deliveryStatus || order.status);
  return !['delivered', 'success', 'returned', 'cancelled', 'void'].includes(status);
}

function deliveryDebtBase(order = {}) {
  return toNumber(order.debtBeforeCollection ?? order.totalAmount ?? order.amount ?? order.grandTotal ?? order.payableAmount ?? order.debtAmount ?? 0);
}

function calculateDeliveryDebt(order = {}) {
  return Math.max(0, Math.round(
    deliveryDebtBase(order)
    - toNumber(order.cashCollected ?? order.cashAmount ?? 0)
    - toNumber(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0)
    - toNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0)
    - toNumber(order.returnAmount ?? order.returnedAmount ?? 0)
  ));
}


function isActiveReturnOrder(row = {}) {
  const status = normalizeText(row.status || row.state || row.returnStatus);
  return !['cancelled', 'canceled', 'void', 'deleted', 'inactive', 'archived'].includes(status);
}

function returnLineCode(item = {}) {
  return String(item.productCode || item.code || item.productId || item.sku || '').trim();
}

function returnLineQty(item = {}) {
  return toNumber(item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.returnQty ?? item.quantity ?? item.qty ?? 0);
}

function returnLinePrice(item = {}) {
  return toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
}

function orderMatchKeys(order = {}, master = null, masterChild = null) {
  const values = [
    getDocId(order), orderCode(order), order.orderNo, order.orderCode, order.id, order._id,
    getDocId(masterChild), orderCode(masterChild || {}), masterChild?.orderNo, masterChild?.orderCode, masterChild?.id, masterChild?._id,
    getDocId(master), masterCode(master), master?.orderNo, master?.masterOrderNo
  ];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function returnOrderMatchesOrder(row = {}, order = {}, master = null, masterChild = null) {
  if (!isActiveReturnOrder(row)) return false;
  const keys = orderMatchKeys(order, master, masterChild);
  const rowKeys = [
    row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode, row.sourceOrderId, row.refId, row.refCode,
    row.erpDeliveryReturnKey
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (rowKeys.some((key) => keys.includes(key))) return true;

  // Fallback an toàn cho dữ liệu cũ: cùng khách + cùng ngày + cùng mã đơn hiển thị trong ghi chú.
  const rowCustomer = String(row.customerCode || '').trim();
  const orderCustomer = String(order.customerCode || masterChild?.customerCode || '').trim();
  const rowDate = String(row.date || row.documentDate || row.returnDate || '').slice(0, 10);
  const deliveryDate = String(orderDeliveryDate(order) || orderDeliveryDate(masterChild || {}) || master?.deliveryDate || '').slice(0, 10);
  const note = String(row.note || '').trim();
  return Boolean(rowCustomer && orderCustomer && rowCustomer === orderCustomer && rowDate && deliveryDate && rowDate === deliveryDate && keys.some((key) => note.includes(key)));
}

function mergeReturnItemsFromOrders(returnOrders = [], order = {}, master = null, masterChild = null) {
  const merged = new Map();
  for (const row of returnOrders.filter((item) => returnOrderMatchesOrder(item, order, master, masterChild))) {
    for (const item of (Array.isArray(row.items) ? row.items : [])) {
      const code = returnLineCode(item);
      if (!code) continue;
      const current = merged.get(code) || {
        productCode: code,
        productId: item.productId || code,
        productName: item.productName || item.name || '',
        qtyReturn: 0,
        returnQuantity: 0,
        returnedQty: 0,
        quantity: 0,
        qty: 0,
        price: returnLinePrice(item),
        salePrice: returnLinePrice(item),
        unitPrice: returnLinePrice(item),
        amount: 0
      };
      const qty = returnLineQty(item);
      const price = returnLinePrice(item) || current.price || 0;
      current.productName = current.productName || item.productName || item.name || '';
      current.qtyReturn += qty;
      current.returnQuantity = current.qtyReturn;
      current.returnedQty = current.qtyReturn;
      current.quantity = current.qtyReturn;
      current.qty = current.qtyReturn;
      current.price = price;
      current.salePrice = price;
      current.unitPrice = price;
      current.amount += Math.round(qty * price);
      merged.set(code, current);
    }
  }
  return Array.from(merged.values());
}

function mergeOrderItemsWithReturnItems(order = {}, returnItems = []) {
  const returnByCode = new Map(returnItems.map((item) => [returnLineCode(item), item]));
  return (Array.isArray(order.items) ? order.items : []).map((item) => {
    const code = returnLineCode(item);
    const returned = returnByCode.get(code);
    const qtyReturn = returned ? returnLineQty(returned) : 0;
    const price = returnLinePrice(returned || item) || toNumber(item.salePrice || item.price || item.unitPrice || 0);
    return {
      ...item,
      qtyReturn,
      returnQuantity: qtyReturn,
      returnedQty: qtyReturn,
      returnQty: qtyReturn,
      returnAmount: Math.round(qtyReturn * price)
    };
  });
}

function stableReturnIdForOrder(order = {}) {
  return `RO-MOBILE-${String(getDocId(order) || orderCode(order)).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

async function upsertMobileReturnOrder(order, items, req, returnType = 'partial') {
  const salesOrderId = String(getDocId(order) || '').trim();
  const salesOrderCode = String(orderCode(order) || '').trim();

  const dedupOr = [];
  if (salesOrderId) dedupOr.push({ salesOrderId });
  if (salesOrderCode) dedupOr.push({ salesOrderCode });

  if (!dedupOr.length) {
    throw new Error('Thiếu salesOrderId/salesOrderCode, không thể lưu phiếu trả');
  }

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const code = returnLineCode(item);
      const qty = returnLineQty(item);
      const sourceLine = (Array.isArray(order.items) ? order.items : []).find((line) => returnLineCode(line) === code) || {};
      const price = returnLinePrice(item) || returnLinePrice(sourceLine);
      return {
        productId: item.productId || sourceLine.productId || code,
        productCode: code,
        productName: item.productName || sourceLine.productName || sourceLine.name || '',
        quantity: qty,
        qty: qty,
        qtyReturn: qty,
        returnQuantity: qty,
        returnedQty: qty,
        price,
        salePrice: price,
        unitPrice: price,
        amount: Math.round(qty * price),
        reason: item.reason || req.body?.note || ''
      };
    })
    .filter((item) => item.productCode && item.qtyReturn > 0);

  const totalAmount = normalizedItems.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const stableId = stableReturnIdForOrder(order);
  const now = new Date().toISOString();

  // V45 chuẩn: app và ERP đều ghi qua returnOrderService để dùng chung 1 nguồn returnOrders.
  // Dedup chỉ theo salesOrderId/salesOrderCode hợp lệ; tuyệt đối không dùng orderId/orderCode mơ hồ.
  const result = await returnOrderService.createPendingReturnOrder({
    id: stableId,
    date: now.slice(0, 10),
    documentDate: now.slice(0, 10),
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    salesOrderId,
    salesOrderCode,
    returnType,
    items: normalizedItems,
    totalQuantity: normalizedItems.reduce((sum, item) => sum + toNumber(item.qtyReturn), 0),
    totalAmount,
    amount: totalAmount,
    debtReduction: totalAmount,
    status: 'waiting_receive',
    returnMergeStatus: 'unmerged',
    warehouseReceiveStatus: 'waiting_receive',
    source: 'returnOrders',
    refType: 'mobileDeliveryReturn',
    staffCode: req.mobileUser?.code || '',
    staffName: req.mobileUser?.name || '',
    deliveryStaffCode: req.mobileUser?.code || '',
    deliveryStaffName: req.mobileUser?.name || '',
    note: String(req.body?.note || '').trim() || `App giao hàng trả hàng đơn ${salesOrderCode || salesOrderId}`,
    updatedAt: now
  });

  if (result?.error) {
    const err = new Error(result.error);
    err.status = result.status || 400;
    throw err;
  }

  const saved = result.returnOrder;

  // Chỉ hủy phiếu trùng khi có khóa đơn bán rõ ràng.
  // Không dùng orderId/orderCode và không chạy updateMany nếu dedupOr rỗng.
  const duplicateFilter = {
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] },
    returnMergeStatus: { $ne: 'merged' },
    masterReturnOrderId: { $in: [null, '', undefined] },
    masterReturnOrderCode: { $in: [null, '', undefined] },
    $or: dedupOr
  };
  if (saved?._id) {
    duplicateFilter._id = { $ne: saved._id };
  } else if (saved?.id || saved?.code) {
    duplicateFilter.$and = [
      ...(saved.id ? [{ id: { $ne: saved.id } }] : []),
      ...(saved.code ? [{ code: { $ne: saved.code } }] : [])
    ];
  }

  await ReturnOrder.updateMany(duplicateFilter, { $set: { status: 'cancelled', cancelReason: `Hủy phiếu trả trùng của đơn ${salesOrderCode || salesOrderId}`, updatedAt: now } });

  return saved;
}

function buildDeliveryRow(order, customer, master, date, returnOrders = [], masterChild = null) {
  const sourceOrder = masterChild && Array.isArray(masterChild.items) && masterChild.items.length ? { ...order, ...masterChild, id: getDocId(order) || masterChild.id } : order;
  const returnItems = mergeReturnItemsFromOrders(returnOrders, order, master, masterChild);
  const syncedReturnAmount = returnItems.reduce((sum, item) => sum + toNumber(item.amount ?? returnLineQty(item) * returnLinePrice(item)), 0);
  const totalAmount = toNumber(sourceOrder.totalAmount || sourceOrder.amount || sourceOrder.grandTotal || sourceOrder.payableAmount);
  const paidAmount = toNumber(sourceOrder.paidAmount || sourceOrder.paid || sourceOrder.collectedAmount);
  const cashCollected = toNumber(sourceOrder.cashCollected || sourceOrder.cashAmount);
  const bankCollected = toNumber(sourceOrder.bankCollected || sourceOrder.bankAmount || sourceOrder.transferAmount);
  // returnOrders là nguồn sự thật duy nhất cho tiền/số lượng hàng trả.
  const returnAmount = syncedReturnAmount;
  const rewardAmount = toNumber(sourceOrder.rewardAmount || sourceOrder.displayRewardAmount);
  const debtBeforeCollection = deliveryDebtBase({ ...sourceOrder, totalAmount });
  const debtAmount = calculateDeliveryDebt({ debtBeforeCollection, cashCollected, bankCollected, returnAmount, rewardAmount });
  const itemSource = Array.isArray(sourceOrder.items) ? sourceOrder.items : [];
  return {
    id: getDocId(order),
    code: orderCode(sourceOrder) || orderCode(order),
    masterOrderId: getDocId(master),
    masterOrderCode: master?.code || master?.masterOrderNo || '',
    deliveryDate: orderDeliveryDate(sourceOrder) || String(master?.deliveryDate || date || '').slice(0, 10),
    deliveryStatus: sourceOrder.deliveryStatus || sourceOrder.status || 'pending',
    visualStatus: sourceOrder.deliveryStatus || sourceOrder.status || 'pending',
    routeName: sourceOrder.routeName || customer?.route || master?.routeName || '',
    customerName: sourceOrder.customerName || customer?.name || '',
    customerCode: sourceOrder.customerCode || customer?.code || '',
    phone: sourceOrder.customerPhone || sourceOrder.phone || customer?.phone || '',
    address: sourceOrder.customerAddress || sourceOrder.address || customer?.address || '',
    salesmanName: sourceOrder.salesmanName || sourceOrder.salesStaffName || sourceOrder.staffName || '',
    salesmanCode: sourceOrder.salesmanCode || sourceOrder.salesStaffCode || sourceOrder.staffCode || '',
    deliveryStaffName: sourceOrder.deliveryStaffName || master?.deliveryStaffName || master?.driverName || '',
    deliveryStaffCode: sourceOrder.deliveryStaffCode || master?.deliveryStaffCode || master?.driverCode || master?.driverId || '',
    amount: debtAmount,
    totalAmount,
    paidAmount,
    debtAmount,
    debt: debtAmount,
    debtBeforeCollection,
    cashCollected,
    bankCollected,
    returnAmount,
    returnedAmount: returnAmount,
    rewardAmount,
    returnItems,
    deliveryReturnItems: returnItems,
    status: sourceOrder.status || '',
    items: mergeOrderItemsWithReturnItems({ items: itemSource }, returnItems)
  };
}

function buildCode(prefix) {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}${ymd}${String(d.getTime()).slice(-6)}`;
}

async function findOrderByIdOrCode(idOrCode) {
  const key = String(idOrCode || '').trim();
  if (!key) return null;
  return SalesOrder.findOne({
    $or: [
      { id: key },
      { code: key },
      { orderNo: key },
      { orderCode: key },
      ...(key.match(/^[a-f\d]{24}$/i) ? [{ _id: key }] : [])
    ]
  });
}

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!username || !password) return fail(res, 400, 'Thiếu tài khoản hoặc mật khẩu');

    const staff = await Staff.findOne({
      isActive: { $ne: false },
      $or: [{ username }, { code: username }, { phone: username }, { name: username }, { fullName: username }]
    }).lean();
    if (!staff || !(await checkPassword(password, staff.password || staff.pass || staff.pin))) {
      return fail(res, 401, 'Sai tài khoản hoặc mật khẩu');
    }

    const user = buildSafeUser(staff);
    return ok(res, {
      source: 'mobile-mongo-route',
      token: signToken(user),
      refreshToken: signToken(user, REFRESH_TOKEN_EXPIRES_IN),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không đăng nhập được mobile app');
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken) return fail(res, 401, 'Refresh token không hợp lệ');
    const user = jwt.verify(refreshToken, jwtSecret());
    const safeUser = { id: user.id, code: user.code, username: user.username, name: user.name, role: user.role, roleLabel: user.roleLabel };
    return ok(res, { token: signToken(safeUser), refreshToken: signToken(safeUser, REFRESH_TOKEN_EXPIRES_IN), expiresIn: ACCESS_TOKEN_EXPIRES_IN, user: safeUser });
  } catch (err) {
    return fail(res, 401, 'Refresh token không hợp lệ hoặc đã hết hạn');
  }
});

router.get('/me', requireMobileLogin, (req, res) => ok(res, { user: req.mobileUser, roles: ROLE_LABELS }));
router.get('/roles', requireMobileLogin, (req, res) => ok(res, { roles: ROLE_LABELS }));

router.get('/customers', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const items = await searchService.searchCustomers({
      ...req.query,
      includeMetrics: '1',
      mobile: '1',
      limit: req.query.limit || 100
    });
    return ok(res, { source: 'unified-search-mobile', items });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được khách hàng mobile');
  }
});

router.get('/products', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const items = await searchService.searchProducts({
      ...req.query,
      includeStock: '1',
      mobile: '1',
      limit: req.query.limit || (req.query.q ? 120 : 300)
    });
    const hasPositiveStock = items.some((p) => toNumber(p.availableQty) > 0);
    return ok(res, {
      source: 'unified-search-mobile',
      items,
      inventoryWarning: hasPositiveStock ? '' : 'Chưa có tồn mở bán dương. Cần chạy rebuild tồn kho từ chứng từ để hiển thị tồn chính xác.'
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được sản phẩm mobile');
  }
});

router.get('/stock', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const items = await searchService.searchProducts({
      ...req.query,
      includeStock: '1',
      mobile: '1',
      limit: req.query.limit || (req.query.q ? 150 : 300)
    });
    const hasPositiveStock = items.some((p) => toNumber(p.availableQty) > 0);
    return ok(res, {
      source: 'unified-search-mobile',
      items,
      inventoryWarning: hasPositiveStock ? '' : 'Chưa có tồn mở bán dương. Cần chạy rebuild tồn kho từ chứng từ để hiển thị tồn chính xác.'
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được tồn kho mobile');
  }
});


router.post('/inventory/rebuild', requireMobileLogin, requireMobileRole(['admin', 'accountant']), async (req, res) => {
  try {
    const result = await inventoryService.rebuildStockLedgerFromDocuments({
      resetTransactions: ['1', 'true', 'yes'].includes(String(req.body?.resetTransactions || req.query.resetTransactions || '1').toLowerCase())
    });
    return ok(res, {
      source: 'mobile-mongo-route',
      message: 'Đã rebuild stockTransactions và inventorySnapshots. Products chỉ còn là danh mục, không lưu tồn.',
      ...result
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không rebuild được tồn kho');
  }
});

router.get('/sales/orders', requireMobileLogin, requireMobileRole(['sales', 'admin']), async (req, res) => {
  try {
    const user = req.mobileUser || {};
    const mine = String(req.query.mine || '') === '1';
    const q = normalizeText(req.query.q);
    const targetDate = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const filter = {
      status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] },
      $or: [{ date: targetDate }, { orderDate: targetDate }]
    };
    if (mine && user.role !== 'admin') {
      filter.$and = [{
        $or: [
          { staffCode: user.code },
          { salesStaffCode: user.code },
          { staffName: user.name },
          { salesStaffName: user.name }
        ]
      }];
    }
    const rows = await SalesOrder.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    let items = rows.map(stripMongoFields).map((order) => ({
      ...order,
      date: String(order.date || order.orderDate || '').slice(0, 10),
      canEdit: !order.masterOrderId && !order.masterOrderCode && !order.masterOrderNo && String(order.mergeStatus || 'unmerged') !== 'merged'
    }));
    if (q) items = items.filter((o) => [o.code, o.customerCode, o.customerName, o.customerPhone, o.customerAddress].some((v) => normalizeText(v).includes(q)));
    return ok(res, { source: 'mobile-mongo-route', date: targetDate, items });
  } catch (err) {
    return fail(res, 500, 'Không tải được đơn mobile');
  }
});

router.get('/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales', 'admin']), async (req, res) => {
  const order = await findOrderByIdOrCode(req.params.id);
  if (!order) return fail(res, 404, 'Không tìm thấy đơn mobile');
  const item = stripMongoFields(order.toObject ? order.toObject() : order);
  item.date = String(item.date || item.orderDate || '').slice(0, 10);
  item.canEdit = !item.masterOrderId && !item.masterOrderCode && !item.masterOrderNo && String(item.mergeStatus || 'unmerged') !== 'merged';
  return ok(res, { order: item });
});

router.post('/sales/orders', requireMobileLogin, requireMobileRole(['sales', 'admin']), async (req, res) => {
  try {
    const body = req.body || {};
    const customer = body.customer || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return fail(res, 400, 'Đơn bán chưa có sản phẩm');
    const stockError = await assertItemsWithinOpenStock(items);
    if (stockError) return fail(res, 400, stockError);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount || item.total || toNumber(item.quantity || item.qty) * toNumber(item.salePrice || item.price)), 0);
    const paidAmount = Math.min(toNumber(body.paidAmount), totalAmount);
    const order = await SalesOrder.create({
      id: makeId('SO'),
      code: buildCode('SO'),
      source: 'mobile_sales_app',
      sourceType: 'mobile_sales',
      customerId: body.customerId || customer.id || '',
      customerCode: body.customerCode || customer.code || '',
      customerName: body.customerName || customer.name || '',
      customerPhone: customer.phone || body.customerPhone || '',
      customerAddress: customer.address || body.customerAddress || '',
      staffCode: req.mobileUser.code || '',
      staffName: req.mobileUser.name || '',
      salesStaffCode: req.mobileUser.code || '',
      salesStaffName: req.mobileUser.name || '',
      date: body.orderDate || new Date().toISOString().slice(0, 10),
      orderDate: body.orderDate || new Date().toISOString().slice(0, 10),
      deliveryDate: body.deliveryDate || body.orderDate || new Date().toISOString().slice(0, 10),
      isChildOrder: true,
      masterOrderId: '',
      masterOrderCode: '',
      masterOrderNo: '',
      mergeStatus: 'unmerged',
      status: 'pending',
      deliveryStatus: 'pending',
      items,
      totalAmount,
      paidAmount,
      debtAmount: Math.max(0, totalAmount - paidAmount),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await inventoryService.postStockMovement(order.toObject(), {
      type: 'SALE',
      direction: 'OUT',
      refType: 'MOBILE_SALES_ORDER',
      refId: order.id || order.code,
      refCode: order.code || order.id,
      date: order.date || order.orderDate,
      note: 'Xuất kho theo đơn app bán hàng'
    });
    const savedOrder = stripMongoFields(order.toObject());
    savedOrder.canEdit = true;
    return ok(res, { message: 'Đã tạo đơn bán mobile', order: savedOrder, salesOrder: savedOrder }, 201);
  } catch (err) {
    return fail(res, 500, err.message || 'Không tạo được đơn mobile');
  }
});

router.put('/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales', 'admin']), async (req, res) => {
  try {
    const order = await findOrderByIdOrCode(req.params.id);
    if (!order) return fail(res, 404, 'Không tìm thấy đơn mobile');
    const raw = order.toObject ? order.toObject() : order;
    const isMerged = raw.masterOrderId || raw.masterOrderCode || raw.masterOrderNo || String(raw.mergeStatus || 'unmerged') === 'merged';
    if (isMerged) return fail(res, 403, 'Đơn đã gộp đơn tổng, app bán hàng không được sửa');

    const body = req.body || {};
    const customer = body.customer || {};
    const items = Array.isArray(body.items) ? body.items : raw.items || [];
    const stockError = await assertItemsWithinOpenStock(items, raw.items || []);
    if (stockError) return fail(res, 400, stockError);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount || item.total || toNumber(item.quantity || item.qty) * toNumber(item.salePrice || item.price)), 0);
    const paidAmount = Math.min(toNumber(body.paidAmount), totalAmount);

    Object.assign(order, {
      customerId: body.customerId || customer.id || raw.customerId || '',
      customerCode: body.customerCode || customer.code || raw.customerCode || '',
      customerName: body.customerName || customer.name || raw.customerName || '',
      customerPhone: customer.phone || body.customerPhone || raw.customerPhone || '',
      customerAddress: customer.address || body.customerAddress || raw.customerAddress || '',
      items,
      totalAmount,
      paidAmount,
      debtAmount: Math.max(0, totalAmount - paidAmount),
      note: body.note || raw.note || '',
      updatedAt: new Date().toISOString()
    });
    await inventoryService.reverseStockMovement(raw, {
      type: 'SALE',
      reverseType: 'SALE_REVERSAL',
      direction: 'OUT',
      refType: 'MOBILE_SALES_ORDER',
      refId: raw.id || raw.code,
      refCode: raw.code || raw.id,
      date: new Date().toISOString().slice(0, 10),
      note: 'Đảo xuất kho trước khi sửa đơn app bán hàng'
    });
    await order.save();
    await inventoryService.postStockMovement(order.toObject(), {
      type: 'SALE',
      direction: 'OUT',
      refType: 'MOBILE_SALES_ORDER',
      refId: order.id || order.code,
      refCode: order.code || order.id,
      date: order.date || order.orderDate,
      note: 'Xuất kho sau khi sửa đơn app bán hàng'
    });
    const savedOrder = stripMongoFields(order.toObject());
    savedOrder.canEdit = true;
    return ok(res, { message: 'Đã cập nhật đơn mobile', order: savedOrder, salesOrder: savedOrder });
  } catch (err) {
    return fail(res, 500, err.message || 'Không sửa được đơn mobile');
  }
});

router.delete('/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales', 'admin']), async (req, res) => {
  try {
    const order = await findOrderByIdOrCode(req.params.id);
    if (!order) return fail(res, 404, 'Không tìm thấy đơn mobile');
    const raw = order.toObject ? order.toObject() : order;
    const isMerged = raw.masterOrderId || raw.masterOrderCode || raw.masterOrderNo || String(raw.mergeStatus || 'unmerged') === 'merged';
    if (isMerged) return fail(res, 403, 'Đơn đã gộp đơn tổng, app bán hàng không được xóa');

    order.status = 'void';
    order.deliveryStatus = 'void';
    order.deletedAt = new Date().toISOString();
    order.deleteReason = 'Xóa từ app bán hàng mobile trước khi gộp đơn tổng';
    order.updatedAt = new Date().toISOString();
    await inventoryService.reverseStockMovement(raw, {
      type: 'SALE',
      reverseType: 'SALE_REVERSAL',
      direction: 'OUT',
      refType: 'MOBILE_SALES_ORDER',
      refId: raw.id || raw.code,
      refCode: raw.code || raw.id,
      date: new Date().toISOString().slice(0, 10),
      note: 'Đảo xuất kho khi xóa đơn app bán hàng'
    });
    await order.save();
    const savedOrder = stripMongoFields(order.toObject());
    return ok(res, { message: `Đã xóa đơn ${savedOrder.code || ''}`, order: savedOrder, salesOrder: savedOrder });
  } catch (err) {
    return fail(res, 500, err.message || 'Không xóa được đơn mobile');
  }
});

router.get('/delivery/orders', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const targetDate = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const includeCompleted = ['1', 'true'].includes(String(req.query.includeCompleted || '').toLowerCase());
    const q = normalizeText(req.query.q);
    const status = normalizeText(req.query.status);

    // Siết API giao hàng: app chỉ được hiện đơn con thuộc đơn tổng CÒN HIỆU LỰC.
    // Không lấy đơn con trôi nổi chỉ vì còn deliveryDate/driverId cũ sau khi đơn tổng đã hủy.
    const masters = (await MasterOrder.find({ deliveryDate: targetDate }).lean()).filter(isActiveMasterOrder);
    const masterByChild = new Map();
    const masterChildByKey = new Map();
    for (const master of masters) {
      for (const childId of masterChildIds(master)) {
        masterByChild.set(String(childId), master);
      }
      for (const child of (Array.isArray(master.children) ? master.children : [])) {
        for (const key of orderMatchKeys(child, master, child)) {
          masterByChild.set(String(key), master);
          masterChildByKey.set(String(key), child);
        }
      }
    }

    const childKeys = Array.from(masterByChild.keys());
    if (!childKeys.length) {
      return ok(res, {
        source: 'mobile-delivery-mongo-route',
        date: targetDate,
        user: req.mobileUser,
        formula: 'Chỉ lấy đơn con thuộc masterOrders còn hiệu lực của ngày giao và đúng nhân viên giao hàng đang đăng nhập.',
        items: []
      });
    }

    const objectIdKeys = childKeys.filter((key) => /^[a-f\d]{24}$/i.test(key));
    const orderFilter = {
      $or: [
        { id: { $in: childKeys } },
        { code: { $in: childKeys } },
        { orderNo: { $in: childKeys } },
        { orderCode: { $in: childKeys } },
        ...(objectIdKeys.length ? [{ _id: { $in: objectIdKeys } }] : [])
      ]
    };

    const orders = await SalesOrder.find(orderFilter).lean();
    const returnOrders = await ReturnOrder.find({ status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] } }).lean();
    const customerCodes = [...new Set(orders.map((o) => o.customerCode).filter(Boolean))];
    const customers = customerCodes.length ? await Customer.find({ code: { $in: customerCodes } }).lean() : [];
    const customerByCode = new Map(customers.map((c) => [String(c.code), c]));

    let items = orders
      .map((order) => {
        const possibleOrderKeys = orderMatchKeys(order);
        const master = possibleOrderKeys.map((key) => masterByChild.get(key)).find(Boolean) || null;
        const masterChild = possibleOrderKeys.map((key) => masterChildByKey.get(key)).find(Boolean) || null;
        return { order, master, masterChild };
      })
      .filter(({ master }) => isActiveMasterOrder(master))
      .filter(({ order, master }) => isApprovedForDelivery(order, master))
      .filter(({ order, master }) => orderAssignedToUser(order, master, req.mobileUser))
      .map(({ order, master, masterChild }) => buildDeliveryRow(order, customerByCode.get(String(order.customerCode || masterChild?.customerCode)), master, targetDate, returnOrders, masterChild))
      .filter((row) => includeCompleted || isActiveDeliveryStatus(row));

    if (q) {
      items = items.filter((row) => [row.code, row.customerCode, row.customerName, row.phone, row.address, row.routeName, row.masterOrderCode]
        .some((value) => normalizeText(value).includes(q)));
    }
    if (status) {
      items = items.filter((row) => {
        if (status === 'unpaid') return toNumber(row.debtAmount) > 0;
        return normalizeText(row.deliveryStatus) === status || normalizeText(row.visualStatus) === status;
      });
    }

    items.sort((a, b) => String(a.routeName).localeCompare(String(b.routeName)) || String(a.code).localeCompare(String(b.code)));
    return ok(res, {
      source: 'mobile-delivery-mongo-route',
      date: targetDate,
      user: req.mobileUser,
      formula: 'Chỉ lấy đơn con thuộc masterOrders còn hiệu lực của ngày giao, rồi lọc theo nhân viên giao hàng đang đăng nhập. Đơn tổng đã hủy/void sẽ không còn hiện trên app.',
      items
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được đơn giao hàng mobile');
  }
});

router.post('/delivery/confirm', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const order = await findOrderByIdOrCode(req.body?.orderId);
    if (!order) return fail(res, 404, 'Không tìm thấy đơn giao hàng');
    const status = String(req.body?.status || '').trim();
    if (!['success', 'failed'].includes(status)) return fail(res, 400, 'Trạng thái giao hàng không hợp lệ');
    const hasSplitAmounts = req.body?.cashAmount !== undefined || req.body?.bankAmount !== undefined || req.body?.rewardAmount !== undefined;
    const cashAmount = hasSplitAmounts ? Math.max(0, toNumber(req.body?.cashAmount)) : 0;
    const bankAmount = hasSplitAmounts ? Math.max(0, toNumber(req.body?.bankAmount)) : 0;
    const rewardAmount = hasSplitAmounts ? Math.max(0, toNumber(req.body?.rewardAmount)) : 0;
    const legacyCollectAmount = Math.max(0, toNumber(req.body?.collectAmount));
    const collectAmount = hasSplitAmounts ? cashAmount + bankAmount + rewardAmount : legacyCollectAmount;
    const method = String(req.body?.collectionMethod || req.body?.paymentMethod || 'cash').trim() === 'transfer' ? 'transfer' : 'cash';
    const note = String(req.body?.note || '').trim();

    order.deliveryStatus = status === 'success' ? 'delivered' : 'failed';
    order.status = status === 'success' ? 'delivered' : 'delivery_failed';
    order.deliveryStaffCode = req.mobileUser.code || order.deliveryStaffCode || '';
    order.deliveryStaffName = req.mobileUser.name || order.deliveryStaffName || '';
    order.deliveryNote = note;
    order.deliveredAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();

    if (status === 'failed') {
      const fullItems = (Array.isArray(order.items) ? order.items : []).map((item) => ({
        ...item,
        qtyReturn: toNumber(item.quantity || item.qty || item.qtyOrder || item.orderQty),
        reason: note || 'Không giao được'
      })).filter((item) => toNumber(item.qtyReturn) > 0);
      if (fullItems.length) {
        const returnOrder = await upsertMobileReturnOrder(order, fullItems, req, 'full');
        order.returnAmount = toNumber(returnOrder.totalAmount || returnOrder.amount || 0);
        order.returnedAmount = order.returnAmount;
      }
    }

    if (status === 'success' && collectAmount > 0) {
      const receiptLines = hasSplitAmounts
        ? [
            { method: 'cash', amount: cashAmount, note: note || `App giao hàng thu tiền mặt đơn ${orderCode(order)}` },
            { method: 'transfer', amount: bankAmount, note: note || `App giao hàng thu chuyển khoản đơn ${orderCode(order)}` }
          ].filter(line => line.amount > 0)
        : [{ method, amount: legacyCollectAmount, note: note || `App giao hàng thu ${method === 'transfer' ? 'chuyển khoản' : 'tiền mặt'} đơn ${orderCode(order)}` }];
      for (const line of receiptLines) {
        const receipt = await Receipt.create({
          id: makeId('RC'),
          code: buildCode('RC'),
          date: new Date().toISOString().slice(0, 10),
          customerId: order.customerId || '',
          customerCode: order.customerCode || '',
          customerName: order.customerName || '',
          method: line.method,
          amount: line.amount,
          status: 'active',
          source: 'mobile_delivery',
          refType: 'salesOrder',
          refId: getDocId(order),
          refCode: orderCode(order),
          staffCode: req.mobileUser.code || '',
          staffName: req.mobileUser.name || '',
          note: line.note,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        const bookModel = line.method === 'transfer' ? Bankbook : Cashbook;
        await bookModel.create({
          id: makeId(line.method === 'transfer' ? 'BB' : 'CB'),
          code: buildCode(line.method === 'transfer' ? 'BB' : 'CB'),
          date: new Date().toISOString().slice(0, 10),
          type: 'in',
          source: 'mobile_delivery_receipt',
          refType: 'receipt',
          refId: getDocId(receipt),
          refCode: receipt.code,
          customerCode: order.customerCode || '',
          customerName: order.customerName || '',
          staffCode: req.mobileUser.code || '',
          staffName: req.mobileUser.name || '',
          amount: line.amount,
          note: receipt.note,
          createdAt: new Date().toISOString()
        });
      }
      if (hasSplitAmounts) {
        order.cashCollected = toNumber(order.cashCollected) + cashAmount;
        order.bankCollected = toNumber(order.bankCollected) + bankAmount;
        order.rewardAmount = toNumber(order.rewardAmount) + rewardAmount;
        order.paidAmount = toNumber(order.paidAmount) + cashAmount + bankAmount;
      } else {
        order.paidAmount = toNumber(order.paidAmount) + legacyCollectAmount;
        if (method === 'transfer') order.bankCollected = toNumber(order.bankCollected) + legacyCollectAmount;
        else order.cashCollected = toNumber(order.cashCollected) + legacyCollectAmount;
      }
      order.debtBeforeCollection = deliveryDebtBase(order);
      order.debtAmount = calculateDeliveryDebt(order);
      order.debt = order.debtAmount;
    }

    await order.save();
    return ok(res, { message: 'Đã cập nhật trạng thái giao hàng', order: stripMongoFields(order.toObject()) });
  } catch (err) {
    return fail(res, 500, err.message || 'Không cập nhật được giao hàng mobile');
  }
});

router.post('/delivery/return', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const order = await findOrderByIdOrCode(req.body?.orderId);
    if (!order) return fail(res, 404, 'Không tìm thấy đơn giao hàng');
    const returnType = String(req.body?.returnType || 'partial') === 'full' ? 'full' : 'partial';
    const sourceItems = Array.isArray(order.items) ? order.items : [];
    const reqItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = returnType === 'full'
      ? sourceItems.map((item) => ({ ...item, qtyReturn: toNumber(item.quantity || item.qty), reason: req.body?.note || '' }))
      : reqItems.filter((item) => toNumber(item.qtyReturn) > 0);
    if (!items.length) return fail(res, 400, returnType === 'full' ? 'Đơn không có hàng để trả' : 'Chưa chọn sản phẩm/số lượng trả');

    // Idempotent: 1 đơn giao chỉ có 1 returnOrder. Lưu lại là cập nhật phiếu cũ.
    const returnOrder = await upsertMobileReturnOrder(order, items, req, returnType);
    const returnAmount = toNumber(returnOrder.totalAmount || returnOrder.amount || 0);
    order.returnAmount = returnAmount;
    order.returnedAmount = returnAmount;
    order.debtBeforeCollection = deliveryDebtBase(order);
    order.debtAmount = calculateDeliveryDebt(order);
    order.debt = order.debtAmount;
    order.deliveryStatus = returnType === 'full' ? 'returned' : 'partial_return';
    order.status = returnType === 'full' ? 'returned' : 'partial_return';
    order.updatedAt = new Date().toISOString();
    await order.save();
    return ok(res, { message: returnType === 'full' ? 'Đã tạo/cập nhật phiếu trả cả đơn' : 'Đã tạo/cập nhật phiếu trả hàng một phần', returnOrder: stripMongoFields(returnOrder.toObject ? returnOrder.toObject() : returnOrder), order: stripMongoFields(order.toObject()) }, 201);
  } catch (err) {
    return fail(res, 500, err.message || 'Không tạo được phiếu trả hàng từ app giao hàng');
  }
});

router.post('/cash/submit', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const amount = toNumber(req.body?.amount);
    if (amount <= 0) return fail(res, 400, 'Số tiền nộp quỹ phải lớn hơn 0');
    const entry = await Cashbook.create({
      id: makeId('CB'),
      code: buildCode('CB'),
      date: new Date().toISOString().slice(0, 10),
      type: 'in',
      source: 'mobile_cash_submit',
      refType: 'cashSubmit',
      staffCode: req.mobileUser.code || '',
      staffName: req.mobileUser.name || '',
      amount,
      note: String(req.body?.note || '').trim() || `Nhân viên ${req.mobileUser.name || ''} nộp tiền về quỹ`,
      createdAt: new Date().toISOString()
    });
    return ok(res, { message: 'Đã ghi nhận nộp tiền về quỹ', entry: stripMongoFields(entry.toObject()) }, 201);
  } catch (err) {
    return fail(res, 500, err.message || 'Không ghi nhận được nộp quỹ mobile');
  }
});

// Tương thích với URL cũ app từng gọi: /api/mobile/delivery-orders
router.get('/delivery-orders', requireMobileLogin, requireMobileRole(['delivery', 'admin']), (req, res, next) => {
  req.url = `/delivery/orders${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  return router.handle(req, res, next);
});


function registerMobileRoutes(app) {
  app.use('/api/mobile', router);
}

function createMobileRouter() {
  return router;
}

router.registerMobileRoutes = registerMobileRoutes;
router.createMobileRouter = createMobileRouter;

module.exports = router;
module.exports.registerMobileRoutes = registerMobileRoutes;
module.exports.createMobileRouter = createMobileRouter;
