require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { body, validationResult } = require('express-validator');
const { parseExcelBuffer } = require('../../utils/excelParser');
const { previewImport, commitImport } = require('../../services/importService');
const { buildImportTemplate, getTemplateTypes, TEMPLATE_DEFINITIONS } = require('../../services/excelTemplateService');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { MongoStore } = require('../services/mongoSyncService');
const { createAppDataService } = require('../services/appData.service');
const { registerMobileRoutes } = require('../routes/mobileRoutes');
const { registerStaticRoutes } = require('../routes/static.routes');
const { registerHealthRoutes } = require('../routes/health.routes');
const { registerApiRoutes } = require('../routes');
const { ensureMongoIndexes } = require('../services/mongoIndexService');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken']
});

const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(48).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || require('crypto').randomBytes(48).toString('hex');
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '1d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  logger.warn('JWT_SECRET/JWT_REFRESH_SECRET chưa được cấu hình trong .env. Server đang dùng secret tạm thời; token sẽ mất hiệu lực sau khi restart.');
}

// PHASE 2: MongoStore được chuẩn hóa trong src/models/index.js, không tạo loose model trực tiếp trong server.js.

let APP_DATA_CACHE = null;
let MONGO_WRITE_QUEUE = Promise.resolve();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 1200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, success: false, message: 'Đăng nhập quá nhiều lần, vui lòng thử lại sau' }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'kho-data.json');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};
const VALID_ROLES = Object.keys(ROLE_LABELS);


app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(v => v.trim()) : true }));
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);
app.use(inputSanitizer);
app.use(responseFormatter);

// Phase route split: mount routes-controller-service-repository trước legacy fallback.
registerApiRoutes(app);

// Phase 2.9: tách mobile API ra route/controller/service riêng và mount trước legacy fallback.
const routeContext = {
  authLimiter,
  validateRequest,
  requireMobileLogin,
  requireMobileRole,
  ROLE_LABELS,
  VALID_ROLES,
  ACCESS_TOKEN_EXPIRES_IN,
  normalizeText,
  toNumber,
  verifyPasswordSync,
  staffMongoToClient,
  customerMongoToClient,
  productMongoToClient,
  stripMongoFields,
  buildJwtPayload,
  encodeMobileToken,
  encodeMobileRefreshToken,
  decodeMobileRefreshToken,
  getPrimaryDataSnapshot,
  persistPrimaryDataSnapshot,
  saveOperationalData,
  refreshOrderDocumentCacheFromMongo,
  writeMobileLog,
  findCustomer,
  findProduct,
  getProductAvailableQty,
  formatCaseLooseQty,
  buildProductLineMeta,
  reduceStock,
  makeId,
  buildSalesCode,
  buildCashCode,
  updateSalesOrderWithRepost,
  buildMobileProduct,
  buildDebtLedgerRows,
  getOrderDeliveryDate,
  isOrderApprovedForDelivery,
  getOrderDeliveryInfo,
  isOrderAssignedToDeliveryUser,
  buildDeliveryOrderRow,
  isDeliveryOrderActive,
  createReceiptDocument,
  auditLog,
  buildReturnItemsFromRequest,
  createReturnOrderDocument
};
registerMobileRoutes(app, routeContext);


// Phase 2.7: các API nghiệp vụ chính phải đi qua route/controller/service/repository Mongo.
// Legacy JSON chỉ được bật lại tạm thời bằng ENABLE_LEGACY_JSON=true để cứu dữ liệu hoặc debug migration.
const ENABLE_LEGACY_JSON = process.env.ENABLE_LEGACY_JSON === 'true';
const ALLOWED_LEGACY_API_PREFIXES = []; // Phase 2.10: không còn cho API nghiệp vụ rơi về legacy JSON.

app.use('/api', (req, res, next) => {
  if (ENABLE_LEGACY_JSON) return next();
  if (ALLOWED_LEGACY_API_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) return next();
  return res.status(410).json({
    ok: false,
    success: false,
    source: 'mongo-primary-route-guard',
    message: 'API legacy JSON đã bị tắt khỏi nghiệp vụ chính. Hãy dùng route Mongo mới hoặc bật ENABLE_LEGACY_JSON=true để debug tạm thời.'
  });
});

// Mobile delivery UI V45: chống cache để Render/trình duyệt không giữ mẫu cũ.
app.use('/mobile', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, '..', '..', 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}public${path.sep}mobile${path.sep}`)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }
}));

function createEmptyData() {
  return {
    products: [],
    customers: [],
    staffs: [],
    warehouses: [],
    stock: [],
    importOrders: [],
    salesOrders: [],
    masterOrders: [],
    payments: [],
    receipts: [],
    returnOrders: [],
    cashbooks: [],
    bankbooks: [],
    cashbook: [],
    importLogs: [],
    mobileLogs: [],
    auditLogs: [],
    promotions: [],
    importTemplates: [],
    roles: [],
    permissions: []
  };
}

const APP_COLLECTION_KEYS = Object.keys(createEmptyData());
let appDataService = null;

function getAppDataService() {
  if (!appDataService) {
    appDataService = createAppDataService({
      collectionKeys: APP_COLLECTION_KEYS,
      normalizeData,
      ensureDefaultStaffAccounts: ensureDefaultAccessData
    });
  }
  return appDataService;
}

function createDefaultStaffAccounts() {
  const now = new Date().toISOString();
  return [
    { id: 'U_ADMIN', code: 'ADMIN', username: 'admin', password: hashPasswordSync('admin'), name: 'Quản trị hệ thống', role: 'admin', roleLabel: ROLE_LABELS.admin, isActive: true, createdAt: now, updatedAt: now },
    { id: 'U_KT01', code: 'KT01', username: 'ketoan', password: hashPasswordSync('123456'), name: 'Tài khoản kế toán', role: 'accountant', roleLabel: ROLE_LABELS.accountant, isActive: true, createdAt: now, updatedAt: now },
    { id: 'U_BH01', code: 'BH01', username: 'banhang', password: hashPasswordSync('123456'), name: 'Tài khoản bán hàng', role: 'sales', roleLabel: ROLE_LABELS.sales, isActive: true, createdAt: now, updatedAt: now },
    { id: 'U_GH01', code: 'GH01', username: 'giaohang', password: hashPasswordSync('123456'), name: 'Tài khoản giao hàng', role: 'delivery', roleLabel: ROLE_LABELS.delivery, isActive: true, createdAt: now, updatedAt: now }
  ];
}

function ensureDefaultStaffAccounts(data) {
  if (!Array.isArray(data.staffs)) data.staffs = [];
  const defaults = createDefaultStaffAccounts();
  defaults.forEach((account) => {
    const existed = data.staffs.some((staff) => normalizeText(staff.username) === normalizeText(account.username) || normalizeText(staff.code) === normalizeText(account.code));
    if (!existed) data.staffs.push(account);
  });

  return data;
}


function createDefaultRoles() {
  return [
    { code: 'admin', name: 'Admin - toàn quyền', description: 'Quản trị toàn bộ hệ thống', isActive: true },
    { code: 'accountant', name: 'Kế toán', description: 'Quản lý công nợ, phiếu thu, quỹ tiền và báo cáo', isActive: true },
    { code: 'sales', name: 'Bán hàng', description: 'Tạo/sửa đơn bán và chăm sóc khách hàng được phân công', isActive: true },
    { code: 'delivery', name: 'Giao hàng', description: 'Xem đơn giao, xác nhận giao hàng, thu tiền và trả hàng trên mobile', isActive: true }
  ];
}

function createDefaultPermissions() {
  const modules = ['dashboard', 'products', 'customers', 'orders', 'imports', 'masterOrders', 'delivery', 'debts', 'cashbook', 'reports', 'users', 'promotions'];
  const matrix = {
    admin: { view: true, create: true, edit: true, delete: true, approve: true, export: true },
    accountant: { view: true, create: true, edit: true, delete: false, approve: true, export: true },
    sales: { view: true, create: true, edit: true, delete: false, approve: false, export: false },
    delivery: { view: true, create: true, edit: true, delete: false, approve: false, export: false }
  };
  const limited = {
    sales: new Set(['dashboard', 'products', 'customers', 'orders', 'delivery']),
    delivery: new Set(['dashboard', 'customers', 'delivery'])
  };
  return Object.entries(matrix).flatMap(([roleCode, base]) => modules.map((module) => {
    const allowed = !limited[roleCode] || limited[roleCode].has(module);
    return { roleCode, module, ...Object.fromEntries(Object.keys(base).map((key) => [key, allowed ? base[key] : false])) };
  }));
}

function ensureDefaultRolesPermissionsInData(data) {
  if (!Array.isArray(data.roles)) data.roles = [];
  if (!Array.isArray(data.permissions)) data.permissions = [];
  for (const role of createDefaultRoles()) {
    const existed = data.roles.some((item) => normalizeText(item.code) === normalizeText(role.code));
    if (!existed) data.roles.push({ ...role, id: role.code, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  for (const permission of createDefaultPermissions()) {
    const existed = data.permissions.some((item) => normalizeText(item.roleCode) === normalizeText(permission.roleCode) && normalizeText(item.module) === normalizeText(permission.module));
    if (!existed) data.permissions.push({ ...permission, id: `${permission.roleCode}_${permission.module}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  return data;
}

function ensureDefaultAccessData(data) {
  return ensureDefaultRolesPermissionsInData(ensureDefaultStaffAccounts(data));
}

function ensureDataFile() {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyData(), null, 2), 'utf8');
}

function makeId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeString(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

function deepSanitize(value) {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => { value[key] = deepSanitize(value[key]); });
  }
  return value;
}

function inputSanitizer(req, res, next) {
  if (req.body) req.body = deepSanitize(req.body);
  if (req.query) req.query = deepSanitize(req.query);
  if (req.params) req.params = deepSanitize(req.params);
  next();
}

function responseFormatter(req, res, next) {
  const originalJson = res.json.bind(res);
  res.success = (data = null, message = 'OK', status = 200, extra = {}) => res.status(status).json({ ok: true, success: true, message, data, ...extra });
  res.fail = (message = 'Có lỗi xảy ra', status = 400, error = null, extra = {}) => res.status(status).json({ ok: false, success: false, message, error, ...extra });
  res.json = (payload = {}) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if (payload.ok === undefined && payload.success === undefined) payload.success = true;
      if (payload.ok !== undefined && payload.success === undefined) payload.success = payload.ok === true;
      if (payload.success !== undefined && payload.ok === undefined) payload.ok = payload.success === true;
      if (payload.error && process.env.NODE_ENV === 'production' && typeof payload.error === 'string') payload.error = 'Internal server error';
    }
    return originalJson(payload);
  };
  next();
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({ ok: false, success: false, message: 'Dữ liệu không hợp lệ', error: errors.array().map(e => ({ field: e.path, message: e.msg })) });
}

function hashPasswordSync(password) {
  return bcrypt.hashSync(String(password || ''), BCRYPT_ROUNDS);
}

function isBcryptHash(password) {
  return /^\$2[aby]\$\d{2}\$/.test(String(password || ''));
}

function verifyPasswordSync(inputPassword, storedPassword) {
  const stored = String(storedPassword || '');
  const input = String(inputPassword || '');
  if (!stored) return false;
  if (isBcryptHash(stored)) return bcrypt.compareSync(input, stored);
  return stored === input;
}

function buildJwtPayload(user) {
  return {
    id: user.id || user.code || user.username || 'mobile-user',
    username: user.username || user.code || user.name || 'mobile',
    name: user.name || user.fullName || user.username || 'Nhân viên',
    code: user.code || '',
    role: user.role || user.type || 'sales'
  };
}

function signAccessToken(user) {
  return jwt.sign(buildJwtPayload(user), JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function signRefreshToken(user) {
  return jwt.sign({ ...buildJwtPayload(user), tokenType: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizePacking(product) {
  const unit = String(product.unit || 'Cái').trim() || 'Cái';
  const baseUnit = String(product.baseUnit || product.base_unit || product.smallUnit || '').trim();
  const conversionRate = Math.max(1, toNumber(product.conversionRate || product.conversion_rate || product.ratio || 1));
  const packingText = String(product.packing || '').trim() || (baseUnit && conversionRate > 1 ? `1 ${unit} = ${conversionRate} ${baseUnit}` : '');
  const units = Array.isArray(product.units) && product.units.length
    ? product.units.map((u) => ({
        name: String(u.name || '').trim(),
        ratio: Math.max(1, toNumber(u.ratio || 1)),
        isBase: u.isBase === true,
        isDefaultSale: u.isDefaultSale === true
      })).filter((u) => u.name)
    : [];

  if (!units.length) {
    if (baseUnit) units.push({ name: baseUnit, ratio: 1, isBase: true, isDefaultSale: false });
    units.push({ name: unit, ratio: conversionRate, isBase: false, isDefaultSale: true });
  }

  return { unit, baseUnit, conversionRate, packing: packingText, units };
}

function normalizeData(data) {
  const emptyData = createEmptyData();
  Object.keys(emptyData).forEach((key) => {
    if (!Array.isArray(data[key])) data[key] = [];
  });

  data.products = data.products.map((product) => ({
    id: product.id || makeId('P'),
    code: String(product.code || '').trim(),
    name: String(product.name || '').trim(),
    ...normalizePacking(product),
    barcode: String(product.barcode || '').trim(),
    category: String(product.category || '').trim(),
    costPrice: toNumber(product.costPrice),
    salePrice: toNumber(product.salePrice),
    minStock: toNumber(product.minStock),
    maxStock: toNumber(product.maxStock),
    isActive: product.isActive !== false,
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || product.createdAt || new Date().toISOString()
  }));

  data.customers = data.customers.map((customer) => ({
    id: customer.id || makeId('C'),
    code: String(customer.code || '').trim(),
    name: String(customer.name || '').trim(),
    phone: String(customer.phone || '').trim(),
    address: String(customer.address || '').trim(),
    area: String(customer.area || '').trim(),
    staffName: String(customer.staffName || '').trim(),
    isActive: customer.isActive !== false,
    createdAt: customer.createdAt || new Date().toISOString(),
    updatedAt: customer.updatedAt || customer.createdAt || new Date().toISOString()
  }));

  data.staffs = data.staffs.map((staff) => {
    const role = VALID_ROLES.includes(String(staff.role || '').trim()) ? String(staff.role || '').trim() : 'sales';
    return {
      id: staff.id || makeId('U'),
      code: String(staff.code || staff.username || '').trim(),
      username: String(staff.username || staff.code || '').trim(),
      password: isBcryptHash(staff.password || '') ? String(staff.password) : hashPasswordSync(staff.password || staff.pass || staff.pin || '123456'),
      name: String(staff.name || staff.fullName || staff.username || staff.code || '').trim(),
      phone: String(staff.phone || '').trim(),
      role,
      roleLabel: ROLE_LABELS[role] || role,
      isActive: staff.isActive !== false,
      createdAt: staff.createdAt || new Date().toISOString(),
      updatedAt: staff.updatedAt || staff.createdAt || new Date().toISOString()
    };
  });

  data.stock = data.stock.map((row) => ({
    productId: row.productId || '',
    productCode: String(row.productCode || '').trim(),
    productName: String(row.productName || '').trim(),
    unit: String(row.unit || '').trim(),
    quantity: toNumber(row.quantity),
    updatedAt: row.updatedAt || new Date().toISOString()
  }));

  data.importOrders = data.importOrders.map((order) => ({
    id: order.id || makeId('IM'),
    code: order.code || '',
    date: order.date || new Date().toISOString().slice(0, 10),
    supplier: order.supplier || '',
    note: order.note || '',
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount),
    createdAt: order.createdAt || new Date().toISOString()
  }));

  data.salesOrders = data.salesOrders.map((order) => ({
    id: order.id || makeId('SO'),
    code: order.code || '',
    date: order.date || new Date().toISOString().slice(0, 10),
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerAddress: order.customerAddress || '',
    note: order.note || '',
    orderSource: order.orderSource || order.sourceType || order.childOrderSource || 'NVBH',
    orderSourceName: order.orderSourceName || (order.orderSource === 'DMS' ? 'Từ DMS' : 'Từ NVBH'),
    salesStaffId: String(order.salesStaffId || '').trim(),
    salesStaffCode: String(order.salesStaffCode || order.staffCode || '').trim(),
    salesStaffName: String(order.salesStaffName || order.staffName || '').trim(),
    staffCode: String(order.staffCode || order.salesStaffCode || '').trim(),
    staffName: String(order.staffName || order.salesStaffName || '').trim(),
    isChildOrder: order.isChildOrder !== false,
    masterOrderId: order.masterOrderId || '',
    masterOrderCode: order.masterOrderCode || '',
    mergeStatus: order.mergeStatus || (order.masterOrderId ? 'merged' : 'unmerged'),
    deliveryDate: String(order.deliveryDate || order.expectedDeliveryDate || order.shipDate || '').slice(0, 10),
    deliveryStatus: order.deliveryStatus || 'pending',
    deliveryStaffId: String(order.deliveryStaffId || '').trim(),
    deliveryStaffCode: String(order.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(order.deliveryStaffName || '').trim(),
    routeName: String(order.routeName || order.deliveryRoute || '').trim(),
    deliveryRoute: String(order.deliveryRoute || order.routeName || '').trim(),
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    debtAmount: toNumber(order.debtAmount),
    status: order.status || 'posted',
    createdAt: order.createdAt || new Date().toISOString()
  }));


  data.masterOrders = data.masterOrders.map((order) => ({
    id: order.id || makeId('MO'),
    code: order.code || '',
    date: order.date || order.deliveryDate || new Date().toISOString().slice(0, 10),
    deliveryDate: String(order.deliveryDate || order.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    routeName: String(order.routeName || '').trim(),
    deliveryStaffId: String(order.deliveryStaffId || '').trim(),
    deliveryStaffCode: String(order.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(order.deliveryStaffName || '').trim(),
    salesStaffId: String(order.salesStaffId || '').trim(),
    salesStaffCode: String(order.salesStaffCode || '').trim(),
    salesStaffName: String(order.salesStaffName || '').trim(),
    note: String(order.note || '').trim(),
    childOrderIds: Array.isArray(order.childOrderIds) ? order.childOrderIds : [],
    totalOrders: toNumber(order.totalOrders),
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount),
    totalPaid: toNumber(order.totalPaid),
    totalDebt: toNumber(order.totalDebt),
    status: order.status || 'assigned',
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || order.createdAt || new Date().toISOString()
  }));

  data.payments = data.payments.map((payment) => ({
    id: payment.id || makeId('PM'),
    date: payment.date || new Date().toISOString().slice(0, 10),
    type: payment.type || 'debt',
    refType: payment.refType || '',
    refId: payment.refId || '',
    refCode: payment.refCode || '',
    customerId: payment.customerId || '',
    customerCode: payment.customerCode || '',
    customerName: payment.customerName || '',
    debit: toNumber(payment.debit),
    credit: toNumber(payment.credit),
    note: payment.note || '',
    createdAt: payment.createdAt || new Date().toISOString()
  }));

  data.receipts = (data.receipts || []).map((receipt) => ({
    id: receipt.id || makeId('RC'),
    code: receipt.code || '',
    date: receipt.date || new Date().toISOString().slice(0, 10),
    customerId: receipt.customerId || '',
    customerCode: receipt.customerCode || '',
    customerName: receipt.customerName || '',
    method: ['cash', 'transfer'].includes(String(receipt.method || '').toLowerCase()) ? String(receipt.method).toLowerCase() : 'cash',
    amount: toNumber(receipt.amount),
    staffName: receipt.staffName || '',
    note: receipt.note || '',
    refType: receipt.refType || 'receipt',
    refId: receipt.refId || '',
    refCode: receipt.refCode || '',
    status: receipt.status === 'void' || receipt.status === 'cancelled' ? 'void' : 'posted',
    voidReason: receipt.voidReason || '',
    voidedAt: receipt.voidedAt || '',
    createdAt: receipt.createdAt || new Date().toISOString(),
    updatedAt: receipt.updatedAt || receipt.createdAt || new Date().toISOString()
  }));

  data.returnOrders = (data.returnOrders || []).map((order) => ({
    id: order.id || makeId('RT'),
    code: order.code || '',
    date: order.date || new Date().toISOString().slice(0, 10),
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    salesOrderId: order.salesOrderId || order.refId || '',
    salesOrderCode: order.salesOrderCode || order.refCode || '',
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount || order.amount),
    staffName: order.staffName || '',
    note: order.note || '',
    status: order.status === 'void' || order.status === 'cancelled' ? 'void' : 'posted',
    voidReason: order.voidReason || '',
    voidedAt: order.voidedAt || '',
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || order.createdAt || new Date().toISOString()
  }));

  data.cashbooks = (data.cashbooks || data.cashbook || []).map((entry) => ({
    id: entry.id || makeId('CB'),
    code: entry.code || '',
    date: entry.date || new Date().toISOString().slice(0, 10),
    type: entry.type || 'in',
    source: entry.source || '',
    refType: entry.refType || '',
    refId: entry.refId || '',
    refCode: entry.refCode || '',
    customerId: entry.customerId || '',
    customerCode: entry.customerCode || '',
    customerName: entry.customerName || '',
    staffName: entry.staffName || '',
    method: entry.method || 'cash',
    amount: toNumber(entry.amount),
    note: entry.note || '',
    status: entry.status === 'void' || entry.status === 'cancelled' ? 'void' : 'posted',
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
  }));

  data.bankbooks = (data.bankbooks || []).map((entry) => ({
    id: entry.id || makeId('BB'),
    code: entry.code || '',
    date: entry.date || new Date().toISOString().slice(0, 10),
    type: entry.type || 'in',
    source: entry.source || '',
    refType: entry.refType || '',
    refId: entry.refId || '',
    refCode: entry.refCode || '',
    customerId: entry.customerId || '',
    customerCode: entry.customerCode || '',
    customerName: entry.customerName || '',
    staffName: entry.staffName || '',
    amount: toNumber(entry.amount),
    note: entry.note || '',
    status: entry.status === 'void' || entry.status === 'cancelled' ? 'void' : 'posted',
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
  }));

  data.cashbook = data.cashbooks;


  data.importLogs = data.importLogs.map((log) => ({
    id: log.id || makeId('IL'),
    type: log.type || '',
    imported: toNumber(log.imported),
    totalRows: toNumber(log.totalRows),
    createdAt: log.createdAt || new Date().toISOString()
  }));

  data.mobileLogs = data.mobileLogs.map((log) => ({
    id: log.id || makeId('ML'),
    action: log.action || '',
    refType: log.refType || '',
    refId: log.refId || '',
    refCode: log.refCode || '',
    userId: log.userId || '',
    userCode: log.userCode || '',
    userName: log.userName || '',
    note: log.note || '',
    createdAt: log.createdAt || new Date().toISOString()
  }));

  data.auditLogs = (data.auditLogs || []).map((log) => ({
    id: log.id || makeId('AL'),
    action: log.action || '',
    refType: log.refType || '',
    refId: log.refId || '',
    refCode: log.refCode || '',
    before: log.before || null,
    after: log.after || null,
    note: log.note || '',
    userName: log.userName || '',
    createdAt: log.createdAt || new Date().toISOString()
  }));

  data.promotions = (data.promotions || []).map((promotion) => ({
    id: promotion.id || makeId('KM'),
    code: String(promotion.code || '').trim(),
    name: String(promotion.name || '').trim(),
    type: String(promotion.type || 'discount').trim(),
    productCodes: Array.isArray(promotion.productCodes)
      ? promotion.productCodes.map((code) => String(code || '').trim()).filter(Boolean)
      : String(promotion.productCodes || promotion.productCode || '').split(/[;,\n]/).map((code) => String(code || '').trim()).filter(Boolean),
    conditionText: String(promotion.conditionText || promotion.condition || '').trim(),
    discountText: String(promotion.discountText || promotion.discount || '').trim(),
    displayReward: String(promotion.displayReward || promotion.display || '').trim(),
    couponText: String(promotion.couponText || promotion.coupon || '').trim(),
    ontopText: String(promotion.ontopText || promotion.ontop || '').trim(),
    startDate: String(promotion.startDate || '').slice(0, 10),
    endDate: String(promotion.endDate || '').slice(0, 10),
    note: String(promotion.note || '').trim(),
    isActive: promotion.isActive !== false,
    createdAt: promotion.createdAt || new Date().toISOString(),
    updatedAt: promotion.updatedAt || promotion.createdAt || new Date().toISOString()
  }));

  data.importTemplates = (data.importTemplates || []).map((template) => ({
    id: template.id || makeId('IT'),
    code: String(template.code || template.id || '').trim() || makeId('IT'),
    name: String(template.name || '').trim() || 'Mẫu import tự tạo',
    type: String(template.type || '').trim(),
    sheetName: String(template.sheetName || 'Import').trim(),
    startRow: toNumber(template.startRow) || 2,
    fields: Array.isArray(template.fields) ? template.fields.map((field) => ({
      excelHeader: String(field.excelHeader || field.header || '').trim(),
      dbField: String(field.dbField || '').trim(),
      required: field.required === true,
      defaultValue: field.defaultValue === undefined ? '' : String(field.defaultValue)
    })).filter((field) => field.excelHeader && field.dbField) : [],
    isActive: template.isActive !== false,
    createdAt: template.createdAt || new Date().toISOString(),
    updatedAt: template.updatedAt || template.createdAt || new Date().toISOString()
  }));

  return data;
}

function readJsonDataFile() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = raw ? JSON.parse(raw) : createEmptyData();
  return normalizeData(ensureDefaultAccessData(data));
}

function stripMongoFields(doc) {
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  if (raw._id && !raw.id) raw.id = String(raw._id);
  delete raw._id;
  delete raw.__v;
  return raw;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || createEmptyData()));
}

function uniqRows(rows, keyFields = ['id', 'code']) {
  const seen = new Set();
  const output = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = keyFields.map((key) => normalizeText(row && row[key])).find(Boolean) || JSON.stringify(row || {});
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function normalizeForCollection(key, rows) {
  const normalized = normalizeData({ ...createEmptyData(), [key]: rows })[key] || [];
  if (key === 'products') return uniqRows(normalized, ['code', 'id']).map(({ _id, __v, ...row }) => row);
  if (key === 'customers') return uniqRows(normalized, ['code', 'id']).map(({ _id, __v, ...row }) => row);
  if (key === 'staffs') return uniqRows(normalized, ['username', 'code', 'id']).map(({ _id, __v, ...row }) => row);
  if (key === 'roles') return uniqRows(normalized, ['code', 'id']).map(({ _id, __v, ...row }) => row);
  if (key === 'permissions') return uniqRows(normalized, ['roleCode', 'module', 'id']).map(({ _id, __v, ...row }) => row);
  if (key === 'promotions') return uniqRows(normalized, ['code', 'id']).map(({ _id, __v, ...row }) => row);
  return uniqRows(normalized, ['id', 'code']).map(({ _id, __v, ...row }) => row);
}

async function persistCollectionToMongo(key, rows) {
  const Model = MongoStore[key];
  if (!Model) return;
  const cleanRows = normalizeForCollection(key, rows);
  await Model.deleteMany({});
  if (cleanRows.length) await Model.insertMany(cleanRows, { ordered: false });
  console.log(`✅ Mongo sync ${Model.collection.name}: ${cleanRows.length} documents`);
}

async function persistAllDataToMongo(data) {
  const normalized = await getAppDataService().persistPrimaryData(cloneData(data));

  const settingsPayload = {
    key: 'app_state',
    primaryDataSource: 'mongodb',
    jsonUsage: 'backup-only',
    updatedAt: new Date().toISOString(),
    counters: Object.fromEntries(APP_COLLECTION_KEYS.map((key) => [key, (normalized[key] || []).length]))
  };
  await MongoStore.settings.deleteMany({ key: 'app_state' });
  await MongoStore.settings.create(settingsPayload);
}

function queueMongoPersist(data) {
  const snapshot = cloneData(data);
  MONGO_WRITE_QUEUE = MONGO_WRITE_QUEUE
    .then(() => persistAllDataToMongo(snapshot))
    .catch((error) => console.error('❌ Mongo persist error:', error.message));
  return MONGO_WRITE_QUEUE;
}


async function getPrimaryDataSnapshot() {
  APP_DATA_CACHE = await getAppDataService().loadPrimaryData();
  return cloneData(APP_DATA_CACHE);
}

async function persistPrimaryDataSnapshot(data) {
  const normalized = normalizeData(ensureDefaultAccessData(cloneData(data)));
  APP_DATA_CACHE = normalized;
  await getAppDataService().persistPrimaryData(normalized);
  return cloneData(APP_DATA_CACHE);
}

function queueJsonBackup(data) {
  const normalized = normalizeData(ensureDefaultAccessData(cloneData(data)));
  try {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  } catch (error) {
    console.warn('⚠️ Không ghi được file backup JSON:', error.message);
  }
}
function readData() {
  // Legacy compatibility only: không dùng làm nguồn dữ liệu nghiệp vụ chính.
  if (!APP_DATA_CACHE) APP_DATA_CACHE = createEmptyData();
  return cloneData(APP_DATA_CACHE);
}

function writeData(data) {
  // Legacy compatibility only: ghi Mongo primary, JSON backup tách riêng qua /api/system/backup-json.
  return persistPrimaryDataSnapshot(data);
}

async function loadMongoDataToCache() {
  APP_DATA_CACHE = await getAppDataService().loadPrimaryData();
  console.log('✅ Đã nạp dữ liệu từ Mongo vào cache:', Object.fromEntries(APP_COLLECTION_KEYS.map((key) => [key, (APP_DATA_CACHE[key] || []).length])));
  return APP_DATA_CACHE;
}

async function migrateJsonToMongoIfEmpty() {
  const jsonData = readJsonDataFile();
  for (const key of APP_COLLECTION_KEYS) {
    const Model = MongoStore[key];
    const count = await Model.countDocuments();
    const rows = jsonData[key] || [];
    if (count === 0 && rows.length > 0) {
      await persistCollectionToMongo(key, rows);
      console.log(`✅ Migrate ${key} từ kho-data.json sang Mongo: ${rows.length} dòng`);
    } else {
      console.log(`ℹ️ ${Model.collection.name}: Mongo hiện có ${count} documents, JSON có ${rows.length} dòng`);
    }
  }
}

async function refreshProductCacheFromMongo() {
  if (!APP_DATA_CACHE) APP_DATA_CACHE = createEmptyData();
  const products = await Product.find({}).sort({ code: 1 }).lean();
  APP_DATA_CACHE.products = normalizeForCollection('products', products.map(stripMongoFields));
}

async function refreshCustomerCacheFromMongo() {
  if (!APP_DATA_CACHE) APP_DATA_CACHE = createEmptyData();
  const customers = await Customer.find({}).sort({ code: 1 }).lean();
  APP_DATA_CACHE.customers = normalizeForCollection('customers', customers.map(stripMongoFields));
}

async function refreshAccessCacheFromMongo() {
  if (!APP_DATA_CACHE) APP_DATA_CACHE = createEmptyData();
  const [staffs, roles, permissions] = await Promise.all([
    MongoStore.staffs.find({}).sort({ code: 1, username: 1 }).lean(),
    MongoStore.roles.find({}).sort({ code: 1 }).lean(),
    MongoStore.permissions.find({}).sort({ roleCode: 1, module: 1 }).lean()
  ]);
  APP_DATA_CACHE.staffs = normalizeForCollection('staffs', staffs.map(stripMongoFields));
  APP_DATA_CACHE.roles = normalizeForCollection('roles', roles.map(stripMongoFields));
  APP_DATA_CACHE.permissions = normalizeForCollection('permissions', permissions.map(stripMongoFields));
}

function staffMongoToClient(staff) {
  const raw = typeof staff.toObject === 'function' ? staff.toObject() : (staff || {});
  const code = String(raw.code || raw.staffCode || raw.username || raw._id || '').trim();
  const role = VALID_ROLES.includes(String(raw.role || '').trim()) ? String(raw.role).trim() : 'sales';
  return {
    ...raw,
    id: raw.id || code,
    _id: raw._id ? String(raw._id) : undefined,
    code,
    username: raw.username || code,
    name: raw.name || raw.fullName || raw.username || code,
    fullName: raw.fullName || raw.name || raw.username || code,
    phone: raw.phone || '',
    role,
    roleLabel: ROLE_LABELS[role] || role,
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

function pickStaffPayload(body, current = null) {
  const role = VALID_ROLES.includes(String(body.role || current?.role || '').trim()) ? String(body.role || current?.role).trim() : 'sales';
  const code = String(body.code || body.staffCode || current?.code || body.username || '').trim();
  const username = String(body.username || current?.username || code).trim();
  const passwordInput = String(body.password || '').trim();
  const payload = {
    id: String(body.id || current?.id || code || username || makeId('U')).trim(),
    code,
    username,
    name: String(body.name || body.fullName || current?.name || current?.fullName || username).trim(),
    fullName: String(body.fullName || body.name || current?.fullName || current?.name || username).trim(),
    phone: String(body.phone || current?.phone || '').trim(),
    role,
    roleLabel: ROLE_LABELS[role] || role,
    isSalesman: role === 'sales',
    isDelivery: role === 'delivery',
    isActive: body.isActive !== false
  };
  if (passwordInput) payload.password = isBcryptHash(passwordInput) ? passwordInput : hashPasswordSync(passwordInput);
  else if (current?.password) payload.password = current.password;
  else payload.password = hashPasswordSync('123456');
  return payload;
}

function validateStaff(payload) {
  if (!payload.code) return 'Thiếu mã nhân viên/tài khoản';
  if (!payload.username) return 'Thiếu tên đăng nhập';
  if (!payload.name) return 'Thiếu tên nhân viên';
  if (!VALID_ROLES.includes(payload.role)) return 'Vai trò không hợp lệ';
  return '';
}

function buildStaffMongoFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  const filters = [{ id: value }, { code: value }, { username: value }];
  if (/^[a-f\d]{24}$/i.test(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

function buildStaffQueryFilter(query = {}) {
  const q = normalizeText(query.q);
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
  if (q) {
    filter.$or = [
      { code: { $regex: q, $options: 'i' } },
      { username: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
      { fullName: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { role: { $regex: q, $options: 'i' } }
    ];
  }
  return filter;
}

async function ensureAccessCollectionsSeeded() {
  for (const role of createDefaultRoles()) {
    await MongoStore.roles.findOneAndUpdate({ code: role.code }, { $setOnInsert: { id: role.code, ...role } }, { upsert: true, setDefaultsOnInsert: true });
  }
  for (const permission of createDefaultPermissions()) {
    await MongoStore.permissions.findOneAndUpdate(
      { roleCode: permission.roleCode, module: permission.module },
      { $setOnInsert: { id: `${permission.roleCode}_${permission.module}`, ...permission } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  for (const account of createDefaultStaffAccounts()) {
    await MongoStore.staffs.findOneAndUpdate(
      { $or: [{ username: account.username }, { code: account.code }] },
      { $setOnInsert: pickStaffPayload(account) },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
}

function pickProductPayload(body) {
  return {
    code: String(body.code || body.sku || body.productCode || '').trim(),
    name: String(body.name || body.productName || '').trim(),
    ...normalizePacking(body),
    barcode: String(body.barcode || '').trim(),
    category: String(body.category || '').trim(),
    costPrice: toNumber(body.costPrice),
    salePrice: toNumber(body.salePrice),
    minStock: toNumber(body.minStock),
    maxStock: toNumber(body.maxStock),
    isActive: body.isActive !== false
  };
}

function validateProduct(payload) {
  if (!payload.code) return 'Thiếu mã sản phẩm';
  if (!payload.name) return 'Thiếu tên sản phẩm';
  if (payload.conversionRate < 1) return 'Quy đổi phải lớn hơn hoặc bằng 1';
  if (payload.costPrice < 0 || payload.salePrice < 0) return 'Giá nhập / giá bán không được âm';
  if (payload.minStock < 0 || payload.maxStock < 0) return 'Tồn tối thiểu / tối đa không được âm';
  if (payload.maxStock > 0 && payload.minStock > payload.maxStock) return 'Tồn tối thiểu không được lớn hơn tồn tối đa';
  return '';
}


function productMongoToClient(product) {
  const raw = typeof product.toObject === 'function' ? product.toObject() : product;
  const code = String(raw.code || raw.sku || raw.productCode || raw.id || raw._id || '').trim();
  const stockQuantity = toNumber(raw.availableStock ?? raw.stockQuantity ?? raw.availableQty ?? raw.openingStock ?? 0);
  return {
    ...raw,
    code,
    sku: raw.sku || code,
    productCode: raw.productCode || code,
    id: code, // Dùng mã sản phẩm làm khóa nghiệp vụ ổn định, không phụ thuộc Mongo _id.
    _id: raw._id ? String(raw._id) : undefined,
    stockQuantity,
    availableQty: stockQuantity,
    stockDisplay: formatCaseLooseQty(stockQuantity, raw.conversionRate || 1),
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

function buildProductMongoFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  const filters = [{ code: value }];
  if (/^[a-f\d]{24}$/i.test(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

async function migrateJsonProductsToMongoIfNeeded() {
  try {
    const data = await getPrimaryDataSnapshot();
    const products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) return;

    let inserted = 0;
    for (const item of products) {
      const payload = pickProductPayload(item);
      if (!payload.code || !payload.name) continue;
      const existed = await Product.findOne({ code: payload.code }).select('_id').lean();
      if (existed) continue;
      await Product.create(payload);
      inserted += 1;
    }

    if (inserted > 0) {
      console.log(`✅ Đã migrate thêm ${inserted} sản phẩm từ data/kho-data.json sang MongoDB`);
    } else {
      console.log('ℹ️ Products MongoDB đã có dữ liệu, không ghi đè dữ liệu cũ');
    }
  } catch (error) {
    console.error('⚠️ Không migrate được sản phẩm từ JSON sang MongoDB:', error.message);
  }
}

function pickCustomerPayload(body) {
  return {
    code: String(body.code || body.customerCode || '').trim(),
    name: String(body.name || body.customerName || '').trim(),
    phone: String(body.phone || body.customerPhone || '').trim(),
    address: String(body.address || body.customerAddress || '').trim(),
    area: String(body.area || '').trim(),
    route: String(body.route || '').trim(),
    staffCode: String(body.staffCode || '').trim(),
    staffName: String(body.staffName || '').trim(),
    openingDebt: toNumber(body.openingDebt),
    debtLimit: toNumber(body.debtLimit),
    isActive: body.isActive !== false
  };
}

function validateCustomer(payload) {
  if (!payload.code) return 'Thiếu mã khách hàng';
  if (!payload.name) return 'Thiếu tên khách hàng';
  if (payload.openingDebt < 0 || payload.debtLimit < 0) return 'Công nợ đầu kỳ / hạn mức nợ không được âm';
  return '';
}

function customerMongoToClient(customer) {
  const raw = typeof customer.toObject === 'function' ? customer.toObject() : customer;
  const code = String(raw.code || raw.customerCode || raw.id || raw._id || '').trim();
  return {
    ...raw,
    code,
    customerCode: raw.customerCode || code,
    id: code,
    _id: raw._id ? String(raw._id) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

function buildCustomerMongoFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  const filters = [{ code: value }];
  if (/^[a-f\d]{24}$/i.test(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

function buildCustomerQueryFilter(query = {}) {
  const q = normalizeText(query.q);
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
  if (q) {
    filter.$or = [
      { code: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { address: { $regex: q, $options: 'i' } },
      { area: { $regex: q, $options: 'i' } },
      { route: { $regex: q, $options: 'i' } },
      { staffCode: { $regex: q, $options: 'i' } },
      { staffName: { $regex: q, $options: 'i' } }
    ];
  }
  return filter;
}

function buildImportCode(data) {
  return `PN${(data.importOrders.length + 1).toString().padStart(5, '0')}`;
}

function buildSalesCode(data) {
  return `BH${(data.salesOrders.length + 1).toString().padStart(5, '0')}`;
}

function buildMasterOrderCode(data) {
  return `DT${(data.masterOrders.length + 1).toString().padStart(5, '0')}`;
}


function buildOperationalMongoFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  const filters = [{ id: value }, { code: value }];
  if (/^[a-f\d]{24}$/i.test(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

async function refreshFinancialDocumentCacheFromMongo() {
  if (!APP_DATA_CACHE) APP_DATA_CACHE = createEmptyData();
  const [payments, receipts, returnOrders, cashbooks, bankbooks, auditLogs, mobileLogs] = await Promise.all([
    MongoStore.payments.find({}).sort({ createdAt: -1 }).lean(),
    MongoStore.receipts.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.returnOrders.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.cashbooks.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.bankbooks.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.auditLogs.find({}).sort({ createdAt: -1 }).lean(),
    MongoStore.mobileLogs.find({}).sort({ createdAt: -1 }).lean()
  ]);
  APP_DATA_CACHE.payments = normalizeForCollection('payments', payments.map(stripMongoFields));
  APP_DATA_CACHE.receipts = normalizeForCollection('receipts', receipts.map(stripMongoFields));
  APP_DATA_CACHE.returnOrders = normalizeForCollection('returnOrders', returnOrders.map(stripMongoFields));
  APP_DATA_CACHE.cashbooks = normalizeForCollection('cashbooks', cashbooks.map(stripMongoFields));
  APP_DATA_CACHE.cashbook = APP_DATA_CACHE.cashbooks;
  APP_DATA_CACHE.bankbooks = normalizeForCollection('bankbooks', bankbooks.map(stripMongoFields));
  APP_DATA_CACHE.auditLogs = normalizeForCollection('auditLogs', auditLogs.map(stripMongoFields));
  APP_DATA_CACHE.mobileLogs = normalizeForCollection('mobileLogs', mobileLogs.map(stripMongoFields));
}

async function refreshOrderDocumentCacheFromMongo() {
  if (!APP_DATA_CACHE) APP_DATA_CACHE = createEmptyData();
  const [importOrders, salesOrders, masterOrders, stock] = await Promise.all([
    MongoStore.importOrders.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.salesOrders.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.masterOrders.find({}).sort({ createdAt: -1, code: -1 }).lean(),
    MongoStore.stock.find({}).sort({ productCode: 1 }).lean()
  ]);
  APP_DATA_CACHE.importOrders = normalizeForCollection('importOrders', importOrders.map(stripMongoFields));
  APP_DATA_CACHE.salesOrders = normalizeForCollection('salesOrders', salesOrders.map(stripMongoFields));
  APP_DATA_CACHE.masterOrders = normalizeForCollection('masterOrders', masterOrders.map(stripMongoFields));
  APP_DATA_CACHE.stock = normalizeForCollection('stock', stock.map(stripMongoFields));
  await refreshFinancialDocumentCacheFromMongo();
}

async function saveOperationalData(data) {
  await persistPrimaryDataSnapshot(data);
  await refreshOrderDocumentCacheFromMongo();
  return getPrimaryDataSnapshot();
}

function buildCashCode(data, type) {
  const rows = data.cashbooks || data.cashbook || [];
  const prefix = type === 'out' ? 'PC' : 'PT';
  return `${prefix}${(rows.length + 1).toString().padStart(5, '0')}`;
}

function buildReceiptCode(data) {
  return `TH${((data.receipts || []).length + 1).toString().padStart(5, '0')}`;
}

function buildReturnOrderCode(data) {
  return `THH${((data.returnOrders || []).length + 1).toString().padStart(5, '0')}`;
}

function buildBankCode(data) {
  return `NH${((data.bankbooks || []).length + 1).toString().padStart(5, '0')}`;
}

function activeRows(rows) {
  return (rows || []).filter((row) => !['void', 'cancelled'].includes(String(row.status || 'posted')));
}

function auditLog(data, action, refType, ref, before, after, note, userName) {
  if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
  data.auditLogs.push({
    id: makeId('AL'), action, refType, refId: ref?.id || '', refCode: ref?.code || '',
    before: before || null, after: after || null, note: note || '', userName: userName || '', createdAt: new Date().toISOString()
  });
}

function findProduct(data, productIdOrCode) {
  const value = normalizeText(productIdOrCode);
  return data.products.find((p) => normalizeText(p.id) === value || normalizeText(p.code) === value);
}

function buildProductLineMeta(product) {
  const packing = normalizePacking(product);
  return {
    unit: packing.unit,
    baseUnit: packing.baseUnit,
    conversionRate: packing.conversionRate,
    packing: packing.packing,
    units: packing.units
  };
}

function findCustomer(data, customerIdOrCode) {
  const value = normalizeText(customerIdOrCode);
  return data.customers.find((c) => normalizeText(c.id) === value || normalizeText(c.code) === value);
}

function getProductBusinessCode(product) {
  return String(product?.code || product?.sku || product?.productCode || product?.id || '').trim();
}

function findStockRow(data, product) {
  const productCode = normalizeText(getProductBusinessCode(product));
  const productId = normalizeText(product?.id || product?._id || '');
  return (data.stock || []).find((row) => {
    const rowCode = normalizeText(row.productCode || row.code || row.sku);
    const rowProductId = normalizeText(row.productId || row.product_id || '');
    return (productCode && rowCode === productCode) ||
      (productCode && rowProductId === productCode) ||
      (productId && rowProductId === productId) ||
      (productId && rowCode === productId);
  });
}

function getProductAvailableQty(data, product) {
  const stockRow = findStockRow(data, product);
  if (stockRow) return toNumber(stockRow.quantity ?? stockRow.availableQty ?? stockRow.availableStock);
  return toNumber(product.availableStock ?? product.stockQuantity ?? product.availableQty ?? product.openingStock ?? 0);
}

function formatCaseLooseQty(quantity, conversionRate) {
  const qty = Math.max(0, toNumber(quantity));
  const rate = Math.max(1, toNumber(conversionRate || 1));
  const cases = Math.floor(qty / rate);
  const loose = qty % rate;
  return `${cases}/${loose}`;
}

function findStaff(data, staffIdOrCodeOrName) {
  const value = normalizeText(staffIdOrCodeOrName);
  if (!value) return null;
  return (data.staffs || []).find((staff) =>
    normalizeText(staff.id) === value ||
    normalizeText(staff.code) === value ||
    normalizeText(staff.username) === value ||
    normalizeText(staff.name) === value
  );
}

function upsertStock(data, item) {
  let stockRow = data.stock.find((row) => normalizeText(row.productId) === normalizeText(item.productId) || normalizeText(row.productCode) === normalizeText(item.productCode));

  if (!stockRow) {
    stockRow = {
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      unit: item.unit,
      baseUnit: item.baseUnit || '',
      conversionRate: toNumber(item.conversionRate || 1),
      packing: item.packing || '',
      quantity: 0,
      updatedAt: new Date().toISOString()
    };
    data.stock.push(stockRow);
  }

  stockRow.productId = item.productId;
  stockRow.productCode = item.productCode;
  stockRow.productName = item.productName;
  stockRow.unit = item.unit;
  stockRow.baseUnit = item.baseUnit || stockRow.baseUnit || '';
  stockRow.conversionRate = toNumber(item.conversionRate || stockRow.conversionRate || 1);
  stockRow.packing = item.packing || stockRow.packing || '';
  stockRow.quantity = toNumber(stockRow.quantity) + toNumber(item.quantity);
  stockRow.updatedAt = new Date().toISOString();
  return stockRow;
}

function reduceStock(data, item) {
  const stockRow = data.stock.find((row) => normalizeText(row.productId) === normalizeText(item.productId) || normalizeText(row.productCode) === normalizeText(item.productCode));
  if (!stockRow) return null;
  stockRow.quantity = toNumber(stockRow.quantity) - toNumber(item.quantity);
  stockRow.updatedAt = new Date().toISOString();
  return stockRow;
}


function restoreStock(data, item) {
  const stockRow = data.stock.find((row) => normalizeText(row.productId) === normalizeText(item.productId) || normalizeText(row.productCode) === normalizeText(item.productCode));
  if (stockRow) {
    stockRow.quantity = toNumber(stockRow.quantity) + toNumber(item.quantity);
    stockRow.updatedAt = new Date().toISOString();
    return stockRow;
  }
  return upsertStock(data, item);
}

function removeOrderFinancialEntries(data, order) {
  const refIds = new Set([String(order.id || ''), String(order.code || '')].filter(Boolean));
  data.payments = (data.payments || []).filter((entry) =>
    !(String(entry.refType || '') === 'salesOrder' && (refIds.has(String(entry.refId || '')) || refIds.has(String(entry.refCode || ''))))
  );
  data.cashbooks = (data.cashbooks || data.cashbook || []).filter((entry) =>
    !(String(entry.refType || '') === 'salesOrder' && (refIds.has(String(entry.refId || '')) || refIds.has(String(entry.refCode || ''))))
  );
  data.cashbook = data.cashbooks;
}

function addOrderFinancialEntries(data, order) {
  data.payments.push({
    id: makeId('PM'),
    date: order.date,
    type: 'sale_debt',
    refType: 'salesOrder',
    refId: order.id,
    refCode: order.code,
    customerId: order.customerId,
    customerCode: order.customerCode,
    customerName: order.customerName,
    debit: toNumber(order.totalAmount),
    credit: toNumber(order.paidAmount),
    note: `Phát sinh từ đơn bán ${order.code}`,
    createdAt: new Date().toISOString()
  });

  if (toNumber(order.paidAmount) > 0) {
    data.cashbooks.push({
      id: makeId('CB'),
      code: buildCashCode(data, 'in'),
      date: order.date,
      type: 'in',
      source: order.source === 'mobile_sales_app' ? 'mobile_sales_payment' : 'sales_payment',
      refType: 'salesOrder',
      refId: order.id,
      refCode: order.code,
      customerId: order.customerId,
      customerCode: order.customerCode,
      customerName: order.customerName,
      staffName: order.salesStaffName || order.staffName || '',
      amount: toNumber(order.paidAmount),
      note: `Thu tiền từ đơn bán ${order.code}`,
      createdAt: new Date().toISOString()
    });
  }
}


function getMasterOrderChildren(data, masterOrder) {
  const ids = new Set((masterOrder.childOrderIds || []).map((id) => String(id)));
  return (data.salesOrders || []).filter((order) =>
    ids.has(String(order.id || '')) ||
    ids.has(String(order.code || '')) ||
    String(order.masterOrderId || '') === String(masterOrder.id || '') ||
    String(order.masterOrderCode || '') === String(masterOrder.code || '')
  );
}

function summarizeMasterOrder(children) {
  const activeChildren = activeRows(children || []);
  return {
    totalOrders: activeChildren.length,
    totalQuantity: activeChildren.reduce((sum, order) => sum + toNumber(order.totalQuantity), 0),
    totalAmount: activeChildren.reduce((sum, order) => sum + toNumber(order.totalAmount), 0),
    totalPaid: activeChildren.reduce((sum, order) => sum + toNumber(order.paidAmount), 0),
    totalDebt: activeChildren.reduce((sum, order) => sum + toNumber(order.debtAmount), 0),
    children: activeChildren.map((order) => ({ ...order, items: order.items || [] }))
  };
}

function syncMasterOrderAfterChildChange(data, masterOrderIdOrCode) {
  if (!masterOrderIdOrCode) return null;
  const masterOrder = (data.masterOrders || []).find((order) => order.id === masterOrderIdOrCode || order.code === masterOrderIdOrCode);
  if (!masterOrder) return null;
  const children = getMasterOrderChildren(data, masterOrder);
  Object.assign(masterOrder, summarizeMasterOrder(children), { updatedAt: new Date().toISOString() });
  return masterOrder;
}

function getActorRole(req) {
  return String(req.headers['x-user-role'] || req.body?.actorRole || req.query?.actorRole || '').trim().toLowerCase();
}

function canAccountingEdit(req) {
  const role = getActorRole(req);
  return role === 'admin' || role === 'accountant' || role === 'ketoan' || role === 'ke_toan';
}

function buildValidatedSalesOrderPatch(data, oldOrder, body) {
  const customer = findCustomer(data, body.customerId || body.customerCode || oldOrder.customerId || oldOrder.customerCode);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const date = String(body.date || oldOrder.date || new Date().toISOString().slice(0, 10)).trim();
  const note = String(body.note ?? oldOrder.note ?? '').trim();
  const paidAmount = toNumber(body.paidAmount ?? oldOrder.paidAmount);
  const salesStaff = findStaff(data, body.salesStaffId || body.salesStaffCode || body.salesStaffName || body.staffCode || body.staffName || oldOrder.salesStaffCode || oldOrder.staffCode || oldOrder.salesStaffName || oldOrder.staffName);

  if (!customer) throw new Error('Không tìm thấy khách hàng');
  if (customer.isActive === false) throw new Error(`Khách hàng đang ngừng giao dịch: ${customer.code}`);
  if (!rawItems.length) throw new Error('Đơn bán chưa có dòng hàng');

  const items = [];
  for (const rawItem of rawItems) {
    const product = findProduct(data, rawItem.productCode || rawItem.code || rawItem.productId);
    if (!product) throw new Error(`Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || rawItem.productId || ''}`);
    if (product.isActive === false) throw new Error(`Sản phẩm đang ngừng bán: ${product.code}`);
    const quantity = toNumber(rawItem.quantity || rawItem.qty);
    const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice);
    if (quantity <= 0) throw new Error(`Số lượng bán phải lớn hơn 0: ${product.code}`);
    if (salePrice < 0) throw new Error(`Giá bán không được âm: ${product.code}`);
    const availableQty = getProductAvailableQty(data, product);
    if (availableQty < quantity) throw new Error(`Không đủ tồn kho: ${product.code} - ${product.name}. Tồn hiện tại ${availableQty}, cần bán ${quantity}`);
    items.push({ productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, salePrice, amount: quantity * salePrice });
  }

  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  if (paidAmount < 0) throw new Error('Tiền đã thu không được âm');
  if (paidAmount > totalAmount) throw new Error('Tiền đã thu không được lớn hơn tổng đơn');

  return {
    date,
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerAddress: customer.address,
    salesStaffId: salesStaff ? salesStaff.id : String(body.salesStaffId || oldOrder.salesStaffId || '').trim(),
    salesStaffCode: salesStaff ? salesStaff.code : String(body.salesStaffCode || body.staffCode || oldOrder.salesStaffCode || oldOrder.staffCode || '').trim(),
    salesStaffName: salesStaff ? salesStaff.name : String(body.salesStaffName || body.staffName || oldOrder.salesStaffName || oldOrder.staffName || '').trim(),
    staffCode: salesStaff ? salesStaff.code : String(body.salesStaffCode || body.staffCode || oldOrder.staffCode || oldOrder.salesStaffCode || '').trim(),
    staffName: salesStaff ? salesStaff.name : String(body.salesStaffName || body.staffName || oldOrder.staffName || oldOrder.salesStaffName || '').trim(),
    note,
    items,
    totalQuantity,
    totalAmount,
    paidAmount,
    documentDate: date,
    dueDate: String(body.dueDate || oldOrder.dueDate || addDaysToDate(date, getCustomerCreditDays(data, customer.id))).slice(0, 10),
    debtAmount: totalAmount - paidAmount,
    balanceAmount: totalAmount - paidAmount,
    paymentStatus: totalAmount - paidAmount <= 0 ? 'paid' : 'open',
    updatedAt: new Date().toISOString()
  };
}

function updateSalesOrderWithRepost(data, oldOrder, patchBody) {
  (oldOrder.items || []).forEach((item) => restoreStock(data, item));
  removeOrderFinancialEntries(data, oldOrder);
  const patch = buildValidatedSalesOrderPatch(data, oldOrder, patchBody);
  Object.assign(oldOrder, patch);
  oldOrder.items.forEach((item) => reduceStock(data, item));
  addOrderFinancialEntries(data, oldOrder);
  syncMasterOrderAfterChildChange(data, oldOrder.masterOrderId || oldOrder.masterOrderCode);
  return oldOrder;
}

function createReceiptDocument(data, payload = {}) {
  const method = ['transfer', 'bank'].includes(String(payload.method || '').toLowerCase()) ? 'transfer' : 'cash';
  const customer = payload.customer || {};
  const receipt = {
    id: makeId('RC'),
    code: buildReceiptCode(data),
    date: String(payload.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    customerId: customer.id || payload.customerId || '',
    customerCode: customer.code || payload.customerCode || '',
    customerName: customer.name || payload.customerName || '',
    method,
    amount: toNumber(payload.amount),
    staffName: payload.staffName || '',
    note: payload.note || '',
    refType: payload.refType || 'receipt',
    refId: payload.refId || payload.salesOrderId || '',
    refCode: payload.refCode || payload.salesOrderCode || '',
    salesOrderId: payload.salesOrderId || payload.refId || '',
    salesOrderCode: payload.salesOrderCode || payload.refCode || '',
    status: 'posted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.receipts = data.receipts || [];
  data.cashbooks = data.cashbooks || data.cashbook || [];
  data.bankbooks = data.bankbooks || [];
  data.payments = data.payments || [];
  data.receipts.push(receipt);
  data.payments.push({
    id: makeId('PM'),
    date: receipt.date,
    type: 'debt_collection',
    refType: 'receipt',
    refId: receipt.id,
    refCode: receipt.code,
    customerId: receipt.customerId,
    customerCode: receipt.customerCode,
    customerName: receipt.customerName,
    debit: 0,
    credit: receipt.amount,
    note: receipt.note || `Thu công nợ ${receipt.code}`,
    createdAt: new Date().toISOString()
  });
  const moneyEntry = {
    id: makeId(method === 'transfer' ? 'BB' : 'CB'),
    code: method === 'transfer' ? buildBankCode(data) : buildCashCode(data, 'in'),
    date: receipt.date,
    type: 'in',
    source: 'receipt',
    refType: 'receipt',
    refId: receipt.id,
    refCode: receipt.code,
    customerId: receipt.customerId,
    customerCode: receipt.customerCode,
    customerName: receipt.customerName,
    staffName: receipt.staffName,
    method,
    amount: receipt.amount,
    note: receipt.note || `Thu công nợ ${receipt.code}`,
    status: 'posted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (method === 'transfer') data.bankbooks.push(moneyEntry);
  else data.cashbooks.push(moneyEntry);
  data.cashbook = data.cashbooks;
  return receipt;
}

function buildReturnItemsFromRequest(order, requestedItems = [], returnType = 'partial') {
  const sourceItems = Array.isArray(order?.items) ? order.items : [];
  if (returnType === 'full') return sourceItems.map((item) => ({ ...item, quantity: toNumber(item.quantity), amount: toNumber(item.amount || (toNumber(item.quantity) * toNumber(item.salePrice || item.price))) }));
  const requested = new Map((Array.isArray(requestedItems) ? requestedItems : []).map((item) => [normalizeText(item.productId || item.productCode || item.code), item]));
  return sourceItems.map((item) => {
    const req = requested.get(normalizeText(item.productId || item.productCode || item.code));
    const quantity = Math.min(toNumber(item.quantity), toNumber(req?.quantity || req?.qty));
    const price = toNumber(item.salePrice || item.price || (toNumber(item.amount) / Math.max(1, toNumber(item.quantity))));
    return quantity > 0 ? { ...item, quantity, salePrice: price, price, amount: quantity * price } : null;
  }).filter(Boolean);
}

function createReturnOrderDocument(data, payload = {}) {
  const customer = payload.customer || {};
  const salesOrder = payload.salesOrder || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount || (toNumber(item.quantity) * toNumber(item.salePrice || item.price))), 0);
  const returnOrder = {
    id: makeId('RT'),
    code: buildReturnOrderCode(data),
    date: String(payload.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    customerId: customer.id || payload.customerId || salesOrder.customerId || '',
    customerCode: customer.code || payload.customerCode || salesOrder.customerCode || '',
    customerName: customer.name || payload.customerName || salesOrder.customerName || '',
    salesOrderId: salesOrder.id || payload.salesOrderId || payload.refId || '',
    salesOrderCode: salesOrder.code || payload.salesOrderCode || payload.refCode || '',
    refType: payload.refType || 'returnOrder',
    refId: salesOrder.id || payload.refId || '',
    refCode: salesOrder.code || payload.refCode || '',
    returnType: payload.returnType || 'partial',
    items,
    totalQuantity,
    totalAmount,
    staffName: payload.staffName || '',
    note: payload.note || '',
    status: 'posted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.returnOrders = data.returnOrders || [];
  data.payments = data.payments || [];
  data.returnOrders.push(returnOrder);
  items.forEach((item) => restoreStock(data, item));
  data.payments.push({
    id: makeId('PM'),
    date: returnOrder.date,
    type: 'sales_return',
    refType: 'returnOrder',
    refId: returnOrder.id,
    refCode: returnOrder.code,
    customerId: returnOrder.customerId,
    customerCode: returnOrder.customerCode,
    customerName: returnOrder.customerName,
    debit: 0,
    credit: totalAmount,
    note: returnOrder.note || `Trả hàng ${returnOrder.code}`,
    createdAt: new Date().toISOString()
  });
  if (salesOrder && salesOrder.id) {
    salesOrder.returnAmount = toNumber(salesOrder.returnAmount) + totalAmount;
    salesOrder.debtAmount = Math.max(0, toNumber(salesOrder.totalAmount) - toNumber(salesOrder.paidAmount) - toNumber(salesOrder.returnAmount));
    salesOrder.updatedAt = new Date().toISOString();
    if (payload.returnType === 'full') {
      salesOrder.status = 'returned';
      salesOrder.deliveryStatus = 'returned';
    }
  }
  return returnOrder;
}

function getCashSummary(data) {
  const rows = activeRows(data.cashbooks || data.cashbook);
  const cashIn = rows.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const cashOut = rows.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { cashIn, cashOut, balance: cashIn - cashOut };
}

function getBankSummary(data) {
  const rows = activeRows(data.bankbooks);
  const bankIn = rows.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const bankOut = rows.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { bankIn, bankOut, balance: bankIn - bankOut };
}

function buildCustomerDebtSummary(data) {
  const map = new Map();

  data.customers.forEach((customer) => {
    map.set(customer.id, {
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      phone: customer.phone,
      address: customer.address,
      debit: 0,
      credit: 0,
      debt: 0
    });
  });

  activeRows(data.payments).forEach((payment) => {
    const key = payment.customerId || payment.customerCode;
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        customerId: payment.customerId,
        customerCode: payment.customerCode,
        customerName: payment.customerName,
        phone: '',
        address: '',
        debit: 0,
        credit: 0,
        debt: 0
      });
    }

    const row = map.get(key);
    row.debit += toNumber(payment.debit);
    row.credit += toNumber(payment.credit);
    row.debt = row.debit - row.credit;
  });

  return Array.from(map.values()).filter((row) => row.debit !== 0 || row.credit !== 0 || row.debt !== 0);
}

function addDaysToDate(dateValue, days) {
  const base = new Date(String(dateValue || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  if (Number.isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setDate(base.getDate() + toNumber(days));
  return base.toISOString().slice(0, 10);
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return 0;
  const a = new Date(String(dateA).slice(0, 10) + 'T00:00:00');
  const b = new Date(String(dateB).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((a - b) / 86400000);
}

function getCustomerCreditDays(data, customerIdOrCode) {
  const customer = findCustomer(data, customerIdOrCode);
  const days = toNumber(customer?.creditDays ?? customer?.paymentTermDays ?? customer?.debtDays ?? 7);
  return days > 0 ? days : 7;
}

function getOrderDeliveryInfo(data, order) {
  const master = (data.masterOrders || []).find((m) =>
    m.id === order.masterOrderId || m.code === order.masterOrderCode ||
    (Array.isArray(m.childOrderIds) && m.childOrderIds.includes(order.id)) ||
    (Array.isArray(m.children) && m.children.some((c) => c.id === order.id || c.code === order.code))
  );
  return {
    deliveryStaffId: order.deliveryStaffId || master?.deliveryStaffId || '',
    deliveryStaffCode: order.deliveryStaffCode || master?.deliveryStaffCode || '',
    deliveryStaffName: order.deliveryStaffName || master?.deliveryStaffName || '',
    masterOrderId: order.masterOrderId || master?.id || '',
    masterOrderCode: order.masterOrderCode || master?.code || ''
  };
}


function getOrderDeliveryDate(data, order) {
  const master = (data.masterOrders || []).find((m) =>
    m.id === order.masterOrderId || m.code === order.masterOrderCode ||
    (Array.isArray(m.childOrderIds) && m.childOrderIds.includes(order.id)) ||
    (Array.isArray(m.children) && m.children.some((c) => c.id === order.id || c.code === order.code))
  );
  return String(
    order.deliveryDate ||
    order.expectedDeliveryDate ||
    order.shipDate ||
    master?.deliveryDate ||
    master?.date ||
    order.date ||
    order.documentDate ||
    order.createdAt ||
    ''
  ).slice(0, 10);
}

function normalizeDeliveryStatusValue(status) {
  const value = normalizeText(status || 'pending');
  if (['completed', 'complete', 'success', 'done'].includes(value)) return 'delivered';
  if (['waiting', 'wait', 'new', 'ready', 'pending_delivery'].includes(value)) return 'pending';
  if (['shipping', 'in_delivery', 'on_route'].includes(value)) return 'delivering';
  if (['void', 'deleted'].includes(value)) return 'cancelled';
  return value || 'pending';
}

function isDeliveryOrderActive(status) {
  const value = normalizeDeliveryStatusValue(status);
  return !['delivered', 'completed', 'cancelled', 'void', 'failed', 'returned'].includes(value);
}

function isOrderApprovedForDelivery(order) {
  const orderStatus = normalizeText(order.status || order.orderStatus || 'approved');
  return !['draft', 'new_draft', 'cancelled', 'void', 'deleted'].includes(orderStatus);
}

function isOrderAssignedToDeliveryUser(order, deliveryInfo, userOrFilter) {
  const target = normalizeText(userOrFilter?.id || userOrFilter?.code || userOrFilter?.name || userOrFilter || '');
  if (!target) return true;
  return [
    order.deliveryStaffId,
    order.deliveryStaffCode,
    order.deliveryStaffName,
    deliveryInfo.deliveryStaffId,
    deliveryInfo.deliveryStaffCode,
    deliveryInfo.deliveryStaffName
  ].some((value) => normalizeText(value) === target);
}

function buildDeliveryOrderRow(data, order, debtRow = null, targetDate = '') {
  const delivery = getOrderDeliveryInfo(data, order);
  const deliveryDate = getOrderDeliveryDate(data, order);
  const deliveryStatus = normalizeDeliveryStatusValue(order.deliveryStatus || debtRow?.deliveryStatus || 'pending');
  const receipts = (data.receipts || []).filter((r) => String(r.orderId || r.salesOrderId || r.refId || '') === String(order.id));
  const returns = (data.returnOrders || []).filter((r) => String(r.orderId || r.salesOrderId || r.refId || '') === String(order.id));
  const cashCollected = receipts.filter((r) => normalizeDeliveryStatusValue(r.status) !== 'cancelled' && r.method !== 'transfer').reduce((sum, r) => sum + toNumber(r.amount), 0);
  const bankCollected = receipts.filter((r) => normalizeDeliveryStatusValue(r.status) !== 'cancelled' && r.method === 'transfer').reduce((sum, r) => sum + toNumber(r.amount), 0);
  const returnAmount = returns.filter((r) => normalizeDeliveryStatusValue(r.status) !== 'cancelled').reduce((sum, r) => sum + toNumber(r.totalAmount || r.amount || r.returnAmount), 0);
  const totalAmount = toNumber(debtRow?.totalAmount ?? order.totalAmount);
  const paidAmount = toNumber(debtRow?.paidAtSale ?? order.paidAmount) + cashCollected + bankCollected;
  const debtAmount = Math.max(0, toNumber(debtRow?.debt ?? order.debtAmount ?? (totalAmount - paidAmount - returnAmount)));
  const nowHour = new Date().getHours();
  const isLate = debtAmount > 0 && deliveryDate && targetDate && deliveryDate <= targetDate && nowHour >= 17 && deliveryStatus !== 'delivered';
  const visualStatus = isLate ? 'late' : (debtAmount > 0 && deliveryStatus === 'delivered' ? 'unpaid' : deliveryStatus);
  return {
    id: order.id,
    orderId: order.id,
    orderCode: order.code,
    code: order.code,
    customerId: order.customerId,
    customerCode: order.customerCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone || debtRow?.phone || '',
    phone: order.customerPhone || debtRow?.phone || '',
    customerAddress: order.customerAddress || debtRow?.address || '',
    address: order.customerAddress || debtRow?.address || '',
    salesmanId: order.salesmanId || order.salesStaffId || order.staffId || debtRow?.salesmanId || '',
    salesmanCode: order.salesmanCode || order.salesStaffCode || order.staffCode || debtRow?.salesmanCode || '',
    salesmanName: order.salesmanName || order.salesStaffName || order.staffName || debtRow?.salesmanName || '',
    deliveryStaffId: delivery.deliveryStaffId,
    deliveryStaffCode: delivery.deliveryStaffCode,
    deliveryStaffName: delivery.deliveryStaffName,
    masterOrderId: delivery.masterOrderId,
    masterOrderCode: delivery.masterOrderCode,
    deliveryDate,
    routeName: String(order.deliveryRoute || order.routeName || order.route || '').trim(),
    deliveryStatus,
    visualStatus,
    isLate,
    totalAmount,
    paidAmount,
    debtAmount,
    debt: debtAmount,
    amount: debtAmount,
    cashCollected,
    bankCollected,
    returnAmount,
    debtBeforeCollection: totalAmount,
    status: order.status,
    items: order.items || [],
    note: order.note || '',
    createdAt: order.createdAt || order.date || ''
  };
}

function buildDebtLedgerRows(data) {
  const today = new Date().toISOString().slice(0, 10);
  const activeOrders = activeRows(data.salesOrders || []).filter((order) => order.status !== 'cancelled' && order.status !== 'void');
  const rows = activeOrders.map((order) => {
    const delivery = getOrderDeliveryInfo(data, order);
    const documentDate = String(order.documentDate || order.date || order.createdAt || '').slice(0, 10);
    const dueDate = String(order.dueDate || addDaysToDate(documentDate, getCustomerCreditDays(data, order.customerId || order.customerCode))).slice(0, 10);
    const totalAmount = toNumber(order.totalAmount);
    const paidAtSale = toNumber(order.paidAmount);
    return {
      id: order.id,
      orderId: order.id,
      orderCode: order.code,
      customerId: order.customerId,
      customerCode: order.customerCode,
      customerName: order.customerName,
      phone: order.customerPhone || '',
      address: order.customerAddress || '',
      salesmanId: order.salesmanId || order.salesStaffId || order.staffId || '',
      salesmanCode: order.salesmanCode || order.salesStaffCode || order.staffCode || '',
      salesmanName: order.salesmanName || order.salesStaffName || order.staffName || '',
      deliveryStaffId: delivery.deliveryStaffId,
      deliveryStaffCode: delivery.deliveryStaffCode,
      deliveryStaffName: delivery.deliveryStaffName,
      masterOrderId: delivery.masterOrderId,
      masterOrderCode: delivery.masterOrderCode,
      documentDate,
      dueDate,
      totalAmount,
      debit: totalAmount,
      paidAtSale,
      receiptAmount: 0,
      returnAmount: 0,
      credit: paidAtSale,
      debt: Math.max(0, totalAmount - paidAtSale),
      lastPaymentDate: '',
      status: 'open',
      overdueDays: 0,
      agingDays: daysBetween(today, documentDate),
      createdAt: order.createdAt || documentDate
    };
  }).sort((a, b) => String(a.documentDate).localeCompare(String(b.documentDate)) || String(a.createdAt).localeCompare(String(b.createdAt)));

  const byOrder = new Map(rows.map((row) => [String(row.orderId), row]));
  const customerQueues = new Map();
  rows.forEach((row) => {
    const key = String(row.customerId || row.customerCode || '');
    if (!customerQueues.has(key)) customerQueues.set(key, []);
    customerQueues.get(key).push(row);
  });

  const applyCredit = (row, amount, date, field) => {
    const value = Math.min(Math.max(0, row.debt), Math.max(0, amount));
    if (value <= 0) return 0;
    row[field] = toNumber(row[field]) + value;
    row.credit += value;
    row.debt = Math.max(0, row.debit - row.credit);
    if (date && (!row.lastPaymentDate || String(date) > String(row.lastPaymentDate))) row.lastPaymentDate = String(date).slice(0, 10);
    return value;
  };

  activeRows(data.receipts || []).forEach((receipt) => {
    let remaining = toNumber(receipt.amount);
    const date = String(receipt.date || receipt.createdAt || '').slice(0, 10);
    const directRow = byOrder.get(String(receipt.orderId || receipt.salesOrderId || receipt.refOrderId || ''));
    if (directRow) remaining -= applyCredit(directRow, remaining, date, 'receiptAmount');
    const queue = customerQueues.get(String(receipt.customerId || receipt.customerCode || '')) || [];
    for (const row of queue) {
      if (remaining <= 0) break;
      remaining -= applyCredit(row, remaining, date, 'receiptAmount');
    }
  });

  activeRows(data.returnOrders || []).forEach((ret) => {
    let remaining = toNumber(ret.totalAmount || ret.amount || ret.returnAmount);
    const date = String(ret.date || ret.returnDate || ret.createdAt || '').slice(0, 10);
    const directRow = byOrder.get(String(ret.salesOrderId || ret.orderId || ''));
    if (directRow) remaining -= applyCredit(directRow, remaining, date, 'returnAmount');
    if (!directRow) {
      const queue = customerQueues.get(String(ret.customerId || ret.customerCode || '')) || [];
      for (const row of queue) {
        if (remaining <= 0) break;
        remaining -= applyCredit(row, remaining, date, 'returnAmount');
      }
    }
  });

  rows.forEach((row) => {
    row.overdueDays = row.debt > 0 ? Math.max(0, daysBetween(today, row.dueDate)) : 0;
    row.status = row.debt <= 0 ? 'paid' : (row.overdueDays > 0 ? 'overdue' : 'open');
    row.paymentStatus = row.status;
  });
  return rows.sort((a, b) => Number(b.debt > 0) - Number(a.debt > 0) || Number(b.overdueDays) - Number(a.overdueDays) || String(b.documentDate).localeCompare(String(a.documentDate)));
}

function buildDebtSummaryByCustomerFromRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.customerId || row.customerCode;
    if (!map.has(key)) {
      map.set(key, {
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerName: row.customerName,
        phone: row.phone,
        address: row.address,
        debit: 0,
        credit: 0,
        debt: 0,
        orderCount: 0,
        overdueCount: 0,
        lastPaymentDate: ''
      });
    }
    const target = map.get(key);
    target.debit += toNumber(row.debit);
    target.credit += toNumber(row.credit);
    target.debt += toNumber(row.debt);
    target.orderCount += 1;
    if (row.status === 'overdue') target.overdueCount += 1;
    if (row.lastPaymentDate && (!target.lastPaymentDate || row.lastPaymentDate > target.lastPaymentDate)) target.lastPaymentDate = row.lastPaymentDate;
  });
  return Array.from(map.values()).filter((row) => row.debit !== 0 || row.credit !== 0 || row.debt !== 0);
}

// Phase 2.9.3: system endpoints đã tách sang src/routes/systemRoutes.js.
// legacyApp.js không còn xử lý trực tiếp /api/health, /api/data, /api/system/*.

// Phase 2.10.1: Legacy route handlers đã được dọn sạch.
// Các API nghiệp vụ đã chuyển sang src/routes -> controllers -> services.
// legacyApp.js chỉ còn helper/fallback nội bộ và bootstrap app.





// Customers - MongoDB 100%








// Users / Staffs / Roles / Permissions - MongoDB 100%









async function upsertProductRowsToMongo(rows) {
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const payload = pickProductPayload(row || {});
    const error = validateProduct(payload);
    if (error) {
      skipped += 1;
      errors.push({ code: payload.code || '', message: error });
      continue;
    }

    try {
      await Product.findOneAndUpdate(
        { code: payload.code },
        { $set: payload },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ code: payload.code || '', message: err.message });
    }
  }

  await refreshProductCacheFromMongo();
  console.log(`✅ MongoDB products.import upsert: ${imported} dòng, lỗi/bỏ qua: ${skipped}`);
  return { imported, skipped, errors };
}


async function upsertCustomerRowsToMongo(rows) {
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const payload = pickCustomerPayload(row || {});
    const error = validateCustomer(payload);
    if (error) {
      skipped += 1;
      errors.push({ code: payload.code || '', message: error });
      continue;
    }

    try {
      await Customer.findOneAndUpdate(
        { code: payload.code },
        { $set: payload },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ code: payload.code || '', message: err.message });
    }
  }

  await refreshCustomerCacheFromMongo();
  console.log(`✅ MongoDB customers.import upsert: ${imported} dòng, lỗi/bỏ qua: ${skipped}`);
  return { imported, skipped, errors };
}











app.get(['/api/return-orders', '/api/returns'], async (req, res) => {
  try {
    await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const q = normalizeText(req.query.q);
    let returnOrders = data.returnOrders || [];
    if (q) returnOrders = returnOrders.filter((r) => [r.code, r.customerCode, r.customerName, r.salesOrderCode, r.staffName, r.note].some((value) => normalizeText(value).includes(q)));
    res.json({ ok: true, source: 'mongo', returnOrders, returns: returnOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu trả hàng từ MongoDB', error: err.message });
  }
});

app.post(['/api/return-orders', '/api/returns'], async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const salesOrder = (data.salesOrders || []).find((o) => o.id === req.body.salesOrderId || o.code === req.body.salesOrderCode || o.id === req.body.orderId || o.code === req.body.orderCode);
    const customer = findCustomer(data, req.body.customerId || req.body.customerCode || salesOrder?.customerId || salesOrder?.customerCode);
    if (!customer) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    const items = salesOrder ? buildReturnItemsFromRequest(salesOrder, req.body.items || [], req.body.returnType || 'partial') : (Array.isArray(req.body.items) ? req.body.items : []);
    if (!items.length) return res.status(400).json({ ok: false, message: 'Phiếu trả hàng chưa có dòng hàng' });
    const returnOrder = createReturnOrderDocument(data, { ...req.body, customer, salesOrder, items });
    auditLog(data, 'create_return_order', 'returnOrder', returnOrder, null, returnOrder, 'Tạo phiếu trả hàng ghi Mongo', req.user?.name || '');
    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: `Đã tạo phiếu trả hàng ${returnOrder.code}`, returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu trả hàng' });
  }
});

// PHASE 2.3: Sales Orders / Master Orders / Import Orders dùng MongoDB làm nguồn chính.











// Import Excel





// Print templates đã được tách sang src/routes/printRoutes.js -> src/controllers/printController.js -> src/services/printDocumentService.js.
// legacyApp.js không còn xử lý trực tiếp /api/print/*; nếu cần fallback, bật ENABLE_LEGACY_JSON và bổ sung route riêng có kiểm soát.


// =========================
// Mobile helper functions còn được dùng bởi src/routes/mobile/*.routes.js thông qua routeContext.
// Không còn handler app.get/app.post mobile trong legacyApp.js.
// =========================
function writeMobileLog(data, user, action, payload = {}) {
  data.mobileLogs.push({
    id: makeId('ML'),
    action,
    refType: payload.refType || '',
    refId: payload.refId || '',
    refCode: payload.refCode || '',
    userId: user?.id || '',
    userCode: user?.code || '',
    userName: user?.name || user?.username || '',
    note: payload.note || '',
    createdAt: new Date().toISOString()
  });
}

function encodeMobileToken(user) {
  return signAccessToken(user);
}

function encodeMobileRefreshToken(user) {
  return signRefreshToken(user);
}

function decodeMobileToken(token) {
  try {
    return jwt.verify(String(token || ''), JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function decodeMobileRefreshToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), JWT_REFRESH_SECRET);
    return payload?.tokenType === 'refresh' ? payload : null;
  } catch (err) {
    return null;
  }
}

function getMobileUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return decodeMobileToken(token);
}

function requireMobileLogin(req, res, next) {
  const user = getMobileUser(req);
  if (!user) return res.status(401).json({ ok: false, success: false, message: 'Phiên đăng nhập mobile không hợp lệ hoặc đã hết hạn' });
  req.mobileUser = user;
  next();
}

function requireMobileRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.mobileUser?.role || '';
    if (role === 'admin' || allowedRoles.includes(role)) return next();
    return res.status(403).json({
      ok: false,
      success: false,
      message: 'Tài khoản không có quyền thực hiện chức năng này',
      requiredRoles: allowedRoles,
      currentRole: role
    });
  };
}

function mobileMatchText(row, q, fields) {
  const text = fields.map(field => row[field] || '').join(' ').toLowerCase();
  return text.includes(String(q || '').toLowerCase());
}

function buildMobileProduct(data, product) {
  const stockRow = findStockRow(data, product);
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    unit: product.unit,
    baseUnit: product.baseUnit || '',
    conversionRate: toNumber(product.conversionRate || 1),
    packing: product.packing || '',
    units: product.units || [],
    barcode: product.barcode,
    category: product.category,
    price: toNumber(product.salePrice),
    salePrice: toNumber(product.salePrice),
    availableQty: getProductAvailableQty(data, product),
    stockQuantity: getProductAvailableQty(data, product),
    stockDisplay: formatCaseLooseQty(getProductAvailableQty(data, product), product.conversionRate || 1)
  };
}












// Phase 2.9: mobile delivery routes đã được mount sớm bằng routeContext phía trên.


registerStaticRoutes(app);
registerHealthRoutes(app);

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, success: false, message: 'API không tồn tại' });
});

app.use((err, req, res, next) => {
  req.log?.error({ err }, 'Unhandled application error');
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    ok: false,
    success: false,
    message: status >= 500 ? 'Lỗi hệ thống, vui lòng thử lại sau' : (err.message || 'Yêu cầu không hợp lệ'),
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled Promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

async function bootstrapDataLayer() {
  ensureDataFile();
  await connectDB();
  if (process.env.AUTO_ENSURE_MONGO_INDEXES !== 'false') {
    const indexResults = await ensureMongoIndexes({ logger });
    console.log(`✅ Phase 2.7 Mongo indexes ready: ${indexResults.length} indexes checked/created`);
  } else {
    console.log('⏭️ Bỏ qua tạo/check index Mongo khi khởi động (AUTO_ENSURE_MONGO_INDEXES=false)');
  }
  if (process.env.AUTO_MIGRATE_JSON_TO_MONGO !== 'false') {
    await migrateJsonToMongoIfEmpty();
  } else {
    console.log('⏭️ Bỏ qua migrate/check JSON -> Mongo khi khởi động (AUTO_MIGRATE_JSON_TO_MONGO=false)');
  }
  await ensureAccessCollectionsSeeded();
  if (process.env.LOAD_MONGO_CACHE_ON_START !== 'false') {
    await loadMongoDataToCache();
    await refreshAccessCacheFromMongo();
  } else {
    APP_DATA_CACHE = createEmptyData();
    await refreshAccessCacheFromMongo();
    console.log('⏭️ Bỏ qua nạp toàn bộ Mongo vào cache khi khởi động (LOAD_MONGO_CACHE_ON_START=false)');
  }
}

async function startServer() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server V45 đang chạy tại http://0.0.0.0:${PORT}`);
  });

  setImmediate(() => {
    bootstrapDataLayer().catch((err) => {
      logger.error({ err }, 'Không thể khởi tạo Mongo/cache sau khi mở port');
      console.error('Không thể khởi tạo Mongo/cache sau khi mở port:', err);
    });
  });

  return server;
}

module.exports = { app, startServer };
