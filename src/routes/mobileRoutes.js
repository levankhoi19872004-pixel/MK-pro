'use strict';

const { normalizeText } = require('../utils/search.util');
const { normalizeOrderCodes } = require('../utils/orderKey.util');

const deliveryFinance = require('../utils/deliveryFinance.util');
const { normalizeDeliveryMoney, readDeliveryMoney } = require('../utils/deliveryMoney.util');

const dateUtil = require('../utils/date.util');
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
const { verifyPassword } = require('../security/passwordPolicy');

const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Staff = require('../models/Staff');
const User = require('../models/User');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const Receipt = require('../models/Receipt');
const ReturnOrder = require('../models/ReturnOrder');
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
const ArLedger = require('../models/ArLedger');
const Cashbook = require('../models/Cashbook');
const Bankbook = require('../models/Bankbook');
const { makeId, toNumber, stripMongoFields } = require('../utils/common.util');
const inventoryService = require('../services/inventoryService');
const InventoryPostingService = require('../domain/posting/InventoryPostingService');
const { withMongoTransaction } = require('../utils/transaction.util');
const searchService = require('../services/searchService');
const returnOrderService = require('../services/returnOrderService');
const postingEngine = require('../engines/posting.engine');
const { DeliveryEngine } = require('../engines/delivery.engine');
const financialService = require('../services/financialService');
const masterOrderService = require('../services/masterOrderService');
const reportService = require('../services/reportService');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const inventoryStockService = require('../services/inventoryStock.service');

const router = express.Router();

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  warehouse: 'Kho',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};

const ACCESS_TOKEN_EXPIRES_IN = process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN || '1d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.MOBILE_REFRESH_TOKEN_EXPIRES_IN || '30d';

function jwtSecret() {
  const secret = [process.env.JWT_SECRET, process.env.MOBILE_JWT_SECRET].find(Boolean);
  if (!secret) {
    throw new Error('Missing JWT_SECRET');
  }
  return secret;
}


function mobileStockPostedPatch(order = {}, actor = '') {
  const now = new Date().toISOString();
  return {
    stockPosted: true,
    stockPostedAt: order.stockPostedAt || now,
    stockPostedBy: order.stockPostedBy || actor || 'mobile_sales'
  };
}

function isMobileSalesStockPosted(order = {}) {
  const stockStatus = String(order.stockStatus || order.inventoryStatus || '').toLowerCase();
  return Boolean(order.stockPosted) || ['posted', 'confirmed', 'locked'].includes(stockStatus);
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
  const role = ['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery'].includes(String(staff.role || staff.type || '').trim())
    ? String(staff.role || staff.type).trim()
    : (staff.isDelivery ? 'delivery' : staff.isSalesman ? 'sales' : 'sales');
  const staffCode = String(staff.staffCode || staff.code || '').trim();
  const fullName = String(staff.fullName || staff.name || staff.username || staffCode).trim();
  return {
    id: String(staff.id || staff._id || staffCode).trim(),
    code: staffCode,
    staffCode,
    username: String(staff.username || staffCode).trim(),
    name: fullName,
    fullName,
    role,
    roleLabel: ROLE_LABELS[role] || role
  };
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


function createCanonicalDeliveryEngine() {
  return new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, ArLedger, User: Staff });
}

// V46 canonical bridge: giữ /api/mobile/delivery/* để tương thích app cũ,
// nhưng toàn bộ business logic đi qua DeliveryEngine giống /api/delivery/*.
router.get('/delivery/orders', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const mobileUser = req.mobileUser || {};
    const boundQuery = mobileUser.role === 'delivery'
      ? { ...(req.query || {}), deliveryStaffCode: mobileUser.staffCode || mobileUser.code, deliveryStaffName: mobileUser.fullName || mobileUser.name }
      : { ...(req.query || {}) };
    const result = await createCanonicalDeliveryEngine().listOrders(boundQuery);
    return ok(res, { source: 'delivery-engine-mobile-bridge', orders: result.rows, rows: result.rows, items: result.rows, total: result.rows.length, summary: result.summary, reconciliation: result.reconciliation });
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Không tải được đơn giao hàng mobile');
  }
});

router.get('/delivery/returns', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const mobileUser = req.mobileUser || {};
    const boundQuery = mobileUser.role === 'delivery'
      ? { ...(req.query || {}), deliveryStaffCode: mobileUser.staffCode || mobileUser.code, deliveryStaffName: mobileUser.fullName || mobileUser.name }
      : { ...(req.query || {}) };
    const result = await createCanonicalDeliveryEngine().listReturns(boundQuery);
    return ok(res, { source: 'returnOrders', returns: result.rows, returnOrders: result.rows, rows: result.rows, total: result.rows.length, summary: result.summary });
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Không tải được hàng trả mobile');
  }
});

router.post('/delivery/return', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const result = await createCanonicalDeliveryEngine().saveReturn({
      ...(req.body || {}),
      orderId: req.body?.orderId || req.body?.salesOrderId || req.body?.orderCode || req.body?.salesOrderCode,
      salesOrderId: req.body?.salesOrderId || req.body?.orderId,
      salesOrderCode: req.body?.salesOrderCode || req.body?.orderCode,
      deliveryStaffCode: req.mobileUser?.role === 'delivery' ? (req.mobileUser?.staffCode || req.mobileUser?.code) : (req.body?.deliveryStaffCode || req.mobileUser?.staffCode || req.mobileUser?.code),
      deliveryStaffName: req.mobileUser?.role === 'delivery' ? (req.mobileUser?.fullName || req.mobileUser?.name) : (req.body?.deliveryStaffName || req.mobileUser?.fullName || req.mobileUser?.name),
      source: 'mobile_delivery_engine_bridge'
    });
    const rows = result.rows || result.returns || result.returnOrders || [];
    return ok(res, { source: 'returnOrders', message: result.message, returnOrder: stripMongoFields(result.returnOrder || {}), returns: rows, returnOrders: rows, rows, order: stripMongoFields(result.order || {}) });
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Không tạo được phiếu trả hàng từ app giao hàng');
  }
});

router.post('/delivery/payment', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const mobileUser = req.mobileUser || {};
    const body = mobileUser.role === 'delivery'
      ? { ...(req.body || {}), deliveryStaffCode: mobileUser.staffCode || mobileUser.code, deliveryStaffName: mobileUser.fullName || mobileUser.name, staffCode: mobileUser.staffCode || mobileUser.code, staffName: mobileUser.fullName || mobileUser.name }
      : { ...(req.body || {}) };

    // MK-SCOPED-FIX: MOBILE_PAYMENT_ACCOUNTING_LOCK_START
    // Chặn ngay tại mobile route trước khi gọi DeliveryEngine để tránh ghi tiền vào SalesOrder
    // khi đơn đã xác nhận kế toán nhưng chưa được admin mở khóa.
    const paymentKey = String(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode || '').trim();
    if (paymentKey) {
      const currentOrder = await SalesOrder.findOne({
        $or: [
          { id: paymentKey },
          { code: paymentKey },
          { orderCode: paymentKey },
          { salesOrderCode: paymentKey },
          { documentCode: paymentKey }
        ]
      }).lean();
      if (isAccountingLockedForMobilePayment(currentOrder)) {
        return fail(res, 423, 'Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền');
      }
    }
    // MK-SCOPED-FIX: MOBILE_PAYMENT_ACCOUNTING_LOCK_END

    const result = await createCanonicalDeliveryEngine().savePayment(body);
    return ok(res, { source: 'delivery-engine-mobile-bridge', message: result.message, order: result.order, allocation: result.allocation });
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Không lưu được tiền thu app giao hàng');
  }
});

router.post('/delivery/confirm', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const mobileUser = req.mobileUser || {};
    const body = mobileUser.role === 'delivery'
      ? { ...(req.body || {}), deliveryStaffCode: mobileUser.staffCode || mobileUser.code, deliveryStaffName: mobileUser.fullName || mobileUser.name, staffCode: mobileUser.staffCode || mobileUser.code, staffName: mobileUser.fullName || mobileUser.name }
      : { ...(req.body || {}) };
    const result = await createCanonicalDeliveryEngine().confirm(body);
    return ok(res, { source: 'delivery-engine-mobile-bridge', message: result.message, order: result.order });
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Không cập nhật được giao hàng mobile');
  }
});

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
  return rows.reduce((sum, row) => sum + inventoryStockService.quantityOf(row), 0);
}

async function getOpenSaleQty(product) {
  const code = productCodeOf(product);
  if (!code) return 0;
  const stock = await inventoryStockService.getAvailableStock(code);
  return toNumber(stock.availableQty);
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
  return dateUtil.toDateOnly(order.deliveryDate || order.ngayGiao || order.shipDate || order.orderDate || order.date);
}

function toCleanDocKey(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    const picked =
  value.code ??
  value.orderCode ??
  value.salesOrderCode ??
  value.id ??
  value.orderId ??
  value.salesOrderId;
    return picked == null ? '' : String(picked).trim();
  }
  const text = String(value).trim();
  if (!text || text === '[object Object]') return '';
  return text;
}

function compactKeys(values = []) {
  return [...new Set((values || []).map(toCleanDocKey).filter(Boolean))];
}


const VALID_SALES_ORDER_ID_RE = /^SO\d+$/i;

function normalizeSalesOrderIds(ids = []) {
  return Array.from(new Set((ids || [])
    .map((value) => String(value || '').trim())
    .filter((value) => VALID_SALES_ORDER_ID_RE.test(value))));
}

function buildSalesOrderIdInQuery(ids = []) {
  const cleanIds = normalizeSalesOrderIds(ids);
  return { id: { $in: cleanIds } };
}

function masterChildIds(master) {
  const raw = master.childOrderIds || master.childOrders || master.orderIds || master.orders || [];
  return Array.isArray(raw) ? compactKeys(raw) : [];
}

function orderIdKeys(order = {}) {
  return compactKeys([
    order.id,
    order.salesOrderId,
    order.orderId
  ]);
}

function orderCodeKeys(order = {}) {
  return compactKeys([order.code, order.orderNo, order.orderCode, order.salesOrderCode]);
}

function buildSalesOrderLookupKeys(order = {}) {
  return compactKeys([...orderIdKeys(order), ...orderCodeKeys(order)]);
}

function buildReturnOrderFilter(orderIds = [], orderCodeValues = []) {
  const orderCodes = normalizeOrderCodes([
    ...orderIds,
    ...orderCodeValues
  ]);

  if (!orderCodes.length) return null;

  return {
    status: { $in: ACTIVE_RETURN_ORDER_STATUSES },
    $or: [
      {
        salesOrderId: {
          $in: orderCodes
        }
      },
      {
        salesOrderCode: {
          $in: orderCodes
        }
      }
    ]
  };
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




function isDeliveryCompletedStatus(status) {
  return ['delivered', 'success', 'completed', 'done'].includes(String(status || '').toLowerCase());
}

function isAccountingConfirmedForAR(row = {}) {
  const accountingStatus = String(row.accountingStatus || '').toLowerCase();
  return Boolean(row.accountingConfirmed) || ['confirmed', 'locked', 'posted'].includes(accountingStatus);
}

// MK-SCOPED-FIX: MOBILE_PAYMENT_ACCOUNTING_LOCK_HELPERS_START
// Helper riêng cho route lưu tiền mobile: phân biệt đơn đã khóa kế toán và đơn admin đã mở khóa.
function isAccountingReopenPendingForMobile(row = {}) {
  const accountingStatus = String(row.accountingStatus || '').toLowerCase();
  return Boolean(row.accountingNeedsReconfirm || row.needReAccounting || row.reAccountingRequired || row.adminAdjustmentOpen)
    || ['reopened', 'needs_reconfirm', 'needs_repost'].includes(accountingStatus);
}

function isAccountingLockedForMobilePayment(row = {}) {
  if (!row || isAccountingReopenPendingForMobile(row)) return false;
  return isAccountingConfirmedForAR(row) || Boolean(row.accountingLocked || row.editLocked);
}
// MK-SCOPED-FIX: MOBILE_PAYMENT_ACCOUNTING_LOCK_HELPERS_END

function applyOrderDebtLifecycle(order) {
  const debtAmount = Math.max(0, normalizeDebtAmount(order.debtAmount ?? order.debt ?? 0));
  if (isDeliveryCompletedStatus(order.deliveryStatus || order.status)) {
    order.arBalance = debtAmount;
    if (isAccountingConfirmedForAR(order)) {
      order.arStatus = hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid';
      order.lifecycleStatus = hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid';
    } else {
      order.arStatus = 'pending_accounting';
      order.lifecycleStatus = 'pending_accounting';
      order.arPostedAt = '';
    }
  } else {
    order.arStatus = order.arStatus || 'not_posted';
    order.lifecycleStatus = order.lifecycleStatus || 'assigned_delivery';
  }
  return order;
}

async function postDeliveryArForMobile(order) {
  // App giao hàng chỉ ghi nhận trạng thái giao/thu tiền tạm thời.
  // AR-SALE chỉ được post khi kế toán bấm "Xác nhận của kế toán" ở báo cáo giao hàng.
  return null;
}


function isActiveReturnOrder(row = {}) {
  const status = normalizeText(row.status || row.state || row.returnStatus);
  return !['cancelled', 'canceled', 'void', 'deleted', 'removed', 'inactive', 'archived', 'cleared'].includes(status);
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
  return compactKeys([
    ...buildSalesOrderLookupKeys(order),
    ...buildSalesOrderLookupKeys(masterChild || {}),
    getDocId(master),
    masterCode(master),
    master?.orderNo,
    master?.masterOrderNo
  ]);
}

function returnOrderMatchesOrder(row = {}, order = {}, master = null, masterChild = null) {
  if (!isActiveReturnOrder(row)) return false;
  const keys = orderMatchKeys(order, master, masterChild);
  const rowKeys = compactKeys([
    row.salesOrderId,
    row.salesOrderCode
  ]);
  if (rowKeys.some((key) => keys.includes(key))) return true;

  // Fallback an toàn cho dữ liệu cũ: cùng khách + cùng ngày + cùng mã đơn hiển thị trong ghi chú.
  const rowCustomer = String(row.customerCode || '').trim();
  const orderCustomer = String(order.customerCode || masterChild?.customerCode || '').trim();
  const rowDate = dateUtil.toDateOnly(row.date || row.documentDate || row.returnDate);
  const deliveryDate = dateUtil.toDateOnly(orderDeliveryDate(order) || orderDeliveryDate(masterChild || {}) || master?.deliveryDate);
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
  return `RO-${String(orderCode(order) || getDocId(order)).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
  const result = await returnOrderService.upsertDeliveryReturnOrder({
    id: stableId,
    date: dateUtil.toDateOnly(now),
    documentDate: dateUtil.toDateOnly(now),
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
    source: 'mobile_delivery',
    accountingStatus: 'pending',
    accountingConfirmed: false,
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
    status: { $in: ACTIVE_RETURN_ORDER_STATUSES },
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

  // duplicate cancellation removed; handled by returnOrderService upsert
return saved;
}

function buildDebtMapKey(value) {
  return String(value || '').trim();
}

function putDebtMapEntry(map, row = {}) {
  if (!row) return;
  const keys = [row.orderId, row.orderCode, row.id, row.code]
    .map(buildDebtMapKey)
    .filter(Boolean);
  keys.forEach((key) => map.set(key, row));
}

async function buildArDebtMapForOrders(orders = []) {
  const map = new Map();
  const orderIds = compactKeys((orders || []).flatMap((order) => orderIdKeys(order)));
  const orderCodes = compactKeys((orders || []).flatMap((order) => orderCodeKeys(order)));

  const or = [];
  if (orderIds.length) or.push({ salesOrderId: { $in: orderIds } });
  if (orderCodes.length) or.push({ salesOrderCode: { $in: orderCodes } });
  if (!or.length) return map;

  const wanted = new Set([...orderIds, ...orderCodes]);

  try {
    // Query AR theo 2 khóa chuẩn salesOrderId/salesOrderCode để tránh 6 nhánh OR làm Mongo scan chậm.
    const rows = await ArLedger.find({ $or: or }).lean();

    const balanceByKey = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
      const rowKeys = compactKeys([row.salesOrderId, row.salesOrderCode]);
      if (!rowKeys.length) continue;

      let delta = toNumber(row.debit) - toNumber(row.credit);
      if (!delta && row.amount !== undefined) {
        const type = normalizeText(row.type || row.refType || row.source);
        const amount = toNumber(row.amount);
        delta = ['receipt', 'payment', 'ar-receipt', 'ar_bonus', 'ar-bonus', 'ar_discount', 'ar-discount', 'ar_allowance', 'ar-allowance', 'return', 'sales_return'].some((name) => type.includes(name))
          ? -amount
          : amount;
      }

      for (const key of rowKeys) {
        if (!wanted.has(key)) continue;
        balanceByKey.set(key, toNumber(balanceByKey.get(key)) + delta);
      }
    }

    for (const key of wanted) {
      if (!balanceByKey.has(key)) continue;
      const debt = normalizeDebtAmount(Math.max(0, toNumber(balanceByKey.get(key))));
      const row = { orderId: key, orderCode: key, id: key, code: key, debt, source: 'ar_ledger_batch' };
      map.set(key, row);
    }
  } catch (err) {
    // Nếu AR lỗi, app vẫn fallback về công thức tạm tính từ đơn để không làm vỡ luồng giao hàng.
  }

  return map;
}


function findArDebtRow(arDebtMap, order = {}, sourceOrder = {}) {
  if (!arDebtMap || !arDebtMap.size) return null;
  const keys = orderMatchKeys(order, sourceOrder);
  for (const key of keys) {
    const row = arDebtMap.get(String(key || '').trim());
    if (row) return row;
  }
  return null;
}

function buildDeliveryRow(order, customer, master, date, returnOrders = [], masterChild = null, arDebtMap = null) {
  // MasterOrder.children chỉ là snapshot tại lúc gộp đơn.
  // Các trường thanh toán/trạng thái sau khi app bấm Lưu phải lấy từ SalesOrder thật,
  // nếu không snapshot cũ sẽ ghi đè cashCollected/bankCollected/rewardAmount về 0.
  const hasMasterItems = masterChild && Array.isArray(masterChild.items) && masterChild.items.length;
  const sourceOrder = hasMasterItems
    ? { ...masterChild, ...stripMongoFields(order), id: getDocId(order) || masterChild.id, items: masterChild.items }
    : order;
  const returnItems = mergeReturnItemsFromOrders(returnOrders, order, master, masterChild);
  const syncedReturnAmount = returnItems.reduce((sum, item) => sum + toNumber(item.amount ?? returnLineQty(item) * returnLinePrice(item)), 0);
  const totalAmount = toNumber(sourceOrder.totalAmount || sourceOrder.amount || sourceOrder.grandTotal || sourceOrder.payableAmount);
  const paidAmount = toNumber(sourceOrder.paidAmount || sourceOrder.paid || sourceOrder.collectedAmount);
  const money = readDeliveryMoney(sourceOrder);
  const cashCollected = money.cashAmount;
  const bankCollected = money.bankAmount;
  // returnOrders là nguồn sự thật duy nhất cho tiền/số lượng hàng trả.
  const returnAmount = syncedReturnAmount;
  const rewardAmount = money.rewardAmount;
  const debtBeforeCollection = deliveryFinance.deliveryDebtBase({ ...sourceOrder, totalAmount });
  const arDebtRow = findArDebtRow(arDebtMap, order, sourceOrder);
  const formulaDebtAmount = deliveryFinance.calculateDeliveryDebt({ debtBeforeCollection, cashAmount: cashCollected, bankAmount: bankCollected, returnAmount, rewardAmount });
  // Nếu đã có bút toán AR cho đơn này thì dùng AR Ledger làm nguồn hiển thị công nợ duy nhất.
  // Nếu chưa có AR thì vẫn dùng công thức tạm tính để NVGH biết còn phải thu bao nhiêu trước khi đẩy kế toán.
  const debtAmount = arDebtRow ? normalizeDebtAmount(arDebtRow.debt) : formulaDebtAmount;
  const debtSource = arDebtRow ? 'ar_ledger' : 'delivery_formula';
  const itemSource = Array.isArray(sourceOrder.items) ? sourceOrder.items : [];
  return {
    id: getDocId(order),
    code: orderCode(sourceOrder) || orderCode(order),
    masterOrderId: getDocId(master),
    masterOrderCode: master?.code || master?.masterOrderNo || '',
    deliveryDate: orderDeliveryDate(sourceOrder) || dateUtil.toDateOnly(master?.deliveryDate || date),
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
    arBalance: debtAmount,
    arDebtAmount: debtAmount,
    debtSource,
    arLedgerSynced: Boolean(arDebtRow),
    debtBeforeCollection,
    cashAmount: cashCollected,
    bankAmount: bankCollected,
    rewardAmount,
    cashCollected,
    bankCollected,
    bonusAmount: rewardAmount,
    displayRewardAmount: rewardAmount,
    returnAmount,
    returnedAmount: returnAmount,
    returnItems,
    deliveryReturnItems: returnItems,
    status: sourceOrder.status || '',
    items: mergeOrderItemsWithReturnItems({ items: itemSource }, returnItems)
  };
}

function buildCode(prefix) {
  const d = new Date();
  const ymd = dateUtil.toDateOnly(d).replace(/-/g, '');
  return `${prefix}${ymd}${String(d.getTime()).slice(-6)}`;
}

async function findOrderByIdOrCode(idOrCode) {
  const key = toCleanDocKey(idOrCode);
  if (!key) return null;

  // Ưu tiên 2 khóa chuẩn có index. Chỉ fallback các khóa cũ khi thật sự không thấy.
  let order = await SalesOrder.findOne({ id: key });
  if (order) return order;

  order = await SalesOrder.findOne({ code: key });
  if (order) return order;

  order = await SalesOrder.findOne({ orderCode: key });
  if (order) return order;

  order = await SalesOrder.findOne({ orderNo: key });
  if (order) return order;

  if (key.match(/^[a-f\d]{24}$/i)) {
    return SalesOrder.findById(key);
  }
  return null;
}



function deliveryPaymentPatchFromOrder(order = {}) {
  const money = readDeliveryMoney(order);
  const cash = money.cashAmount;
  const bank = money.bankAmount;
  const reward = money.rewardAmount;
  const debtBeforeCollection = deliveryFinance.deliveryDebtBase(order);
  const returnAmount = toNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  const debtAmount = deliveryFinance.calculateDeliveryDebt({ debtBeforeCollection, cashAmount: cash, bankAmount: bank, returnAmount, rewardAmount: reward });
  return {
    deliveryDate: dateUtil.toDateOnly(order.deliveryDate || order.date || dateUtil.todayVN()),
    deliveryStatus: order.deliveryStatus || 'delivered',
    status: order.status || 'delivered',
    deliveryStaffCode: order.deliveryStaffCode || '',
    deliveryStaffName: order.deliveryStaffName || '',
    routeName: order.routeName || order.deliveryRoute || '',
    deliveryRoute: order.deliveryRoute || order.routeName || '',
    debtBeforeCollection,
    cashAmount: cash,
    bankAmount: bank,
    rewardAmount: reward,
    returnAmount,
    returnedAmount: returnAmount,
    paidAmount: cash + bank,
    collectedAmount: cash + bank,
    debtAmount,
    debt: debtAmount,
    arBalance: debtAmount,
    deliveryNote: order.deliveryNote || '',
    deliveredAt: order.deliveredAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}


function orderIdentityKeys(...sources) {
  return compactKeys(sources.flatMap((source) => {
    if (!source || typeof source !== 'object') return [source];
    return [
      source.id,
      source._id,
      source.code,
      source.orderNo,
      source.orderCode,
      source.documentCode,
      source.salesOrderId,
      source.salesOrderCode
    ];
  }));
}

async function activeReturnSummaryForOrder(order = {}) {
  const keys = orderIdentityKeys(order);
  if (!keys.length) return { items: [], amount: 0, returnOrder: null };
  const orderIds = compactKeys([order.id, order._id, order.salesOrderId, order.orderId]);
  const orderCodes = compactKeys([order.code, order.orderNo, order.orderCode, order.salesOrderCode, order.documentCode]);
  const filter = buildReturnOrderFilter(orderIds.length ? orderIds : keys, orderCodes.length ? orderCodes : keys);
  const rows = filter
    ? await ReturnOrder.find(filter).sort({ updatedAt: -1, createdAt: -1 }).lean()
    : [];
  const active = rows.find((row) => ACTIVE_RETURN_ORDER_STATUSES.includes(String(row.status || '').toLowerCase())) || null;
  const items = Array.isArray(active?.items) ? active.items : [];
  const amount = items.length
    ? items.reduce((sum, item) => sum + toNumber(item.amount ?? returnLineQty(item) * returnLinePrice(item)), 0)
    : toNumber(active?.totalAmount ?? active?.amount ?? active?.debtReduction ?? 0);
  return { items, amount, returnOrder: active };
}

async function activeReturnItemsForOrder(order = {}) {
  return (await activeReturnSummaryForOrder(order)).items;
}

function isReturnOrderLockedForMobile(row = {}) {
  const status = String(row.status || '').toLowerCase();
  const warehouseStatus = String(row.warehouseReceiveStatus || '').toLowerCase();
  const mergeStatus = String(row.returnMergeStatus || '').toLowerCase();
  return Boolean(
    mergeStatus === 'merged'
    || row.masterReturnOrderId
    || row.masterReturnOrderCode
    || ['posted', 'received', 'warehouse_received', 'completed'].includes(status)
    || warehouseStatus === 'received'
  );
}

async function clearMobileReturnOrderForSalesOrder(order = {}, note = '') {
  const active = await activeReturnSummaryForOrder(order);
  const returnOrder = active.returnOrder;
  if (returnOrder && isReturnOrderLockedForMobile(returnOrder)) {
    throw new Error('Phiếu trả hàng đã gộp đơn tổng/kho đã nhận/đã ghi sổ, không được sửa từ app giao hàng');
  }
  const result = await returnOrderService.upsertDeliveryReturnOrder({
    id: returnOrder?.id || stableReturnIdForOrder(order),
    code: returnOrder?.code || '',
    salesOrderId: getDocId(order),
    salesOrderCode: orderCode(order),
    orderId: getDocId(order),
    orderCode: orderCode(order),
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    deliveryStaffCode: order.deliveryStaffCode || '',
    deliveryStaffName: order.deliveryStaffName || '',
    staffCode: order.deliveryStaffCode || '',
    staffName: order.deliveryStaffName || '',
    date: dateUtil.todayVN(),
    items: [],
    note: String(note || '').trim() || 'NVGH sửa số lượng hàng trả về 0 trên app giao hàng',
    source: 'mobile_delivery',
    refType: 'mobileDeliveryReturnClear',
    returnType: 'partial'
  });
  if (result?.error) {
    const err = new Error(result.error);
    err.status = result.status || 400;
    throw err;
  }
  return { cleared: true, returnOrder: result.returnOrder || null };
}
async function saveDeliveryPaymentCanonical(order, requestOrderId = '', options = {}) {
  const keys = orderIdentityKeys(requestOrderId, order);
  const patch = deliveryPaymentPatchFromOrder(order);
  const forceSyncReturn = Boolean(options && options.syncReturn);
  const objectIds = keys.filter((key) => /^[a-f\d]{24}$/i.test(key));
  const filter = {
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { orderNo: { $in: keys } },
      { orderCode: { $in: keys } },
      { documentCode: { $in: keys } },
      ...(objectIds.length ? [{ _id: { $in: objectIds } }] : [])
    ]
  };

  // Ghi đúng nguồn mà màn web “Đơn giao hôm nay” đang dùng: SalesOrder thật.
  // Nếu app vừa tạo phiếu trả, returnOrders mới là nguồn chuẩn; phải kéo lại trước khi lưu tiền.
  let canonicalReturnItems = Array.isArray(order.returnItems) && order.returnItems.length
    ? order.returnItems
    : (Array.isArray(order.deliveryReturnItems) && order.deliveryReturnItems.length ? order.deliveryReturnItems : []);
  let canonicalReturnAmount = toNumber(patch.returnAmount);
  const activeReturnSummary = await activeReturnSummaryForOrder({ ...order.toObject?.() || order, ...patch });
  if (activeReturnSummary.items.length) {
    canonicalReturnItems = activeReturnSummary.items;
    canonicalReturnAmount = activeReturnSummary.amount;
  }
  const shouldSyncReturn = forceSyncReturn || Boolean(activeReturnSummary.returnOrder);
  if (shouldSyncReturn) {
    canonicalReturnItems = activeReturnSummary.returnOrder ? activeReturnSummary.items : canonicalReturnItems;
    canonicalReturnAmount = activeReturnSummary.returnOrder ? activeReturnSummary.amount : canonicalReturnAmount;
    patch.returnAmount = canonicalReturnAmount;
    patch.returnedAmount = canonicalReturnAmount;
    patch.returnItems = canonicalReturnItems;
    patch.deliveryReturnItems = canonicalReturnItems;
    patch.debtAmount = deliveryFinance.calculateDeliveryDebt({ ...order.toObject?.() || order, ...patch, returnAmount: canonicalReturnAmount });
    patch.debt = patch.debtAmount;
    patch.arBalance = patch.debtAmount;
  } else {
    // returnOrders là nguồn thật. Nếu request chỉ lưu tiền và không có phiếu trả đang hiệu lực,
    // không được đẩy returnItems/returnAmount cũ trong SalesOrder hoặc snapshot lên ghi đè hiển thị.
    delete patch.returnAmount;
    delete patch.returnedAmount;
    delete patch.returnItems;
    delete patch.deliveryReturnItems;
    patch.debtAmount = deliveryFinance.calculateDeliveryDebt({ ...order.toObject?.() || order, ...patch, returnAmount: 0 });
    patch.debt = patch.debtAmount;
    patch.arBalance = patch.debtAmount;
  }
  await SalesOrder.updateOne(filter, { $set: patch });

  const snapshotOrder = {
    ...(order.toObject?.() || order),
    ...patch,
    id: order.id,
    _id: order._id,
    code: order.code,
    orderNo: order.orderNo,
    orderCode: order.orderCode
  };

  // Tối ưu tốc độ mobile: request chỉ ghi SalesOrder chuẩn rồi trả về ngay.
  // Đồng bộ snapshot đơn tổng và service web chạy nền vì đây là dữ liệu hiển thị phụ.
  runMobileDeliveryBackgroundTask('sync-master-delivery-snapshot', async () => {
    // Dùng cùng service của phần mềm web để công thức công nợ/trạng thái thống nhất.
    // TUYỆT ĐỐI không truyền returnItems: [] từ app khi bấm lưu tiền, vì đó là lệnh xóa hàng trả.
    const servicePayload = {
      ...patch,
      orderId: keys[0] || getDocId(order)
    };
    if (shouldSyncReturn) {
      servicePayload.returnItems = canonicalReturnItems;
      servicePayload.deliveryReturnItems = canonicalReturnItems;
      servicePayload.returnAmount = canonicalReturnAmount;
      servicePayload.returnedAmount = canonicalReturnAmount;
    } else {
      delete servicePayload.returnItems;
      delete servicePayload.deliveryReturnItems;
      delete servicePayload.returnAmount;
      delete servicePayload.returnedAmount;
    }
    await masterOrderService.updateDeliveryTodayOrder(keys[0] || getDocId(order), servicePayload);
    await syncDeliveryPaymentToMasterSnapshot(snapshotOrder, keys, { syncReturn: shouldSyncReturn });
  });

  return snapshotOrder;
}

async function syncDeliveryPaymentToMasterSnapshot(order, extraKeys = [], options = {}) {
  const keys = orderIdentityKeys(...(Array.isArray(extraKeys) ? extraKeys : [extraKeys]), order);
  if (!keys.length) return;

  const masters = await MasterOrder.find({
    $or: [
      { childOrderIds: { $in: keys } },
      { childOrders: { $in: keys } },
      { orderIds: { $in: keys } },
      { orders: { $in: keys } },
      { 'children.id': { $in: keys } },
      { 'children.code': { $in: keys } },
      { 'children.orderId': { $in: keys } },
      { 'children.orderCode': { $in: keys } },
      { 'items.id': { $in: keys } },
      { 'items.code': { $in: keys } },
      { 'items.orderId': { $in: keys } },
      { 'items.orderCode': { $in: keys } }
    ]
  });

  const paymentPatch = {
    deliveryStatus: order.deliveryStatus,
    status: order.status,
    cashCollected: toNumber(order.cashCollected ?? order.cashAmount ?? 0),
    cashAmount: toNumber(order.cashCollected ?? order.cashAmount ?? 0),
    bankCollected: toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0),
    bankAmount: toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0),
    transferAmount: toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0),
    rewardAmount: toNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0),
    displayRewardAmount: toNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0),
    returnAmount: toNumber(order.returnAmount ?? order.returnedAmount ?? 0),
    returnedAmount: toNumber(order.returnAmount ?? order.returnedAmount ?? 0),
    returnItems: Array.isArray(order.returnItems) ? order.returnItems : [],
    deliveryReturnItems: Array.isArray(order.deliveryReturnItems) ? order.deliveryReturnItems : (Array.isArray(order.returnItems) ? order.returnItems : []),
    paidAmount: toNumber(order.paidAmount ?? order.collectedAmount ?? 0),
    collectedAmount: toNumber(order.collectedAmount ?? order.paidAmount ?? 0),
    debtBeforeCollection: deliveryFinance.deliveryDebtBase(order),
    debtAmount: toNumber(order.debtAmount ?? order.debt ?? order.arBalance ?? 0),
    debt: toNumber(order.debtAmount ?? order.debt ?? order.arBalance ?? 0),
    arBalance: toNumber(order.arBalance ?? order.debtAmount ?? order.debt ?? 0),
    deliveredAt: order.deliveredAt || '',
    deliveryNote: order.deliveryNote || '',
    updatedAt: new Date().toISOString()
  };

  if (!(options && options.syncReturn)) {
    delete paymentPatch.returnAmount;
    delete paymentPatch.returnedAmount;
    delete paymentPatch.returnItems;
    delete paymentPatch.deliveryReturnItems;
  }

  for (const master of masters) {
    let changed = false;
    for (const field of ['children', 'items']) {
      if (!Array.isArray(master[field])) continue;
      master[field] = master[field].map((child) => {
        const childKeys = [child?.id, child?._id, child?.code, child?.orderId, child?.orderCode]
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        if (!childKeys.some((key) => keys.includes(key))) return child;
        changed = true;
        return { ...child, ...paymentPatch };
      });
    }
    if (changed) {
      master.updatedAt = new Date().toISOString();
      await master.save();
    }
  }
}


function runMobileDeliveryBackgroundTask(label, task) {
  const runner = async () => {
    try {
      await task();
    } catch (err) {
      console.warn(`[mobile-delivery-background] ${label}:`, err && err.message ? err.message : err);
    }
  };
  if (typeof setImmediate === 'function') setImmediate(runner);
  else setTimeout(runner, 0);
}

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!username || !password) return fail(res, 400, 'Thiếu tài khoản hoặc mật khẩu');

    // V46 login chuẩn: App bán hàng, App giao hàng và phần mềm đều dùng collection users
    // được quản trị tại mục Hệ thống/Tài khoản. Không đăng nhập bằng collection staffs nữa.
    const staff = await User.findOne({
      isActive: { $ne: false },
      $or: [{ username }, { staffCode: username }, { code: username }, { phone: username }]
    }).lean();
    if (!staff || !(await verifyPassword(password, staff.password))) {
      return fail(res, 401, 'Sai tài khoản hoặc mật khẩu');
    }

    const user = buildSafeUser(staff);
    if (['sales', 'delivery'].includes(user.role) && !user.staffCode) {
      return fail(res, 400, 'Tài khoản chưa được gán mã nhân viên nghiệp vụ');
    }
    return ok(res, {
      source: 'mobile-users-auth-route',
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

function arCustomerKeys(row = {}) {
  return compactKeys([
    row.customerId,
    row.customerCode,
    row.customerName
  ]);
}

function arLedgerDelta(row = {}) {
  let debit = toNumber(row.debit);
  let credit = toNumber(row.credit);
  if (!debit && !credit && row.amount !== undefined) {
    const type = normalizeText(row.type || row.refType || row.source || row.description || '');
    const amount = toNumber(row.amount);
    const isCredit = ['receipt', 'payment', 'thu', 'ar-receipt', 'return', 'sales-return', 'bonus', 'discount', 'allowance'].some((name) => type.includes(name));
    if (isCredit) credit = amount;
    else debit = amount;
  }
  return { debit, credit, delta: debit - credit };
}

function arLedgerDate(row = {}) {
  return dateUtil.toDateOnly(row.date || row.documentDate || row.createdAt || row.updatedAt || '');
}

async function buildMobileSalesDebtItems(mobileUser = {}) {
  const user = mobileUser || {};
  const filter = {};
  if (String(user.role || '') === 'sales') {
    const staffCode = String(user.code || user.staffCode || '').trim();
    const staffName = String(user.name || user.fullName || '').trim();
    const staffOr = [];
    if (staffCode) staffOr.push({ salesStaffCode: staffCode }, { staffCode });
    if (staffName) staffOr.push({ salesStaffName: staffName }, { staffName });

    const orderStaffOr = [];
    if (staffCode) orderStaffOr.push({ salesStaffCode: staffCode }, { staffCode });
    if (staffName) orderStaffOr.push({ salesStaffName: staffName }, { staffName });
    if (orderStaffOr.length) {
      const assignedOrders = await SalesOrder.find({ $or: orderStaffOr })
        .select('customerId customerCode customerName')
        .limit(5000)
        .lean();
      const customerIds = compactKeys(assignedOrders.map((order) => order.customerId));
      const customerCodes = compactKeys(assignedOrders.map((order) => order.customerCode));
      const customerNames = compactKeys(assignedOrders.map((order) => order.customerName));
      if (customerIds.length) staffOr.push({ customerId: { $in: customerIds } });
      if (customerCodes.length) staffOr.push({ customerCode: { $in: customerCodes } });
      if (customerNames.length) staffOr.push({ customerName: { $in: customerNames } });
    }

    if (staffOr.length) filter.$or = staffOr;
  }

  const rows = await ArLedger.find(filter)
    .sort({ date: 1, documentDate: 1, createdAt: 1 })
    .limit(5000)
    .lean();

  const byCustomer = new Map();
  for (const row of rows) {
    const customerCode = String(row.customerCode || '').trim();
    const customerName = String(row.customerName || '').trim();
    const customerId = String(row.customerId || '').trim();
    const key = customerId || customerCode || customerName;
    if (!key) continue;

    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        customerId,
        customerCode,
        customerName,
        debtAmount: 0,
        orderCodes: new Set(),
        oldestDebtDate: '',
        ledgers: []
      });
    }

    const bucket = byCustomer.get(key);
    const date = arLedgerDate(row);
    const { debit, credit, delta } = arLedgerDelta(row);
    bucket.debtAmount += delta;
    if (row.salesOrderCode || row.refCode) bucket.orderCodes.add(String(row.salesOrderCode || row.refCode));
    if (delta > 0 && date && (!bucket.oldestDebtDate || String(date) < String(bucket.oldestDebtDate))) bucket.oldestDebtDate = date;
    bucket.ledgers.push({
      id: row.id || row._id,
      date,
      type: row.type || row.refType || '',
      refType: row.refType || '',
      salesOrderId: row.salesOrderId || '',
      salesOrderCode: row.salesOrderCode || row.refCode || '',
      debit,
      credit
    });
  }

  return Array.from(byCustomer.values())
    .map((item) => ({
      ...item,
      debtAmount: normalizeDebtAmount(Math.max(0, toNumber(item.debtAmount))),
      orderCount: item.orderCodes.size,
      orderCodes: Array.from(item.orderCodes)
    }))
    .filter((item) => hasOpenDebt(item.debtAmount))
    .sort((a, b) => toNumber(b.debtAmount) - toNumber(a.debtAmount));
}

function buildDebtMapByCustomer(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    for (const key of compactKeys([item.customerId, item.customerCode, item.customerName])) {
      map.set(key, item);
    }
  }
  return map;
}

function attachMobileCustomerDebt(items = [], debts = []) {
  const debtMap = buildDebtMapByCustomer(debts);
  return (Array.isArray(items) ? items : [])
    .map((customer) => {
      const matched = compactKeys([customer.id, customer._id, customer.customerId, customer.code, customer.customerCode, customer.name, customer.customerName])
        .map((key) => debtMap.get(key))
        .find(Boolean);
      return {
        ...customer,
        debtAmount: matched ? toNumber(matched.debtAmount) : 0,
        orderCount: matched ? toNumber(matched.orderCount) : 0,
        oldestDebtDate: matched ? matched.oldestDebtDate || '' : ''
      };
    })
    .sort((a, b) => toNumber(b.debtAmount) - toNumber(a.debtAmount));
}

async function attachMobileCustomerLastOrderDates(items = [], mobileUser = {}) {
  const rows = Array.isArray(items) ? items : [];
  const customerCodes = compactKeys(rows.map((c) => c.code || c.customerCode));
  const customerIds = compactKeys(rows.map((c) => c.id || c._id || c.customerId));
  if (!customerCodes.length && !customerIds.length) return rows;

  const filter = { $or: [] };
  if (customerCodes.length) filter.$or.push({ customerCode: { $in: customerCodes } });
  if (customerIds.length) filter.$or.push({ customerId: { $in: customerIds } });

  if (String(mobileUser.role || '') === 'sales') {
    const staffCode = String(mobileUser.code || mobileUser.staffCode || '').trim();
    const staffName = String(mobileUser.name || mobileUser.fullName || '').trim();
    const staffOr = [];
    if (staffCode) staffOr.push({ salesStaffCode: staffCode }, { staffCode });
    if (staffName) staffOr.push({ salesStaffName: staffName }, { staffName });
    if (staffOr.length) filter.$and = [{ $or: staffOr }];
  }

  const orders = await SalesOrder.find(filter)
    .select('customerId customerCode date orderDate createdAt')
    .sort({ date: -1, orderDate: -1, createdAt: -1 })
    .limit(2000)
    .lean();

  const lastByKey = new Map();
  for (const order of orders) {
    const date = dateUtil.toDateOnly(order.date || order.orderDate || order.createdAt);
    if (!date) continue;
    for (const key of compactKeys([order.customerId, order.customerCode])) {
      if (!lastByKey.has(key) || String(date) > String(lastByKey.get(key))) lastByKey.set(key, date);
    }
  }

  return rows.map((customer) => {
    const keys = compactKeys([customer.id, customer._id, customer.customerId, customer.code, customer.customerCode]);
    const lastOrderDate = keys.map((key) => lastByKey.get(key)).filter(Boolean).sort().pop() || '';
    return { ...customer, lastOrderDate };
  });
}

function mobileCustomerIdentityKeys(customer = {}) {
  return compactKeys([
    customer.id,
    customer._id,
    customer.customerId,
    customer.code,
    customer.customerCode,
    customer.name,
    customer.customerName
  ]);
}

function buildSalesMobileCustomerFilter(mobileUser = {}) {
  const user = mobileUser || {};
  if (String(user.role || '') !== 'sales') return {};
  const staffCode = String(user.code || user.staffCode || '').trim();
  const staffName = String(user.name || user.fullName || '').trim();
  const staffOr = [];
  if (staffCode) staffOr.push(
    { staffCode },
    { salesStaffCode: staffCode },
    { assignedSalesStaffCode: staffCode },
    { employeeCode: staffCode }
  );
  if (staffName) staffOr.push(
    { staffName },
    { salesStaffName: staffName },
    { assignedSalesStaffName: staffName },
    { employeeName: staffName }
  );
  return staffOr.length ? { $or: staffOr } : {};
}

async function buildDebtFirstMobileCustomers(req) {
  const limit = Math.max(1, Math.min(toNumber(req.query.limit || 300), 500));
  const mobileUser = req.mobileUser || {};
  const isSalesUser = String(mobileUser.role || '') === 'sales';
  const baseFilter = buildSalesMobileCustomerFilter(mobileUser);
  const debts = await buildMobileSalesDebtItems(mobileUser);

  const staffCode = String(mobileUser.code || mobileUser.staffCode || '').trim();
  const staffName = String(mobileUser.name || mobileUser.fullName || '').trim();
  const orderStaffOr = [];
  if (isSalesUser && staffCode) orderStaffOr.push({ salesStaffCode: staffCode }, { staffCode });
  if (isSalesUser && staffName) orderStaffOr.push({ salesStaffName: staffName }, { staffName });

  const assignedOrders = orderStaffOr.length
    ? await SalesOrder.find({ $or: orderStaffOr })
        .select('customerId customerCode customerName customerPhone customerAddress phone address')
        .sort({ date: -1, orderDate: -1, createdAt: -1 })
        .limit(10000)
        .lean()
    : [];

  const orderCustomerIds = compactKeys(assignedOrders.map((order) => order.customerId));
  const orderCustomerCodes = compactKeys(assignedOrders.map((order) => order.customerCode));
  const orderCustomerNames = compactKeys(assignedOrders.map((order) => order.customerName));

  const customerFilter = {};
  if (isSalesUser) {
    const or = [];
    if (baseFilter && Array.isArray(baseFilter.$or)) or.push(...baseFilter.$or);
    if (orderCustomerIds.length) or.push({ id: { $in: orderCustomerIds } }, { customerId: { $in: orderCustomerIds } });
    if (orderCustomerCodes.length) or.push({ code: { $in: orderCustomerCodes } }, { customerCode: { $in: orderCustomerCodes } });
    if (orderCustomerNames.length) or.push({ name: { $in: orderCustomerNames } }, { customerName: { $in: orderCustomerNames } });
    if (or.length) customerFilter.$or = or;
  }

  const maxCustomerRows = Math.max(limit * 5, 1000);
  let customers = await Customer.find(customerFilter)
    .sort({ code: 1, customerCode: 1, name: 1, customerName: 1 })
    .limit(maxCustomerRows)
    .lean();

  // Nếu danh mục khách chưa gán đúng NVBH và đơn bán cũng không đủ khóa,
  // fallback lấy danh mục khách để app không bị trắng màn hình.
  if (!customers.length && isSalesUser) {
    customers = await Customer.find({})
      .sort({ code: 1, customerCode: 1, name: 1, customerName: 1 })
      .limit(maxCustomerRows)
      .lean();
  }

  const mergedByKey = new Map();
  const addCustomer = (customer = {}, sourceRank = 0) => {
    const keys = mobileCustomerIdentityKeys(customer);
    const primaryKey = keys[0];
    if (!primaryKey) return;
    const existingKey = keys.find((key) => mergedByKey.has(key));
    const normalized = {
      ...customer,
      id: customer.id || customer._id || customer.customerId || '',
      code: customer.code || customer.customerCode || '',
      name: customer.name || customer.customerName || '',
      phone: customer.phone || customer.customerPhone || '',
      address: customer.address || customer.customerAddress || '',
      sourceRank
    };
    if (existingKey) {
      const current = mergedByKey.get(existingKey);
      const merged = {
        ...normalized,
        ...current,
        phone: current.phone || normalized.phone,
        address: current.address || normalized.address,
        code: current.code || normalized.code,
        name: current.name || normalized.name,
        sourceRank: Math.min(toNumber(current.sourceRank || 0), sourceRank)
      };
      for (const key of mobileCustomerIdentityKeys(merged)) mergedByKey.set(key, merged);
      return;
    }
    for (const key of keys) mergedByKey.set(key, normalized);
  };

  customers.forEach((customer) => addCustomer(customer, 0));

  // Bổ sung khách có phát sinh đơn bán của NVBH nhưng chưa khớp được vào danh mục customers.
  assignedOrders.forEach((order) => addCustomer({
    id: order.customerId || '',
    customerId: order.customerId || '',
    code: order.customerCode || '',
    customerCode: order.customerCode || '',
    name: order.customerName || '',
    customerName: order.customerName || '',
    phone: order.customerPhone || order.phone || '',
    customerPhone: order.customerPhone || order.phone || '',
    address: order.customerAddress || order.address || '',
    customerAddress: order.customerAddress || order.address || ''
  }, 1));

  const uniqueCustomers = Array.from(new Set(Array.from(mergedByKey.values())));
  const withLastOrder = await attachMobileCustomerLastOrderDates(uniqueCustomers, mobileUser);
  return attachMobileCustomerDebt(withLastOrder, debts)
    .sort((a, b) => {
      const debtDelta = toNumber(b.debtAmount || 0) - toNumber(a.debtAmount || 0);
      if (debtDelta) return debtDelta;
      const sourceDelta = toNumber(a.sourceRank || 0) - toNumber(b.sourceRank || 0);
      if (sourceDelta) return sourceDelta;
      return String(a.code || a.customerCode || a.name || '').localeCompare(String(b.code || b.customerCode || b.name || ''), 'vi');
    })
    .slice(0, limit)
    .map(({ sourceRank, ...item }) => item);
}

router.get('/customers', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const keyword = String(req.query.q || req.query.keyword || req.query.search || '').trim();
    if (!keyword) {
      const items = await buildDebtFirstMobileCustomers(req);
      return ok(res, { source: 'mobile-customers-debt-first-ar-ledger', items });
    }

    const rawItems = await searchService.searchCustomers({
      ...req.query,
      includeMetrics: '1',
      mobile: '1',
      allowEmpty: '1',
      limit: req.query.limit || 300
    });
    const withLastOrder = await attachMobileCustomerLastOrderDates(rawItems, req.mobileUser || {});
    const debts = await buildMobileSalesDebtItems(req.mobileUser || {});
    const items = attachMobileCustomerDebt(withLastOrder, debts)
      .sort((a, b) => toNumber(b.debtAmount || 0) - toNumber(a.debtAmount || 0));
    return ok(res, { source: 'mobile-customers-search-ar-ledger-debt-sorted', items });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được khách hàng mobile');
  }
});

router.get('/debts', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'admin']), async (req, res) => {
  try {
    const items = await buildMobileSalesDebtItems(req.mobileUser || {});
    const summary = {
      totalDebt: items.reduce((sum, item) => sum + toNumber(item.debtAmount), 0),
      customerCount: items.length,
      source: 'arLedgers'
    };

    return ok(res, { source: 'mobile-sales-ar-ledger-debts', items, summary });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được công nợ mobile');
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
      source: 'mobile-users-auth-route',
      message: 'Đã rebuild stockTransactions và inventories. Products chỉ còn là danh mục, không lưu tồn.',
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
    const targetDate = dateUtil.toDateOnly(req.query.date || dateUtil.todayVN());
    const filter = {
      status: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'] },
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
      date: dateUtil.toDateOnly(order.date || order.orderDate),
      canEdit: !order.masterOrderId && !order.masterOrderCode && !order.masterOrderNo && String(order.mergeStatus || 'unmerged') !== 'merged'
    }));
    if (q) items = items.filter((o) => [o.code, o.customerCode, o.customerName, o.customerPhone, o.customerAddress].some((v) => normalizeText(v).includes(q)));
    return ok(res, { source: 'mobile-users-auth-route', date: targetDate, items });
  } catch (err) {
    return fail(res, 500, 'Không tải được đơn mobile');
  }
});

router.get('/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales', 'admin']), async (req, res) => {
  const order = await findOrderByIdOrCode(req.params.id);
  if (!order) return fail(res, 404, 'Không tìm thấy đơn mobile');
  const item = stripMongoFields(order.toObject ? order.toObject() : order);
  item.date = dateUtil.toDateOnly(item.date || item.orderDate);
  item.canEdit = !item.masterOrderId && !item.masterOrderCode && !item.masterOrderNo && String(item.mergeStatus || 'unmerged') !== 'merged';
  return ok(res, { order: item });
});

function legacyMobileSalesWriteGone(req, res) {
  return fail(res, 410, 'Mobile legacy đã ngừng ghi tồn. Vui lòng dùng /api/mobile modular route.');
}

router.post('/sales/orders', requireMobileLogin, requireMobileRole(['sales', 'admin']), legacyMobileSalesWriteGone);
router.put('/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales', 'admin']), legacyMobileSalesWriteGone);
router.delete('/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales', 'admin']), legacyMobileSalesWriteGone);

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
    let order;
    await withMongoTransaction(async (session) => {
      const created = await SalesOrder.create([{
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
      date: body.orderDate || dateUtil.todayVN(),
      orderDate: body.orderDate || dateUtil.todayVN(),
      deliveryDate: body.deliveryDate || body.orderDate || dateUtil.todayVN(),
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
      updatedAt: new Date().toISOString(),
        ...mobileStockPostedPatch({}, req.mobileUser.code || req.mobileUser.name || 'mobile_sales')
      }], { session });
      order = created[0];
      await InventoryPostingService.postSaleOut(order.toObject ? order.toObject() : order, { session });
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
      updatedAt: new Date().toISOString(),
      ...mobileStockPostedPatch(raw, req.mobileUser.code || req.mobileUser.name || 'mobile_sales_update')
    });
    await withMongoTransaction(async (session) => {
      if (isMobileSalesStockPosted(raw)) {
        await InventoryPostingService.reverseMovement(raw, {
          type: 'SALE',
          reverseType: 'SALE_REVERSAL',
          direction: 'OUT',
          refType: 'SALES_ORDER',
          refId: raw.id || raw._id || raw.code,
          refCode: raw.code || raw.id,
          date: dateUtil.todayVN(),
          note: 'Đảo xuất kho đơn bán mobile trước khi sửa'
        }, { session });
      }
      await order.save({ session });
      await InventoryPostingService.postSaleOut(order.toObject ? order.toObject() : order, { session });
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

    const deliveryStatus = String(raw.deliveryStatus || raw.status || '').toLowerCase();
    const accountingStatus = String(raw.accountingStatus || raw.arStatus || '').toLowerCase();
    const accountingLocked = Boolean(raw.accountingConfirmed)
      || ['confirmed', 'locked', 'posted'].includes(accountingStatus)
      || ['delivered', 'success', 'completed', 'done'].includes(deliveryStatus);

    const stockPosted = isMobileSalesStockPosted(raw);

    if (!accountingLocked) {
      await withMongoTransaction(async (session) => {
        if (stockPosted) {
          await InventoryPostingService.reverseMovement(raw, {
            type: 'SALE',
            reverseType: 'SALE_REVERSAL',
            direction: 'OUT',
            refType: 'SALES_ORDER',
            refId: raw.id || raw._id || raw.code,
            refCode: raw.code || raw.id,
            date: dateUtil.todayVN(),
            note: 'Đảo xuất kho khi xóa đơn mobile'
          }, { session });
        }
        await SalesOrder.deleteOne({ _id: order._id }).session(session);
      });
      const deletedOrder = { ...raw, status: 'deleted', deliveryStatus: 'deleted', deletedAt: new Date().toISOString() };
      return ok(res, { message: `Đã xóa hẳn đơn ${raw.code || ''}`, order: stripMongoFields(deletedOrder), salesOrder: stripMongoFields(deletedOrder), hardDeleted: true });
    }

    order.status = 'void';
    order.deliveryStatus = 'void';
    order.deleted = true;
    order.isDeleted = true;
    order.deletedAt = new Date().toISOString();
    order.deleteReason = 'Xóa mềm từ app bán hàng vì đơn đã phát sinh giao hàng/kế toán';
    order.updatedAt = new Date().toISOString();
    await withMongoTransaction(async (session) => {
      if (stockPosted) {
        await InventoryPostingService.reverseMovement(raw, {
          type: 'SALE',
          reverseType: 'SALE_REVERSAL',
          direction: 'OUT',
          refType: 'SALES_ORDER',
          refId: raw.id || raw._id || raw.code,
          refCode: raw.code || raw.id,
          date: dateUtil.todayVN(),
          note: 'Đảo xuất kho khi xóa mềm đơn mobile'
        }, { session });
      }
      await order.save({ session });
    });
    const savedOrder = stripMongoFields(order.toObject());
    return ok(res, { message: `Đã xóa mềm đơn ${savedOrder.code || ''}`, order: savedOrder, salesOrder: savedOrder, hardDeleted: false });
  } catch (err) {
    return fail(res, 500, err.message || 'Không xóa được đơn mobile');
  }
});

router.get('/delivery/orders', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const targetDate = dateUtil.toDateOnly(req.query.date || dateUtil.todayVN());
    const includeCompleted = ['1', 'true'].includes(String(req.query.includeCompleted || '').toLowerCase());
    const q = normalizeText(req.query.q);
    const status = normalizeText(req.query.status);

    // Siết API giao hàng: app chỉ được hiện đơn con thuộc đơn tổng CÒN HIỆU LỰC.
    // Không lấy đơn con trôi nổi chỉ vì còn deliveryDate/driverId cũ sau khi đơn tổng đã hủy.
    const masters = (await MasterOrder.find({ deliveryDate: targetDate }).lean()).filter(isActiveMasterOrder);
    const masterByChild = new Map();
    const masterChildByKey = new Map();
    const orderRefs = [];

    for (const master of masters) {
      // Nguồn chuẩn DUY NHẤT: masterOrder.childOrderIds.
      // Tuyệt đối không dùng master.children vì đó là snapshot cũ có thể chứa đơn đã xóa/hủy.
      const ids = masterChildIds(master);

      for (const childId of ids) {
        const key = String(childId).trim();
        if (!key) continue;
        masterByChild.set(key, master);
        orderRefs.push({ key, master, masterChild: null });
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

    // V45 mobile delivery speed fix: gộp 5 lần SalesOrder.find() thành 1 query.
    // Trước đây query lần lượt theo id/code/orderCode/orderNo/_id, làm API /api/mobile/delivery/orders bị phát sinh nhiều DB query.
    const orders = [];
    const orderByKey = new Map();
    const addOrders = (rows = []) => {
      for (const order of rows || []) {
        const keys = buildSalesOrderLookupKeys(order);
        const stableKey = keys[0] || toCleanDocKey(order._id);
        if (stableKey && orderByKey.has(stableKey)) continue;
        orders.push(order);
        for (const key of keys) orderByKey.set(String(key), order);
      }
    };

    const childOrderIds = normalizeSalesOrderIds(childKeys);
    const salesOrderQuery = buildSalesOrderIdInQuery(childOrderIds);

    if (childOrderIds.length) {
      addOrders(await SalesOrder.find(salesOrderQuery)
        .select('id code orderCode orderNo salesOrderCode customerCode customerName customerPhone customerAddress items total totalAmount amount grandTotal deliveryStatus status deliveryDate salesStaffCode salesStaffName staffCode staffName salesmanCode salesmanName deliveryStaffCode deliveryStaffName routeName deliveryRoute cashCollected cashAmount bankCollected bankAmount transferAmount rewardAmount displayRewardAmount bonusAmount bonusReturnAmount returnAmount returnedAmount debtAmount remainingAmount collectedAmount accountingConfirmed accountingStatus needReAccounting reAccountingRequired adminAdjustmentOpen editLocked isLate deletedAt')
        .lean());
    }

    const deliveryPairs = [];
    const seenOrders = new Set();
    for (const ref of orderRefs) {
      const order = orderByKey.get(ref.key);
      if (!order) continue;
      const stableKey = String(order.id || order.code || order._id || ref.key).trim();
      if (seenOrders.has(stableKey)) continue;
      seenOrders.add(stableKey);
      const possibleOrderKeys = orderMatchKeys(order, ref.master, ref.masterChild);
      const master = possibleOrderKeys.map((key) => masterByChild.get(key)).find(Boolean) || ref.master || null;
      const masterChild = possibleOrderKeys.map((key) => masterChildByKey.get(key)).find(Boolean) || ref.masterChild || null;
      deliveryPairs.push({ order, master, masterChild });
    }

    const returnOrderIds = compactKeys(deliveryPairs.flatMap(({ order }) => orderIdKeys(order)));
    const returnOrderCodes = compactKeys(deliveryPairs.flatMap(({ order }) => orderCodeKeys(order)));
    const returnOrderFilter = buildReturnOrderFilter(returnOrderIds, returnOrderCodes);

    // Không lấy toàn bộ returnOrders nữa. Chỉ lấy theo 2 khóa chuẩn salesOrderId/salesOrderCode.
    const returnOrders = returnOrderFilter ? await ReturnOrder.find(returnOrderFilter).lean() : [];

    const customerCodes = [...new Set(deliveryPairs.map(({ order, masterChild }) => order.customerCode || masterChild?.customerCode).filter(Boolean))];
    const customers = customerCodes.length ? await Customer.find({ code: { $in: customerCodes } }).lean() : [];
    const customerByCode = new Map(customers.map((c) => [String(c.code), c]));

    // V45 chuẩn: công nợ hiển thị trên app giao hàng phải ưu tiên cùng nguồn với màn Công nợ ERP (AR Ledger).
    // Chỉ fallback công thức tạm tính từ đơn khi đơn chưa có bút toán AR, tránh mỗi màn hiện một số khác nhau.
    const arDebtMap = await buildArDebtMapForOrders(orders);

    let items = deliveryPairs
      .filter(({ master }) => isActiveMasterOrder(master))
      .filter(({ order, master }) => isApprovedForDelivery(order, master))
      .filter(({ order, master }) => orderAssignedToUser(order, master, req.mobileUser))
      .map(({ order, master, masterChild }) => buildDeliveryRow(order, customerByCode.get(String(order.customerCode || masterChild?.customerCode)), master, targetDate, returnOrders, masterChild, arDebtMap))
      .filter((row) => includeCompleted || isActiveDeliveryStatus(row));

    if (q) {
      items = items.filter((row) => [row.code, row.customerCode, row.customerName, row.phone, row.address, row.routeName, row.masterOrderCode]
        .some((value) => normalizeText(value).includes(q)));
    }
    if (status) {
      items = items.filter((row) => {
        if (status === 'unpaid') return hasOpenDebt(row.debtAmount);
        return normalizeText(row.deliveryStatus) === status || normalizeText(row.visualStatus) === status;
      });
    }

    items.sort((a, b) => String(a.routeName).localeCompare(String(b.routeName)) || String(a.code).localeCompare(String(b.code)));
    return ok(res, {
      source: 'mobile-delivery-mongo-route',
      date: targetDate,
      user: req.mobileUser,
      formula: 'App giao hàng lấy danh sách đơn từ masterOrder.childOrderIds, nhưng số còn thu/công nợ lấy theo AR Ledger batch theo đúng các đơn đang giao; không gọi báo cáo công nợ toàn hệ thống.',
      items
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được đơn giao hàng mobile');
  }
});


function rowMatchesCustomer(row = {}, identity = {}) {
  const needleValues = [identity.customerId, identity.customerCode, identity.customerName]
    .map((v) => normalizeText(v)).filter(Boolean);
  if (!needleValues.length) return false;
  const rowValues = [row.customerId, row.customerCode, row.customerName]
    .map((v) => normalizeText(v)).filter(Boolean);
  return needleValues.some((needle) => rowValues.some((value) => value === needle || value.includes(needle) || needle.includes(value)));
}

function debtOrderKey(row = {}) {
  return String(row.orderId || row.orderCode || row.id || row.code || '').trim();
}

async function mobileCustomerDebtRows(identity = {}, excludeKeys = []) {
  const result = await reportService.debtReport({ status: 'open' });
  const excluded = new Set((excludeKeys || []).map((v) => String(v || '').trim()).filter(Boolean));
  return (Array.isArray(result?.debts) ? result.debts : [])
    .filter((row) => hasOpenDebt(row.debt))
    .filter((row) => rowMatchesCustomer(row, identity))
    .filter((row) => {
      const keys = [row.orderId, row.orderCode, row.id, row.code].map((v) => String(v || '').trim()).filter(Boolean);
      return !keys.some((key) => excluded.has(key));
    })
    .map((row) => ({
      orderId: row.orderId || row.id || '',
      orderCode: row.orderCode || row.code || row.orderId || '',
      documentDate: row.documentDate || row.date || row.orderDate || '',
      dueDate: row.dueDate || '',
      customerId: row.customerId || '',
      customerCode: row.customerCode || '',
      customerName: row.customerName || '',
      debt: normalizeDebtAmount(row.debt),
      overdueDays: toNumber(row.overdueDays),
      agingDays: toNumber(row.agingDays),
      status: row.status || ''
    }))
    .sort((a, b) => String(a.documentDate || '').localeCompare(String(b.documentDate || '')) || String(a.orderCode).localeCompare(String(b.orderCode)));
}

function splitPaymentToAllocations(amount, priorityRows = []) {
  let remaining = Math.max(0, toNumber(amount));
  const allocations = [];
  for (const row of priorityRows) {
    if (remaining <= 0) break;
    const debt = Math.max(0, toNumber(row.debt));
    if (debt <= 0) continue;
    const applied = Math.min(debt, remaining);
    if (applied > 0) {
      allocations.push({
        orderId: row.orderId || row.id || '',
        orderCode: row.orderCode || row.code || row.orderId || '',
        amount: applied
      });
      remaining -= applied;
    }
  }
  return { allocations, remaining };
}

router.get('/delivery/customer-debts', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const currentOrderId = String(req.query.currentOrderId || '').trim();
    const currentOrder = currentOrderId ? await findOrderByIdOrCode(currentOrderId) : null;
    const identity = {
      customerId: req.query.customerId || currentOrder?.customerId || '',
      customerCode: req.query.customerCode || currentOrder?.customerCode || '',
      customerName: req.query.customerName || currentOrder?.customerName || ''
    };
    const exclude = [currentOrderId, currentOrder?.id, currentOrder?._id, currentOrder?.code, currentOrder?.orderCode, currentOrder?.orderNo];
    const items = await mobileCustomerDebtRows(identity, exclude);
    const summary = {
      orderCount: items.length,
      totalDebt: items.reduce((sum, row) => sum + toNumber(row.debt), 0)
    };
    return ok(res, { source: 'mobile-delivery-customer-debts', items, summary });
  } catch (err) {
    return fail(res, 500, err.message || 'Không tải được danh sách đơn nợ của khách');
  }
});

router.post('/delivery/confirm', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const order = await findOrderByIdOrCode(req.body?.orderId);
    if (!order) return fail(res, 404, 'Không tìm thấy đơn giao hàng');
    const status = String(req.body?.status || '').trim();
    if (!['success', 'failed'].includes(status)) return fail(res, 400, 'Trạng thái giao hàng không hợp lệ');
    const moneyInput = normalizeDeliveryMoney(req.body || {});
    const hasSplitAmounts = req.body?.cashAmount !== undefined
      || req.body?.bankAmount !== undefined
      || req.body?.rewardAmount !== undefined
      || req.body?.cashCollected !== undefined
      || req.body?.bankCollected !== undefined
      || req.body?.transferAmount !== undefined
      || req.body?.bonusAmount !== undefined
      || req.body?.displayRewardAmount !== undefined;
    const cashAmount = hasSplitAmounts ? Math.max(0, moneyInput.cashAmount) : 0;
    const bankAmount = hasSplitAmounts ? Math.max(0, moneyInput.bankAmount) : 0;
    const rewardAmount = hasSplitAmounts ? Math.max(0, moneyInput.rewardAmount) : 0;
    const legacyCollectAmount = Math.max(0, toNumber(req.body?.collectAmount));
    const collectAmount = hasSplitAmounts ? cashAmount + bankAmount + rewardAmount : legacyCollectAmount;
    const method = String(req.body?.collectionMethod || req.body?.paymentMethod || 'cash').trim() === 'transfer' ? 'transfer' : 'cash';
    const note = String(req.body?.note || '').trim();
    const selectedDebtOrderIds = Array.isArray(req.body?.debtOrderIds)
      ? req.body.debtOrderIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

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
        const savedReturnItems = Array.isArray(returnOrder.items) ? returnOrder.items : [];
        order.returnAmount = toNumber(returnOrder.totalAmount || returnOrder.amount || 0);
        order.returnedAmount = order.returnAmount;
        order.returnItems = savedReturnItems;
        order.deliveryReturnItems = savedReturnItems;
      }
    }

    let receiptWarning = '';
    let postingWarning = '';
    let receiptLines = [];

    if (status === 'success') {
      // App giao hàng có thể thu cả nợ cũ của khách ở tab Thu tiền.
      // Số tiền thực thu được phân bổ ưu tiên vào đơn nợ cũ đã tick, sau đó mới tới đơn đang giao.
      const previousMoney = readDeliveryMoney(order);
      const previousCash = previousMoney.cashAmount;
      const previousBank = previousMoney.bankAmount;
      const previousReward = previousMoney.rewardAmount;
      const inputCash = hasSplitAmounts ? cashAmount : (method === 'cash' ? legacyCollectAmount : previousCash);
      const inputBank = hasSplitAmounts ? bankAmount : (method === 'transfer' ? legacyCollectAmount : previousBank);
      const nextReward = hasSplitAmounts ? rewardAmount : previousReward;
      const cashDeltaTotal = Math.max(0, inputCash - previousCash);
      const bankDeltaTotal = Math.max(0, inputBank - previousBank);

      const selectedDebtRows = selectedDebtOrderIds.length
        ? (await mobileCustomerDebtRows({
            customerId: order.customerId || '',
            customerCode: order.customerCode || '',
            customerName: order.customerName || ''
          }, [getDocId(order), orderCode(order)]))
            .filter((row) => {
              const keys = [row.orderId, row.orderCode].map((value) => String(value || '').trim()).filter(Boolean);
              return keys.some((key) => selectedDebtOrderIds.includes(key));
            })
        : [];

      const currentOrderDebtSeed = Math.max(0, deliveryFinance.deliveryDebtBase(order) - toNumber(order.returnAmount ?? order.returnedAmount ?? 0) - nextReward);
      const priorityRowsBase = [
        ...selectedDebtRows,
        { orderId: getDocId(order), orderCode: orderCode(order), debt: currentOrderDebtSeed, documentDate: order.date || order.orderDate || order.deliveryDate || '' }
      ];
      const cashSplit = splitPaymentToAllocations(cashDeltaTotal, priorityRowsBase);
      const paidByCash = new Map(cashSplit.allocations.map((row) => [String(row.orderId || row.orderCode), toNumber(row.amount)]));
      const priorityRowsAfterCash = priorityRowsBase.map((row) => {
        const key = String(row.orderId || row.orderCode || '').trim();
        const paid = toNumber(paidByCash.get(key));
        return { ...row, debt: Math.max(0, toNumber(row.debt) - paid) };
      });
      const bankSplit = splitPaymentToAllocations(bankDeltaTotal, priorityRowsAfterCash);
      const currentKeys = new Set([getDocId(order), orderCode(order)].map((value) => String(value || '').trim()).filter(Boolean));
      const currentCashDelta = cashSplit.allocations
        .filter((row) => currentKeys.has(String(row.orderId || '').trim()) || currentKeys.has(String(row.orderCode || '').trim()))
        .reduce((sum, row) => sum + toNumber(row.amount), 0);
      const currentBankDelta = bankSplit.allocations
        .filter((row) => currentKeys.has(String(row.orderId || '').trim()) || currentKeys.has(String(row.orderCode || '').trim()))
        .reduce((sum, row) => sum + toNumber(row.amount), 0);
      const oldDebtCashDelta = cashSplit.allocations
        .filter((row) => !(currentKeys.has(String(row.orderId || '').trim()) || currentKeys.has(String(row.orderCode || '').trim())))
        .reduce((sum, row) => sum + toNumber(row.amount), 0);
      const oldDebtBankDelta = bankSplit.allocations
        .filter((row) => !(currentKeys.has(String(row.orderId || '').trim()) || currentKeys.has(String(row.orderCode || '').trim())))
        .reduce((sum, row) => sum + toNumber(row.amount), 0);
      // Các ô tiền trên app là số tuyệt đối đang lưu cho đơn, không phải số thu thêm.
      // Nếu không chọn đơn nợ cũ, ghi đè trực tiếp để sửa giảm tiền được (200000 -> 100000).
      // Nếu có chọn nợ cũ, chỉ phần tiền được phân bổ về đơn hiện tại mới cập nhật vào đơn hiện tại.
      const nextCash = selectedDebtRows.length ? previousCash + currentCashDelta : inputCash;
      const nextBank = selectedDebtRows.length ? previousBank + currentBankDelta : inputBank;
      receiptLines = [
        { method: 'cash', amount: cashDeltaTotal, allocations: cashSplit.allocations, note: note || `App giao hàng thu tiền mặt khách ${order.customerName || order.customerCode || ''}` },
        { method: 'transfer', amount: bankDeltaTotal, allocations: bankSplit.allocations, note: note || `App giao hàng thu chuyển khoản khách ${order.customerName || order.customerCode || ''}` }
      ].filter(line => line.amount > 0 && Array.isArray(line.allocations) && line.allocations.length);

      order.cashAmount = nextCash;
      order.bankAmount = nextBank;
      order.oldDebtCashCollected = toNumber(order.oldDebtCashCollected || order.debtCashCollected || 0) + oldDebtCashDelta;
      order.debtCashCollected = order.oldDebtCashCollected;
      order.oldDebtBankCollected = toNumber(order.oldDebtBankCollected || order.debtBankCollected || 0) + oldDebtBankDelta;
      order.debtBankCollected = order.oldDebtBankCollected;
      order.oldDebtCollectedAmount = order.oldDebtCashCollected + order.oldDebtBankCollected;
      order.debtCollectionAllocations = [
        ...(Array.isArray(order.debtCollectionAllocations) ? order.debtCollectionAllocations : []),
        ...cashSplit.allocations.filter((row) => !(currentKeys.has(String(row.orderId || '').trim()) || currentKeys.has(String(row.orderCode || '').trim()))).map((row) => ({ ...row, method: 'cash', date: dateUtil.todayVN(), sourceOrderId: getDocId(order), sourceOrderCode: orderCode(order) })),
        ...bankSplit.allocations.filter((row) => !(currentKeys.has(String(row.orderId || '').trim()) || currentKeys.has(String(row.orderCode || '').trim()))).map((row) => ({ ...row, method: 'transfer', date: dateUtil.todayVN(), sourceOrderId: getDocId(order), sourceOrderCode: orderCode(order) }))
      ];
      order.rewardAmount = nextReward;
      order.paidAmount = nextCash + nextBank;
      order.collectedAmount = nextCash + nextBank;
      order.debtBeforeCollection = deliveryFinance.deliveryDebtBase(order);
      order.debtAmount = deliveryFinance.calculateDeliveryDebt(order);
      order.debt = order.debtAmount;
      order.arBalance = order.debtAmount;
      applyOrderDebtLifecycle(order);
    }

    // Lưu vào đúng nguồn hiển thị của web/app: SalesOrder thật + snapshot đơn tổng.
    const savedCanonicalOrder = status === 'success'
      ? await saveDeliveryPaymentCanonical(order, req.body?.orderId)
      : (await order.save(), order);

    if (status === 'success') {
      // V45 chuẩn kế toán: app giao hàng chỉ lưu số tiền/hàng trả vào đơn giao.
      // Tuyệt đối không tạo phiếu thu posted và không post AR-PAYMENT tại đây,
      // vì kế toán chưa đối chiếu tiền mặt/chuyển khoản/hàng trả.
      receiptLines = [];

      try {
        // Không post AR-SALE / AR-BONUS / AR-PAYMENT / AR-RETURN ở app giao hàng.
        // Kế toán sẽ kiểm tra báo cáo giao hàng rồi bấm xác nhận để đưa đơn sang AR Ledger.
        order.accountingStatus = order.accountingStatus || 'pending_accounting';
        order.accountingConfirmed = Boolean(order.accountingConfirmed);
        order.arStatus = order.accountingConfirmed ? order.arStatus : 'pending_accounting';
        order.lifecycleStatus = order.accountingConfirmed ? order.lifecycleStatus : 'pending_accounting';
        order.financialSyncStatus = 'pending_accounting';
        order.financialSyncMessage = 'Đã giao/thu tiền trên app, chờ kế toán xác nhận để post AR công nợ';
        order.financialSyncAt = new Date().toISOString();
        await order.save();
      } catch (err) {
        postingWarning = err.message || 'Không cập nhật được trạng thái chờ kế toán';
        order.financialSyncStatus = order.financialSyncStatus || 'pending_accounting_error';
        order.financialSyncMessage = [order.financialSyncMessage, postingWarning].filter(Boolean).join(' | ');
        order.financialSyncAt = new Date().toISOString();
        await order.save();
      }
    }

    const finalOrder = savedCanonicalOrder || order;
    // Không query lại toàn bộ đơn và không đồng bộ snapshot trong luồng chờ của app.
    // saveDeliveryPaymentCanonical đã trả về bản đã patch và tự đẩy đồng bộ phụ chạy nền.
    const warnings = [receiptWarning, postingWarning].filter(Boolean);
    return ok(res, {
      message: warnings.length
        ? `Đã lưu tiền trên đơn giao. Cảnh báo chứng từ: ${warnings.join(' | ')}`
        : 'Đã cập nhật trạng thái giao hàng',
      warning: warnings.join(' | '),
      order: stripMongoFields(finalOrder.toObject ? finalOrder.toObject() : finalOrder)
    });
  } catch (err) {
    return fail(res, 500, err.message || 'Không cập nhật được giao hàng mobile');
  }
});

router.post('/delivery/return', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, ArLedger, User: Staff });
    const result = await engine.saveReturn({
      ...(req.body || {}),
      orderId: req.body?.orderId || req.body?.salesOrderId || req.body?.orderCode || req.body?.salesOrderCode,
      salesOrderId: req.body?.salesOrderId || req.body?.orderId,
      salesOrderCode: req.body?.salesOrderCode || req.body?.orderCode,
      deliveryStaffCode: req.mobileUser?.code || req.user?.code || req.body?.deliveryStaffCode,
      deliveryStaffName: req.mobileUser?.name || req.user?.name || req.body?.deliveryStaffName,
      source: 'mobile_delivery_canonical_route'
    });
    return ok(res, {
      source: 'returnOrders',
      message: result.message || 'Đã lưu hàng trả vào returnOrders',
      returnOrder: stripMongoFields(result.returnOrder || {}),
      order: stripMongoFields(result.order || {})
    });
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Không tạo được phiếu trả hàng từ app giao hàng');
  }
});


router.post('/cash/submit', requireMobileLogin, requireMobileRole(['delivery', 'admin']), async (req, res) => {
  try {
    const amount = toNumber(req.body?.amount);
    if (amount <= 0) return fail(res, 400, 'Số tiền nộp quỹ phải lớn hơn 0');
    const result = await financialService.createCashbook({
      date: dateUtil.todayVN(),
      type: 'in',
      source: 'mobile_cash_submit',
      refType: 'cashSubmit',
      staffCode: req.mobileUser.code || '',
      staffName: req.mobileUser.name || '',
      amount,
      note: String(req.body?.note || '').trim() || `Nhân viên ${req.mobileUser.name || ''} nộp tiền về quỹ`
    });
    if (result.error) return fail(res, result.status || 400, result.error);
    return ok(res, { message: 'Đã ghi nhận nộp tiền về quỹ', entry: result.entry }, 201);
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
