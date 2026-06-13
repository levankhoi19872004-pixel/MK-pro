'use strict';

// MOBILE_MODULAR_CONTEXT_START

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { validationResult } = require('express-validator');

const { normalizeText } = require('../utils/search.util');
const { makeId, toNumber, stripMongoFields, formatCaseLooseQty } = require('../utils/common.util');
const { MongoStore, readCollection, replaceCollection } = require('../services/mongoSyncService');
const inventoryStockService = require('../services/inventoryStock.service');
const postingEngine = require('../engines/posting.engine');
const MobileLog = require('../models/MobileLog');
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName,
  pickUserAccountSalesStaffCode,
  pickUserAccountDeliveryStaffCode
} = require('../domain/staff/staffIdentity');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  warehouse: 'Kho',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};

const VALID_ROLES = Object.keys(ROLE_LABELS);
const ACCESS_TOKEN_EXPIRES_IN = process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN || '1d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.MOBILE_REFRESH_TOKEN_EXPIRES_IN || '30d';

const SNAPSHOT_KEYS = [
  'products',
  'customers',
  'staffs',
  'users',
  'roles',
  'permissions',
  'warehouses',
  'stock',
  'inventories',
  'salesOrders',
  'masterOrders',
  'returnOrders',
  'payments',
  'receipts',
  'cashbooks',
  'bankbooks',
  'arLedgers',
  'mobileLogs'
];

const PERSIST_KEYS = [
  // Không cho primary snapshot ghi đè dữ liệu nghiệp vụ sống.
  // salesOrders/payments/cashbooks/bankbooks/inventories phải ghi bằng repository/service trực tiếp.
  'mobileLogs'
];

function jwtSecret() {
  const secret = [process.env.JWT_SECRET, process.env.MOBILE_JWT_SECRET].find(Boolean);
  if (!secret) throw new Error('Missing JWT_SECRET');
  return secret;
}

function encodeMobileToken(user) {
  return jwt.sign(user, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function encodeMobileRefreshToken(user) {
  return jwt.sign(user, jwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

function decodeMobileRefreshToken(token) {
  try {
    return jwt.verify(String(token || ''), jwtSecret());
  } catch (_) {
    return null;
  }
}

function requireMobileLogin(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ ok: false, success: false, message: 'Bạn chưa đăng nhập mobile app' });
  }

  try {
    req.mobileUser = jwt.verify(token, jwtSecret());
    return next();
  } catch (_) {
    return res.status(401).json({ ok: false, success: false, message: 'Phiên đăng nhập đã hết hạn' });
  }
}

function requireMobileRole(roles = []) {
  const allowed = (Array.isArray(roles) ? roles : [roles]).map((role) => String(role || '').trim());

  return function mobileRoleGuard(req, res, next) {
    const role = String(req.mobileUser?.role || '').trim();
    if (role === 'admin' || allowed.includes(role)) return next();

    return res.status(403).json({
      ok: false,
      success: false,
      message: 'Bạn không có quyền sử dụng chức năng này'
    });
  };
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(400).json({
    ok: false,
    success: false,
    message: errors.array()[0]?.msg || 'Dữ liệu không hợp lệ',
    errors: errors.array()
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MOBILE_AUTH_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false
});

function roleOf(user = {}) {
  const raw = String(user.role || user.type || '').trim();
  if (VALID_ROLES.includes(raw)) return raw;
  if (user.isDelivery) return 'delivery';
  if (user.isSalesman || user.isSales) return 'sales';
  return 'sales';
}

function buildJwtPayload(user = {}) {
  const role = roleOf(user);
  const salesStaffCode = role === 'sales'
    ? (pickSalesStaffCode(user) || pickUserAccountSalesStaffCode(user))
    : pickSalesStaffCode(user);
  const salesStaffName = pickSalesStaffName(user);
  const deliveryStaffCode = role === 'delivery'
    ? (pickDeliveryStaffCode(user) || pickUserAccountDeliveryStaffCode(user))
    : pickDeliveryStaffCode(user);
  const deliveryStaffName = pickDeliveryStaffName(user);
  const code = salesStaffCode || deliveryStaffCode || String(user.code || user.staffCode || '').trim();
  const name = salesStaffName || deliveryStaffName || String(user.fullName || user.name || '').trim();

  return {
    id: String(user.id || user._id || code || '').trim(),
    code,
    staffCode: code,
    username: String(user.username || code || '').trim(),
    name,
    fullName: name,
    role,
    roleLabel: ROLE_LABELS[role] || role,
    salesStaffCode,
    salesStaffName,
    salesmanCode: salesStaffCode,
    salesmanName: salesStaffName,
    deliveryStaffCode,
    deliveryStaffName,
    shipperCode: deliveryStaffCode,
    shipperName: deliveryStaffName
  };
}

function staffMongoToClient(staff = {}) {
  return buildJwtPayload(staff);
}

function customerMongoToClient(customer = {}) {
  const row = stripMongoFields(customer) || {};
  return {
    ...row,
    id: row.id || String(row._id || row.code || '').trim(),
    code: row.code || row.customerCode || '',
    customerCode: row.customerCode || row.code || '',
    name: row.name || row.customerName || '',
    customerName: row.customerName || row.name || ''
  };
}

function productMongoToClient(product = {}) {
  const row = stripMongoFields(product) || {};
  return {
    ...row,
    id: row.id || String(row._id || row.code || row.productCode || row.sku || '').trim(),
    code: row.code || row.productCode || row.sku || '',
    productCode: row.productCode || row.code || row.sku || '',
    name: row.name || row.productName || '',
    productName: row.productName || row.name || ''
  };
}

async function getPrimaryDataSnapshot() {
  const entries = await Promise.all(SNAPSHOT_KEYS.map(async (key) => [key, await readCollection(key).catch(() => [])]));
  return Object.fromEntries(entries);
}

async function persistPrimaryDataSnapshot(snapshot = {}) {
  for (const key of PERSIST_KEYS) {
    if (Array.isArray(snapshot[key])) await replaceCollection(key, snapshot[key]);
  }
}

async function saveOperationalData(snapshot = {}) {
  return persistPrimaryDataSnapshot(snapshot);
}

async function refreshOrderDocumentCacheFromMongo() {
  return null;
}

function findByIdOrCode(rows = [], key) {
  const text = String(key || '').trim();
  if (!text) return null;
  return (Array.isArray(rows) ? rows : []).find((row) => {
    return [row.id, row._id, row.code, row.customerId, row.customerCode, row.productCode, row.sku].some((value) => String(value || '').trim() === text);
  }) || null;
}

function findCustomer(data = {}, customerIdOrCode) {
  return findByIdOrCode(data.customers, customerIdOrCode);
}

function findProduct(data = {}, productIdOrCode) {
  return findByIdOrCode(data.products, productIdOrCode);
}

function productCodeOf(product = {}) {
  return String(product.code || product.productCode || product.sku || '').trim();
}

async function getProductAvailableQty(product = {}) {
  const stock = await inventoryStockService.getAvailableStock(productCodeOf(product));
  return Number(stock.availableQty || 0);
}

function buildProductLineMeta(product = {}) {
  const productCode = product.code || product.productCode || product.sku || '';
  const productName = product.name || product.productName || '';
  const unit = product.unit || product.baseUnit || '';
  const conversionRate = toNumber(product.conversionRate || 1) || 1;
  const warehouseCode = product.defaultWarehouse || product.warehouseCode || 'KHO_HC';
  const catalogSalePrice = toNumber(product.salePrice || product.price || 0);

  return {
    unit,
    baseUnit: product.baseUnit || unit,
    conversionRate,
    conversionRateAtOrder: conversionRate,
    packing: product.packing || '',
    warehouseCodeAtOrder: warehouseCode,
    catalogSalePriceAtOrder: catalogSalePrice,
    brand: product.brand || '',
    category: product.category || product.groupName || product.productGroup || '',
    productSnapshot: {
      code: productCode,
      productCode,
      name: productName,
      productName,
      unit,
      conversionRate,
      salePrice: catalogSalePrice,
      warehouseCode,
      defaultWarehouse: warehouseCode
    }
  };
}

function reduceStock(data = {}, item = {}) {
  const code = productCodeOf(item);
  if (!code) return;
  const qty = toNumber(item.quantity || item.qty || 0);
  for (const row of Array.isArray(data.stock) ? data.stock : []) {
    if (productCodeOf(row) === code) row.availableQty = toNumber(row.availableQty || row.quantity || row.qty || 0) - qty;
  }
}

function nextCode(data = {}, key, prefix) {
  const rows = Array.isArray(data[key]) ? data[key] : [];
  return `${prefix}${Date.now()}${String(rows.length + 1).padStart(3, '0')}`;
}

function buildSalesCode(data = {}) {
  return nextCode(data, 'salesOrders', 'SO');
}

function buildCashCode(data = {}) {
  return nextCode(data, 'cashbooks', 'CB');
}

function updateSalesOrderWithRepost(data = {}, order = {}, patch = {}) {
  Object.assign(order, patch, { updatedAt: new Date().toISOString() });
  return order;
}

function buildMobileProduct(product = {}) {
  return productMongoToClient(product);
}

function writeMobileLog(data = {}, user = {}, action = '', meta = {}) {
  data.mobileLogs = Array.isArray(data.mobileLogs) ? data.mobileLogs : [];
  data.mobileLogs.push({
    id: makeId('ML'),
    action,
    actorCode: user.code || user.staffCode || '',
    actorName: user.fullName || user.name || '',
    ...meta,
    createdAt: new Date().toISOString()
  });
}

async function writeMobileLogDirect(user = {}, action = '', meta = {}, options = {}) {
  const doc = {
    id: makeId('ML'),
    action,
    actorCode: user.code || user.staffCode || '',
    actorName: user.fullName || user.name || '',
    ...meta,
    createdAt: new Date().toISOString()
  };

  const session = options.session || null;
  const created = await MobileLog.create([doc], session ? { session } : {});
  return created[0];
}

function createMobileContext() {
  return {
    ROLE_LABELS,
    VALID_ROLES,
    ACCESS_TOKEN_EXPIRES_IN,

    authLimiter,
    requireMobileLogin,
    requireMobileRole,
    validateRequest,

    normalizeText,
    toNumber,
    makeId,
    stripMongoFields,
    formatCaseLooseQty,

    buildJwtPayload,
    staffMongoToClient,
    customerMongoToClient,
    productMongoToClient,

    encodeMobileToken,
    encodeMobileRefreshToken,
    decodeMobileRefreshToken,

    getPrimaryDataSnapshot,
    persistPrimaryDataSnapshot,
    saveOperationalData,
    refreshOrderDocumentCacheFromMongo,

    writeMobileLog,
    writeMobileLogDirect,
    findCustomer,
    findProduct,
    getProductAvailableQty,
    buildProductLineMeta,
    reduceStock,
    buildSalesCode,
    buildCashCode,
    updateSalesOrderWithRepost,
    buildMobileProduct,

    MongoStore,
    postingEngine
  };
}

module.exports = {
  createMobileContext
};

// MOBILE_MODULAR_CONTEXT_END
