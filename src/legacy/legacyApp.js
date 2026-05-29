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
const { renderPrintHtml } = require('../../services/printService');
const { buildImportTemplate, getTemplateTypes, TEMPLATE_DEFINITIONS } = require('../../services/excelTemplateService');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { MongoStore } = require('../services/mongoSyncService');
const { createAppDataService } = require('../services/appData.service');
const { registerMobileDeliveryRoutes } = require('../routes/mobile/delivery.routes');
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


// Phase 2.7: các API nghiệp vụ chính phải đi qua route/controller/service/repository Mongo.
// Legacy JSON chỉ được bật lại tạm thời bằng ENABLE_LEGACY_JSON=true để cứu dữ liệu hoặc debug migration.
const ENABLE_LEGACY_JSON = process.env.ENABLE_LEGACY_JSON === 'true';
const ALLOWED_LEGACY_API_PREFIXES = ['/mobile'];

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

// Health / data
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'KHO Minh Khai Pro V44 server is running', time: new Date().toISOString() });
});

app.get('/api/data', async (req, res) => {
  try {
    res.json({ ok: true, source: 'mongo', data: await getPrimaryDataSnapshot() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được dữ liệu', error: err.message });
  }
});

app.get('/api/system/data-source', async (req, res) => {
  try {
    const mongoCounts = await getAppDataService().getCounts();
    const cacheCounts = APP_DATA_CACHE
      ? Object.fromEntries(APP_COLLECTION_KEYS.map((key) => [key, (APP_DATA_CACHE[key] || []).length]))
      : {};
    res.json({
      ok: true,
      primaryDataSource: 'mongodb',
      jsonUsage: 'backup-only',
      mongoCounts,
      cacheCounts
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không kiểm tra được nguồn dữ liệu', error: err.message });
  }
});

// Products - MongoDB 100%
app.get('/api/products', async (req, res) => {
  try {
    const q = normalizeText(req.query.q);
    const activeOnly = String(req.query.activeOnly || '') === '1';
    const filter = {};

    if (activeOnly) filter.isActive = { $ne: false };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { unit: { $regex: q, $options: 'i' } },
        { baseUnit: { $regex: q, $options: 'i' } },
        { packing: { $regex: q, $options: 'i' } }
      ];
    }

    const products = await Product.find(filter).sort({ code: 1 }).lean();
    const data = await getPrimaryDataSnapshot();
    const clientProducts = products.map((product) => {
      const client = productMongoToClient(product);
      const availableQty = getProductAvailableQty(data, client);
      return {
        ...client,
        stockQuantity: availableQty,
        availableQty,
        stockDisplay: formatCaseLooseQty(availableQty, client.conversionRate || 1)
      };
    });
    res.json({ ok: true, source: 'mongo', products: clientProducts });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách sản phẩm từ MongoDB', error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const payload = pickProductPayload(req.body || {});
    const error = validateProduct(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = await Product.findOne({ code: payload.code }).select('_id').lean();
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã sản phẩm đã tồn tại trong MongoDB' });

    if (payload.barcode) {
      const existedBarcode = await Product.findOne({ barcode: payload.barcode }).select('_id').lean();
      if (existedBarcode) return res.status(409).json({ ok: false, message: 'Mã vạch đã tồn tại trong MongoDB' });
    }

    const product = await Product.create(payload);
    await refreshProductCacheFromMongo();
    console.log('✅ MongoDB products.create:', payload.code);
    res.status(201).json({ ok: true, source: 'mongo', message: 'Đã tạo sản phẩm và lưu vào MongoDB', product: productMongoToClient(product) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được sản phẩm trên MongoDB', error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const currentProduct = await Product.findOne(buildProductMongoFilter(productId));
    if (!currentProduct) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm trong MongoDB' });

    const payload = pickProductPayload(req.body || {});
    const error = validateProduct(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = await Product.findOne({ code: payload.code, _id: { $ne: currentProduct._id } }).select('_id').lean();
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã sản phẩm đã tồn tại trong MongoDB' });

    if (payload.barcode) {
      const existedBarcode = await Product.findOne({ barcode: payload.barcode, _id: { $ne: currentProduct._id } }).select('_id').lean();
      if (existedBarcode) return res.status(409).json({ ok: false, message: 'Mã vạch đã tồn tại trong MongoDB' });
    }

    Object.assign(currentProduct, payload);
    await currentProduct.save();
    await refreshProductCacheFromMongo();
    console.log('✅ MongoDB products.update:', payload.code);
    res.json({ ok: true, source: 'mongo', message: 'Đã cập nhật sản phẩm vào MongoDB', product: productMongoToClient(currentProduct) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được sản phẩm trên MongoDB', error: err.message });
  }
});

app.patch('/api/products/:id/status', async (req, res) => {
  try {
    const product = await Product.findOne(buildProductMongoFilter(req.params.id));
    if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm trong MongoDB' });

    product.isActive = req.body.isActive !== false;
    await product.save();
    await refreshProductCacheFromMongo();
    console.log('✅ MongoDB products.status:', product.code, product.isActive);
    res.json({ ok: true, source: 'mongo', message: product.isActive ? 'Đã mở bán sản phẩm trong MongoDB' : 'Đã ngừng bán sản phẩm trong MongoDB', product: productMongoToClient(product) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đổi được trạng thái sản phẩm trên MongoDB', error: err.message });
  }
});

// Customers - MongoDB 100%
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await Customer.find(buildCustomerQueryFilter(req.query)).sort({ code: 1 }).lean();
    res.json({ ok: true, source: 'mongo', customers: customers.map(customerMongoToClient) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách khách hàng từ MongoDB', error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const payload = pickCustomerPayload(req.body || {});
    const error = validateCustomer(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = await Customer.findOne({ code: payload.code }).select('_id').lean();
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã khách hàng đã tồn tại trong MongoDB' });

    const customer = await Customer.create(payload);
    await refreshCustomerCacheFromMongo();
    console.log('✅ MongoDB customers.create:', payload.code);
    res.status(201).json({ ok: true, source: 'mongo', message: 'Đã tạo khách hàng và lưu vào MongoDB', customer: customerMongoToClient(customer) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được khách hàng trên MongoDB', error: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const currentCustomer = await Customer.findOne(buildCustomerMongoFilter(req.params.id));
    if (!currentCustomer) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng trong MongoDB' });

    const payload = pickCustomerPayload(req.body || {});
    const error = validateCustomer(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = await Customer.findOne({ code: payload.code, _id: { $ne: currentCustomer._id } }).select('_id').lean();
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã khách hàng đã tồn tại trong MongoDB' });

    Object.assign(currentCustomer, payload);
    await currentCustomer.save();
    await refreshCustomerCacheFromMongo();
    console.log('✅ MongoDB customers.update:', payload.code);
    res.json({ ok: true, source: 'mongo', message: 'Đã cập nhật khách hàng vào MongoDB', customer: customerMongoToClient(currentCustomer) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được khách hàng trên MongoDB', error: err.message });
  }
});

app.patch('/api/customers/:id/status', async (req, res) => {
  try {
    const customer = await Customer.findOne(buildCustomerMongoFilter(req.params.id));
    if (!customer) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng trong MongoDB' });

    customer.isActive = req.body.isActive !== false;
    await customer.save();
    await refreshCustomerCacheFromMongo();
    console.log('✅ MongoDB customers.status:', customer.code, customer.isActive);
    res.json({ ok: true, source: 'mongo', message: customer.isActive ? 'Đã kích hoạt khách hàng trong MongoDB' : 'Đã ngừng hoạt động khách hàng trong MongoDB', customer: customerMongoToClient(customer) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đổi được trạng thái khách hàng trên MongoDB', error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete(buildCustomerMongoFilter(req.params.id)).lean();
    if (!customer) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng trong MongoDB' });
    await refreshCustomerCacheFromMongo();
    console.log('✅ MongoDB customers.delete:', customer.code);
    res.json({ ok: true, source: 'mongo', message: 'Đã xóa khách hàng khỏi MongoDB', customer: customerMongoToClient(customer) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được khách hàng trên MongoDB', error: err.message });
  }
});

app.post('/api/customers/bulk-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).map(v => v.trim()).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ ok: false, message: 'Chưa chọn khách hàng để xóa' });
    const objectIds = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
    const result = await Customer.deleteMany({ $or: [{ code: { $in: ids } }, { _id: { $in: objectIds } }] });
    await refreshCustomerCacheFromMongo();
    const deleted = result.deletedCount || 0;
    console.log('✅ MongoDB customers.bulk-delete:', deleted);
    res.json({ ok: true, source: 'mongo', message: `Đã xóa ${deleted} khách hàng khỏi MongoDB`, deleted });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa nhiều khách hàng trên MongoDB', error: err.message });
  }
});



// Users / Staffs / Roles / Permissions - MongoDB 100%
app.get('/api/users', async (req, res) => {
  try {
    const staffs = await MongoStore.staffs.find(buildStaffQueryFilter(req.query)).sort({ code: 1, username: 1 }).lean();
    res.json({ ok: true, source: 'mongo', users: staffs.map(staffMongoToClient) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách tài khoản từ MongoDB', error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const id = String(req.body?.id || '').trim();
    const current = id ? await MongoStore.staffs.findOne(buildStaffMongoFilter(id)).lean() : null;
    const payload = pickStaffPayload(req.body || {}, current);
    const error = validateStaff(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const duplicated = await MongoStore.staffs.findOne({
      $or: [{ code: payload.code }, { username: payload.username }],
      ...(current?._id ? { _id: { $ne: current._id } } : {})
    }).select('_id code username').lean();
    if (duplicated) return res.status(409).json({ ok: false, message: 'Mã nhân viên hoặc tên đăng nhập đã tồn tại trong MongoDB' });

    const saved = current
      ? await MongoStore.staffs.findOneAndUpdate(buildStaffMongoFilter(id), payload, { new: true, runValidators: false }).lean()
      : await MongoStore.staffs.create(payload);
    await refreshAccessCacheFromMongo();
    res.status(current ? 200 : 201).json({ ok: true, source: 'mongo', message: current ? 'Đã cập nhật tài khoản vào MongoDB' : 'Đã tạo tài khoản trên MongoDB', user: staffMongoToClient(saved) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được tài khoản trên MongoDB', error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const staff = await MongoStore.staffs.findOneAndDelete(buildStaffMongoFilter(req.params.id)).lean();
    if (!staff) return res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản trong MongoDB' });
    await refreshAccessCacheFromMongo();
    res.json({ ok: true, source: 'mongo', message: 'Đã xóa tài khoản khỏi MongoDB', user: staffMongoToClient(staff) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được tài khoản trên MongoDB', error: err.message });
  }
});

app.get('/api/staffs', async (req, res) => {
  try {
    const staffs = await MongoStore.staffs.find(buildStaffQueryFilter(req.query)).sort({ code: 1, username: 1 }).lean();
    res.json({ ok: true, source: 'mongo', staffs: staffs.map(staffMongoToClient) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được nhân viên từ MongoDB', error: err.message });
  }
});

app.get('/api/roles', async (req, res) => {
  try {
    const roles = await MongoStore.roles.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean();
    res.json({ ok: true, source: 'mongo', roles: roles.map(stripMongoFields) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được vai trò từ MongoDB', error: err.message });
  }
});

app.get('/api/permissions', async (req, res) => {
  try {
    const roleCode = String(req.query.roleCode || req.query.role || '').trim();
    const filter = roleCode ? { roleCode } : {};
    const permissions = await MongoStore.permissions.find(filter).sort({ roleCode: 1, module: 1 }).lean();
    res.json({ ok: true, source: 'mongo', permissions: permissions.map(stripMongoFields) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được phân quyền từ MongoDB', error: err.message });
  }
});

app.get('/api/import/custom-templates', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    res.json({ ok: true, templates: data.importTemplates || [] });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được mẫu import tự tạo', error: err.message });
  }
});

app.post('/api/import/custom-templates', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const template = normalizeImportTemplatePayload(req.body || {});
    if (!Array.isArray(data.importTemplates)) data.importTemplates = [];
    const index = data.importTemplates.findIndex((item) => normalizeText(item.id) === normalizeText(template.id) || normalizeText(item.code) === normalizeText(template.code));
    if (index >= 0) data.importTemplates[index] = { ...data.importTemplates[index], ...template, createdAt: data.importTemplates[index].createdAt || template.createdAt };
    else data.importTemplates.unshift(template);
    await persistPrimaryDataSnapshot(data);
    res.json({ ok: true, message: 'Đã lưu mẫu import tự tạo', template });
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, message: err.message || 'Không lưu được mẫu import' });
  }
});

app.delete('/api/import/custom-templates/:id', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const id = String(req.params.id || '').trim();
    const before = (data.importTemplates || []).length;
    data.importTemplates = (data.importTemplates || []).filter((template) => normalizeText(template.id) !== normalizeText(id));
    if (data.importTemplates.length === before) return res.status(404).json({ ok: false, message: 'Không tìm thấy mẫu import' });
    await persistPrimaryDataSnapshot(data);
    res.json({ ok: true, message: 'Đã xóa mẫu import' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được mẫu import', error: err.message });
  }
});

app.get('/api/import/custom-template/:id/download', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const template = findImportTemplate(data, req.params.id);
    if (!template) return res.status(404).json({ ok: false, message: 'Không tìm thấy mẫu import' });
    const headers = template.fields.map((field) => field.excelHeader);
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet['!cols'] = headers.map((h) => ({ wch: Math.max(14, String(h).length + 6) }));
    XLSX.utils.book_append_sheet(workbook, sheet, template.sheetName || 'Import');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const safeName = String(template.name || 'mau-import-tu-tao').replace(/[\\/:*?"<>|]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được file mẫu tự tạo', error: err.message });
  }
});

app.get('/api/import/templates', (req, res) => {
  try {
    res.json({ ok: true, templates: getTemplateTypes() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được danh sách mẫu import', error: err.message });
  }
});

app.get('/api/import/template/:type', (req, res) => {
  try {
    const type = String(req.params.type || '').trim();
    const { buffer, fileName } = buildImportTemplate(type);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, message: err.message || 'Không tạo được mẫu import Excel' });
  }
});


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



app.get('/api/stock', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const q = normalizeText(req.query.q);
    const stock = ((await getPrimaryDataSnapshot()).stock || [])
      .filter((row) => !q || [row.productCode, row.productName, row.unit, row.packing].join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(a.productCode || '').localeCompare(String(b.productCode || '')));
    res.json({ ok: true, source: 'mongo', stock });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được tồn kho từ MongoDB', error: err.message });
  }
});

app.get('/api/debts', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    res.json({ ok: true, source: 'mongo', debts: buildCustomerDebtSummary(data), payments: data.payments || [] });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được công nợ từ MongoDB', error: err.message });
  }
});

app.get('/api/cashbook', async (req, res) => {
  try {
    await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const q = normalizeText(req.query.q);
    let cashbooks = data.cashbooks || data.cashbook || [];
    let bankbooks = data.bankbooks || [];
    if (q) {
      const match = (e) => [e.code, e.source, e.refCode, e.customerCode, e.customerName, e.staffName, e.note].some((value) => normalizeText(value).includes(q));
      cashbooks = cashbooks.filter(match);
      bankbooks = bankbooks.filter(match);
    }
    res.json({ ok: true, source: 'mongo', cashbook: cashbooks, cashbooks, bankbooks, summary: getCashSummary({ ...data, cashbooks }), bankSummary: getBankSummary({ ...data, bankbooks }) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được sổ quỹ từ MongoDB', error: err.message });
  }
});

app.post('/api/cashbook', async (req, res) => {
  try {
    await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const amount = toNumber(req.body.amount);
    if (amount <= 0) return res.status(400).json({ ok: false, message: 'Số tiền phải lớn hơn 0' });
    const type = String(req.body.type || 'in').toLowerCase() === 'out' ? 'out' : 'in';
    const entry = {
      id: makeId('CB'),
      code: buildCashCode(data, type),
      date: String(req.body.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      type,
      source: String(req.body.source || 'manual_cashbook').trim(),
      refType: 'manual_cashbook',
      refId: '',
      refCode: '',
      customerId: '',
      customerCode: String(req.body.customerCode || '').trim(),
      customerName: String(req.body.customerName || '').trim(),
      staffName: String(req.body.staffName || '').trim(),
      method: 'cash',
      amount,
      note: String(req.body.note || '').trim(),
      status: 'posted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.cashbooks = data.cashbooks || data.cashbook || [];
    data.cashbooks.push(entry);
    data.cashbook = data.cashbooks;
    auditLog(data, 'create_cashbook', 'cashbook', entry, null, entry, 'Ghi sổ tiền mặt thủ công', req.user?.name || '');
    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: `Đã ghi sổ tiền mặt ${entry.code}`, entry, cashbook: entry });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không ghi được sổ tiền mặt' });
  }
});

app.get('/api/bankbook', async (req, res) => {
  try {
    await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    res.json({ ok: true, source: 'mongo', bankbooks: data.bankbooks || [], summary: getBankSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được sổ chuyển khoản từ MongoDB', error: err.message });
  }
});

app.get('/api/receipts', async (req, res) => {
  try {
    await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const q = normalizeText(req.query.q);
    let receipts = data.receipts || [];
    if (q) receipts = receipts.filter((r) => [r.code, r.customerCode, r.customerName, r.staffName, r.refCode, r.note].some((value) => normalizeText(value).includes(q)));
    res.json({ ok: true, source: 'mongo', receipts });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu thu từ MongoDB', error: err.message });
  }
});

app.post('/api/receipts', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const amount = toNumber(req.body.amount);
    if (amount <= 0) return res.status(400).json({ ok: false, message: 'Số tiền thu phải lớn hơn 0' });
    const customer = findCustomer(data, req.body.customerId || req.body.customerCode);
    if (!customer) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    const receipt = createReceiptDocument(data, { ...req.body, customer, amount });
    auditLog(data, 'create_receipt', 'receipt', receipt, null, receipt, 'Tạo phiếu thu ghi Mongo', req.user?.name || '');
    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: `Đã tạo phiếu thu ${receipt.code}`, receipt });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu thu' });
  }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const receipt = (data.receipts || []).find((r) => r.id === req.params.id || r.code === req.params.id);
    if (!receipt) return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu thu' });
    const before = { ...receipt };
    receipt.status = 'void';
    receipt.voidReason = String(req.query.reason || req.body?.reason || 'Hủy phiếu thu').trim();
    receipt.voidedAt = new Date().toISOString();
    receipt.updatedAt = new Date().toISOString();
    const sameRef = (entry) => entry.refType === 'receipt' && (entry.refId === receipt.id || entry.refCode === receipt.code);
    (data.payments || []).forEach((entry) => { if (sameRef(entry)) { entry.status = 'void'; entry.updatedAt = new Date().toISOString(); } });
    (data.cashbooks || data.cashbook || []).forEach((entry) => { if (sameRef(entry)) { entry.status = 'void'; entry.updatedAt = new Date().toISOString(); } });
    (data.bankbooks || []).forEach((entry) => { if (sameRef(entry)) { entry.status = 'void'; entry.updatedAt = new Date().toISOString(); } });
    auditLog(data, 'void_receipt', 'receipt', receipt, before, receipt, receipt.voidReason, req.user?.name || '');
    await saveOperationalData(data);
    res.json({ ok: true, source: 'mongo', message: `Đã hủy phiếu thu ${receipt.code}`, receipt });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được phiếu thu' });
  }
});

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
app.get('/api/import-orders', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const orders = ((await getPrimaryDataSnapshot()).importOrders || []).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    res.json({ ok: true, source: 'mongo', importOrders: orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu nhập từ MongoDB', error: err.message });
  }
});

app.post('/api/import-orders', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Phiếu nhập chưa có dòng hàng' });
    const items = rawItems.map((raw) => {
      const product = findProduct(data, raw.productCode || raw.code || raw.productId);
      if (!product) throw new Error(`Không tìm thấy sản phẩm: ${raw.productCode || raw.code || raw.productId || ''}`);
      const quantity = toNumber(raw.quantity || raw.qty);
      const costPrice = toNumber(raw.costPrice || raw.price || product.costPrice);
      if (quantity <= 0) throw new Error(`Số lượng nhập phải lớn hơn 0: ${product.code}`);
      if (costPrice < 0) throw new Error(`Giá nhập không được âm: ${product.code}`);
      return { productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, costPrice, amount: quantity * costPrice };
    });
    const order = {
      id: makeId('IM'), code: buildImportCode(data), date: String(req.body.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      supplier: String(req.body.supplier || req.body.supplierName || '').trim(), note: String(req.body.note || '').trim(),
      items, totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0), totalAmount: items.reduce((sum, item) => sum + toNumber(item.amount), 0),
      status: 'posted', source: 'mongo_import_order', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.importOrders.push(order);
    items.forEach((item) => upsertStock(data, item));
    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: `Đã tạo phiếu nhập ${order.code} trên MongoDB`, importOrder: order });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu nhập' });
  }
});

app.put('/api/import-orders/:id', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const order = (data.importOrders || []).find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu nhập' });
    (order.items || []).forEach((item) => reduceStock(data, item));
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) throw new Error('Phiếu nhập chưa có dòng hàng');
    const items = rawItems.map((raw) => {
      const product = findProduct(data, raw.productCode || raw.code || raw.productId);
      if (!product) throw new Error(`Không tìm thấy sản phẩm: ${raw.productCode || raw.code || raw.productId || ''}`);
      const quantity = toNumber(raw.quantity || raw.qty);
      const costPrice = toNumber(raw.costPrice || raw.price || product.costPrice);
      if (quantity <= 0) throw new Error(`Số lượng nhập phải lớn hơn 0: ${product.code}`);
      return { productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, costPrice, amount: quantity * costPrice };
    });
    Object.assign(order, {
      date: String(req.body.date || order.date || new Date().toISOString().slice(0, 10)).slice(0, 10), supplier: String(req.body.supplier || order.supplier || '').trim(), note: String(req.body.note ?? order.note ?? '').trim(),
      items, totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0), totalAmount: items.reduce((sum, item) => sum + toNumber(item.amount), 0), updatedAt: new Date().toISOString()
    });
    items.forEach((item) => upsertStock(data, item));
    await saveOperationalData(data);
    res.json({ ok: true, source: 'mongo', message: `Đã cập nhật phiếu nhập ${order.code} trên MongoDB`, importOrder: order });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được phiếu nhập' });
  }
});

app.get('/api/sales-orders', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const orders = ((await getPrimaryDataSnapshot()).salesOrders || []).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    res.json({ ok: true, source: 'mongo', salesOrders: orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn bán từ MongoDB', error: err.message });
  }
});

app.post('/api/sales-orders', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const patch = buildValidatedSalesOrderPatch(data, {}, req.body || {});
    const order = {
      id: makeId('SO'), code: buildSalesCode(data), ...patch,
      source: 'web_sales_app', orderSource: req.body.orderSource || 'NVBH', orderSourceName: req.body.orderSourceName || (req.body.orderSource === 'DMS' ? 'Từ DMS' : 'Từ NVBH'),
      isChildOrder: true, masterOrderId: '', masterOrderCode: '', mergeStatus: 'unmerged', deliveryStatus: 'pending', status: 'posted', createdAt: new Date().toISOString()
    };
    data.salesOrders.push(order);
    order.items.forEach((item) => reduceStock(data, item));
    addOrderFinancialEntries(data, order);
    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: `Đã tạo đơn bán ${order.code} trên MongoDB`, salesOrder: order });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn bán' });
  }
});

app.put('/api/sales-orders/:id', async (req, res) => {
  try {
    if (!canAccountingEdit(req)) return res.status(403).json({ ok: false, message: 'Chỉ kế toán/admin được sửa đơn bán' });
    const data = await getPrimaryDataSnapshot();
    const order = (data.salesOrders || []).find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });
    const before = cloneData(order);
    const salesOrder = updateSalesOrderWithRepost(data, order, req.body || {});
    auditLog(data, 'update_sales_order', 'salesOrder', salesOrder, before, salesOrder, `Sửa đơn bán ${salesOrder.code}`, req.body?.actorName || 'admin');
    await saveOperationalData(data);
    res.json({ ok: true, source: 'mongo', message: `Đã cập nhật đơn bán ${salesOrder.code} trên MongoDB`, salesOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được đơn bán' });
  }
});

app.post('/api/sales-orders/:id/cancel', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const order = (data.salesOrders || []).find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });
    if (['cancelled', 'void'].includes(String(order.status || '').toLowerCase())) return res.json({ ok: true, source: 'mongo', message: 'Đơn đã ở trạng thái hủy', salesOrder: order });
    const before = cloneData(order);
    (order.items || []).forEach((item) => restoreStock(data, item));
    removeOrderFinancialEntries(data, order);
    Object.assign(order, { status: 'cancelled', deliveryStatus: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: String(req.body.reason || '').trim(), updatedAt: new Date().toISOString() });
    syncMasterOrderAfterChildChange(data, order.masterOrderId || order.masterOrderCode);
    auditLog(data, 'cancel_sales_order', 'salesOrder', order, before, order, order.cancelReason || `Hủy đơn ${order.code}`, req.body?.actorName || 'admin');
    await saveOperationalData(data);
    res.json({ ok: true, source: 'mongo', message: `Đã hủy đơn bán ${order.code} trên MongoDB`, salesOrder: order });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn bán' });
  }
});

app.get('/api/master-orders/unmerged-child-orders', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const q = normalizeText(req.query.q);
    const source = normalizeText(req.query.source);
    const date = String(req.query.date || '').slice(0, 10);
    const salesStaff = normalizeText(req.query.salesStaff);
    const orders = ((await getPrimaryDataSnapshot()).salesOrders || [])
      .filter((order) => !['cancelled', 'void'].includes(String(order.status || '').toLowerCase()))
      .filter((order) => (order.mergeStatus || 'unmerged') !== 'merged' && !order.masterOrderId && !order.masterOrderCode)
      .filter((order) => !q || [order.code, order.customerCode, order.customerName, order.customerPhone, order.customerAddress].join(' ').toLowerCase().includes(q))
      .filter((order) => !source || normalizeText(order.orderSource || 'NVBH') === source)
      .filter((order) => !date || String(order.deliveryDate || order.date || '').slice(0, 10) === date)
      .filter((order) => !salesStaff || [order.staffCode, order.staffName, order.salesStaffCode, order.salesStaffName].join(' ').toLowerCase().includes(salesStaff));
    res.json({ ok: true, source: 'mongo', orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn con chưa gộp từ MongoDB', error: err.message });
  }
});

app.get('/api/master-orders', async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const q = normalizeText(req.query.q);
    const dateFrom = String(req.query.dateFrom || '').slice(0, 10);
    const dateTo = String(req.query.dateTo || '').slice(0, 10);
    const data = await getPrimaryDataSnapshot();
    const masterOrders = (data.masterOrders || []).map((order) => ({ ...order, children: getMasterOrderChildren(data, order) }))
      .filter((order) => !q || [order.code, order.routeName, order.deliveryStaffName, order.deliveryStaffCode].join(' ').toLowerCase().includes(q))
      .filter((order) => { const d = String(order.deliveryDate || order.date || '').slice(0, 10); return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo); })
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    res.json({ ok: true, source: 'mongo', masterOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn tổng từ MongoDB', error: err.message });
  }
});

app.post('/api/master-orders', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const childIds = Array.isArray(req.body.childOrderIds) ? req.body.childOrderIds.map(String) : [];
    if (!childIds.length) return res.status(400).json({ ok: false, message: 'Chưa chọn đơn con để gộp' });
    const children = (data.salesOrders || []).filter((order) => childIds.includes(String(order.id)) || childIds.includes(String(order.code)));
    if (children.length !== childIds.length) return res.status(400).json({ ok: false, message: 'Một số đơn con không tồn tại' });
    if (children.some((order) => order.masterOrderId || (order.mergeStatus || 'unmerged') === 'merged')) return res.status(400).json({ ok: false, message: 'Có đơn con đã được gộp trước đó' });
    const deliveryStaff = findStaff(data, req.body.deliveryStaffId || req.body.deliveryStaffCode || req.body.deliveryStaffName);
    const salesStaff = findStaff(data, req.body.salesStaffId || req.body.salesStaffCode || req.body.salesStaffName);
    const master = {
      id: makeId('MO'), code: buildMasterOrderCode(data), date: String(req.body.date || req.body.deliveryDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
      deliveryDate: String(req.body.deliveryDate || req.body.date || new Date().toISOString().slice(0, 10)).slice(0, 10), routeName: String(req.body.routeName || '').trim(),
      deliveryStaffId: deliveryStaff?.id || String(req.body.deliveryStaffId || '').trim(), deliveryStaffCode: deliveryStaff?.code || String(req.body.deliveryStaffCode || '').trim(), deliveryStaffName: deliveryStaff?.name || String(req.body.deliveryStaffName || '').trim(),
      salesStaffId: salesStaff?.id || String(req.body.salesStaffId || '').trim(), salesStaffCode: salesStaff?.code || String(req.body.salesStaffCode || '').trim(), salesStaffName: salesStaff?.name || String(req.body.salesStaffName || '').trim(),
      note: String(req.body.note || '').trim(), childOrderIds: children.map((order) => order.id), status: 'assigned', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    Object.assign(master, summarizeMasterOrder(children));
    children.forEach((order) => Object.assign(order, { masterOrderId: master.id, masterOrderCode: master.code, mergeStatus: 'merged', deliveryDate: master.deliveryDate, deliveryStaffId: master.deliveryStaffId, deliveryStaffCode: master.deliveryStaffCode, deliveryStaffName: master.deliveryStaffName, routeName: master.routeName, deliveryRoute: master.routeName, updatedAt: new Date().toISOString() }));
    data.masterOrders.push(master);
    auditLog(data, 'create_master_order', 'masterOrder', master, null, master, `Gộp ${children.length} đơn con vào ${master.code}`, req.body?.actorName || 'admin');
    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: `Đã tạo đơn tổng ${master.code} trên MongoDB`, masterOrder: master });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được đơn tổng' });
  }
});

app.post('/api/master-orders/:id/cancel', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const master = (data.masterOrders || []).find((order) => order.id === req.params.id || order.code === req.params.id);
    if (!master) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn tổng' });
    const before = cloneData(master);
    getMasterOrderChildren(data, master).forEach((order) => Object.assign(order, { masterOrderId: '', masterOrderCode: '', mergeStatus: 'unmerged', deliveryStaffId: '', deliveryStaffCode: '', deliveryStaffName: '', routeName: '', deliveryRoute: '', updatedAt: new Date().toISOString() }));
    Object.assign(master, { status: 'cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    auditLog(data, 'cancel_master_order', 'masterOrder', master, before, master, `Hủy gộp đơn tổng ${master.code}`, req.body?.actorName || 'admin');
    await saveOperationalData(data);
    res.json({ ok: true, source: 'mongo', message: `Đã hủy gộp đơn tổng ${master.code} trên MongoDB`, masterOrder: master });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được đơn tổng' });
  }
});

// Import Excel
app.post('/api/import/preview', upload.single('file'), async (req, res) => {
  try {
    let type = String(req.body.type || '').trim();
    const templateId = String(req.body.templateId || '').trim();
    if (!type) return res.status(400).json({ ok: false, message: 'Thiếu loại import' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok: false, message: 'Chưa chọn file Excel' });

    const rows = parseExcelBuffer(req.file.buffer);
    if (!rows.length) return res.status(400).json({ ok: false, message: 'File Excel không có dữ liệu' });

    if (type === 'products') await refreshProductCacheFromMongo();
    if (type === 'customers') await refreshCustomerCacheFromMongo();
    if (['cashbook', 'receipts', 'returnOrders', 'bankbooks'].includes(type)) await refreshFinancialDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const template = templateId ? findImportTemplate(data, templateId) : null;
    if (template) type = template.type || type;
    const mappedRows = template ? applyImportTemplateRows(rows, template) : rows;
    const preview = previewImport(type, mappedRows, data);
    preview.templateId = template ? template.id : '';
    res.json({ ok: true, ...preview });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: err.message });
  }
});

app.post('/api/import/commit', async (req, res) => {
  try {
    const type = String(req.body.type || '').trim();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!type) return res.status(400).json({ ok: false, message: 'Thiếu loại import' });
    if (!rows.length) return res.status(400).json({ ok: false, message: 'Chưa có dòng nào để import' });

    // Riêng sản phẩm phải ghi trực tiếp MongoDB, không chỉ ghi vào data/kho-data.json.
    if (type === 'products') {
      const mongoResult = await upsertProductRowsToMongo(rows);
      return res.json({
        ok: true,
        source: 'mongo',
        message: `Đã import ${mongoResult.imported} sản phẩm vào MongoDB`,
        imported: mongoResult.imported,
        skipped: mongoResult.skipped,
        errors: mongoResult.errors,
        products: []
      });
    }

    if (type === 'customers') {
      const mongoResult = await upsertCustomerRowsToMongo(rows);
      return res.json({
        ok: true,
        source: 'mongo',
        message: `Đã import ${mongoResult.imported} khách hàng vào MongoDB`,
        imported: mongoResult.imported,
        skipped: mongoResult.skipped,
        errors: mongoResult.errors,
        customers: []
      });
    }

    const data = await getPrimaryDataSnapshot();
    const result = commitImport(type, rows, data);
    if (!result.ok) return res.status(400).json(result);
    if (['importOrders', 'salesOrders', 'cashbook', 'receipts', 'returnOrders', 'bankbooks'].includes(type)) {
      await saveOperationalData(data);
      return res.json({ ok: true, source: 'mongo', message: result.message || `Đã import ${type} vào MongoDB`, ...result, data: await getPrimaryDataSnapshot() });
    }
    await persistPrimaryDataSnapshot(data);
    res.json({ ok: true, ...result, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: err.message });
  }
});

app.get('/api/import/logs', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    res.json({ ok: true, importLogs: data.importLogs || [] });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được lịch sử import', error: err.message });
  }
});


// Print templates
app.post('/api/print/render', (req, res) => {
  try {
    const { type, document, options } = req.body || {};
    if (!type) return res.status(400).json({ ok: false, message: 'Thiếu loại mẫu in' });
    if (!document) return res.status(400).json({ ok: false, message: 'Thiếu dữ liệu chứng từ để in' });
    const html = renderPrintHtml(type, document, options || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không render được mẫu in', error: err.message });
  }
});

app.get('/api/print/:type/:id', async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const type = String(req.params.type || '').trim();
    const id = String(req.params.id || '').trim();
    let document = null;
    let printType = type;

    if (type === 'ORDER_SINGLE') document = data.salesOrders.find(order => order.id === id || order.code === id);
    if (type === 'IMPORT_ORDER') document = data.importOrders.find(order => order.id === id || order.code === id);
    if (type === 'PAYMENT_RECEIPT') document = (data.cashbooks || data.cashbook || []).find(entry => entry.id === id || entry.code === id);

    if (!document) return res.status(404).json({ ok: false, message: 'Không tìm thấy chứng từ để in' });

    const html = renderPrintHtml(printType, document, {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không in được chứng từ', error: err.message });
  }
});


// =========================
// Mobile App API - V44
// Chạy trực tiếp với cấu trúc server.js hiện tại, không cần thêm package.
// Mobile UI nằm tại: /mobile/login.html
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

app.post('/api/mobile/login', authLimiter, [body('username').isLength({ min: 2 }).withMessage('Tài khoản không hợp lệ'), body('password').isLength({ min: 4 }).withMessage('Mật khẩu không hợp lệ')], validateRequest, async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    if (!username || !password) return res.status(400).json({ ok: false, message: 'Thiếu tài khoản hoặc mật khẩu' });

    const staffDoc = await MongoStore.staffs.findOne({
      isActive: { $ne: false },
      $or: [{ username }, { code: username }, { phone: username }, { name: username }]
    }).lean();
    const staff = staffDoc && verifyPasswordSync(password, staffDoc.password || staffDoc.pass || staffDoc.pin || '123456') ? staffMongoToClient(staffDoc) : null;
    if (!staff) return res.status(401).json({ ok: false, message: 'Sai tài khoản hoặc mật khẩu' });

    const user = {
      id: staff.id || staff.code || username,
      code: staff.code || '',
      username: staff.username || staff.code || username,
      name: staff.name || staff.fullName || username,
      role: VALID_ROLES.includes(staff.role || staff.type) ? (staff.role || staff.type) : 'sales',
      roleLabel: ROLE_LABELS[VALID_ROLES.includes(staff.role || staff.type) ? (staff.role || staff.type) : 'sales']
    };

    writeMobileLog(data, user, 'mobile_login', { note: 'Đăng nhập mobile app bằng Mongo staffs' });
    await persistPrimaryDataSnapshot(data);
    res.json({ ok: true, success: true, source: 'mongo', token: encodeMobileToken(user), refreshToken: encodeMobileRefreshToken(user), expiresIn: ACCESS_TOKEN_EXPIRES_IN, user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đăng nhập được mobile app từ MongoDB', error: err.message });
  }
});

app.post('/api/mobile/refresh', authLimiter, async (req, res) => {
  try {
    const refreshToken = String(req.body.refreshToken || '').trim();
    const user = decodeMobileRefreshToken(refreshToken);
    if (!user) return res.status(401).json({ ok: false, success: false, message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
    const safeUser = buildJwtPayload(user);
    return res.json({ ok: true, success: true, token: encodeMobileToken(safeUser), refreshToken: encodeMobileRefreshToken(safeUser), expiresIn: ACCESS_TOKEN_EXPIRES_IN, user: safeUser });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: 'Không làm mới được phiên đăng nhập', error: err.message });
  }
});

app.get('/api/mobile/me', requireMobileLogin, async (req, res) => {
  res.json({ ok: true, user: req.mobileUser, roles: ROLE_LABELS });
});

app.get('/api/mobile/roles', requireMobileLogin, async (req, res) => {
  try {
    const roles = await MongoStore.roles.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean();
    res.json({ ok: true, source: 'mongo', roles: roles.map(stripMongoFields), roleLabels: ROLE_LABELS });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được vai trò mobile từ MongoDB', error: err.message });
  }
});

app.get('/api/mobile/customers', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const q = normalizeText(req.query.q);
    const filter = { isActive: { $ne: false } };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } },
        { area: { $regex: q, $options: 'i' } },
        { route: { $regex: q, $options: 'i' } },
        { staffName: { $regex: q, $options: 'i' } }
      ];
    }
    const customers = await Customer.find(filter).sort({ code: 1 }).limit(30).lean();
    const items = customers.map(customerMongoToClient).map(customer => ({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      area: customer.area,
      route: customer.route || '',
      staffCode: customer.staffCode || '',
      staffName: customer.staffName
    }));
    res.json({ ok: true, source: 'mongo', items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được khách hàng mobile từ MongoDB', error: err.message });
  }
});

app.get('/api/mobile/products', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const q = normalizeText(req.query.q);
    const filter = { isActive: { $ne: false } };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { productCode: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ];
    }
    // Lấy dư hơn rồi lọc theo tồn thực tế, tránh autocomplete còn hiện dòng Tồn: 0/0.
    const products = await Product.find(filter).sort({ code: 1 }).limit(200).lean();
    const data = await getPrimaryDataSnapshot();
    const items = products
      .map(productMongoToClient)
      .map(product => {
        const availableQty = getProductAvailableQty(data, product);
        const stockDisplay = formatCaseLooseQty(availableQty, product.conversionRate || 1);
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
          availableQty,
          stockQuantity: availableQty,
          stockDisplay
        };
      })
      .filter(item => toNumber(item.availableQty) > 0)
      .slice(0, 30);
    res.json({ ok: true, source: 'mongo', items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được sản phẩm mobile từ MongoDB', error: err.message });
  }
});

app.get('/api/mobile/stock', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const q = normalizeText(req.query.q);
    const filter = { isActive: { $ne: false } };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { productCode: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ];
    }
    const products = await Product.find(filter).sort({ code: 1 }).limit(200).lean();
    const items = products
      .map(productMongoToClient)
      .map(product => buildMobileProduct(data, product))
      .filter(item => toNumber(item.availableQty) > 0)
      .slice(0, 100);
    res.json({ ok: true, source: 'mongo', items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được tồn kho mobile', error: err.message });
  }
});

app.post('/api/mobile/sales/orders', requireMobileLogin, requireMobileRole(['sales']), async (req, res) => {
  try {
    const data = await getPrimaryDataSnapshot();
    const body = req.body || {};
    const customerPayload = body.customer || {};
    const customer = findCustomer(data, customerPayload.id || customerPayload.code || body.customerId || body.customerCode);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const paidAmount = toNumber(body.paidAmount);
    const date = new Date().toISOString().slice(0, 10);

    if (!customer) return res.status(400).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Đơn mobile chưa có sản phẩm' });

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productCode || rawItem.code || rawItem.productId);
      if (!product) return res.status(400).json({ ok: false, message: `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || ''}` });
      const quantity = toNumber(rawItem.quantity || rawItem.qty);
      const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice);
      if (quantity <= 0) return res.status(400).json({ ok: false, message: `Số lượng phải lớn hơn 0: ${product.code}` });
      const availableQty = getProductAvailableQty(data, product);
      if (availableQty < quantity) return res.status(400).json({ ok: false, message: `Không đủ tồn mở bán: ${product.code}. Tồn ${formatCaseLooseQty(availableQty, product.conversionRate || 1)}, cần ${formatCaseLooseQty(quantity, product.conversionRate || 1)}` });
      items.push({ productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, salePrice, amount: quantity * salePrice });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    if (paidAmount > totalAmount) return res.status(400).json({ ok: false, message: 'Tiền thu không được lớn hơn tổng đơn' });

    const salesOrder = {
      id: makeId('SO'),
      code: buildSalesCode(data),
      date,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      staffCode: req.mobileUser.code || '',
      staffName: req.mobileUser.name || '',
      source: 'mobile_sales_app',
      orderSource: 'NVBH',
      orderSourceName: 'Từ NVBH',
      isChildOrder: true,
      masterOrderId: '',
      mergeStatus: 'unmerged',
      note: String(body.note || 'Tạo từ mobile app').trim(),
      items,
      totalQuantity,
      totalAmount,
      paidAmount,
      debtAmount: totalAmount - paidAmount,
      status: 'posted',
      deliveryStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    data.salesOrders.push(salesOrder);
    items.forEach(item => reduceStock(data, item));
    data.payments.push({
      id: makeId('PM'),
      date,
      type: 'sale_debt',
      refType: 'salesOrder',
      refId: salesOrder.id,
      refCode: salesOrder.code,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      debit: totalAmount,
      credit: paidAmount,
      note: `Phát sinh từ đơn mobile ${salesOrder.code}`,
      createdAt: new Date().toISOString()
    });
    if (paidAmount > 0) {
      data.cashbooks.push({
        id: makeId('CB'),
        code: buildCashCode(data, 'in'),
        date,
        type: 'in',
        source: 'mobile_sales_payment',
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        staffName: req.mobileUser.name || '',
        amount: paidAmount,
        note: `Thu tiền từ đơn mobile ${salesOrder.code}`,
        createdAt: new Date().toISOString()
      });
    }

    writeMobileLog(data, req.mobileUser, 'mobile_create_sales_order', {
      refType: 'salesOrder',
      refId: salesOrder.id,
      refCode: salesOrder.code,
      note: `Tạo đơn ${salesOrder.code} từ mobile`
    });

    await saveOperationalData(data);
    res.status(201).json({ ok: true, source: 'mongo', message: 'Đã gửi đơn mobile về hệ thống tổng', salesOrder });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được đơn mobile', error: err.message });
  }
});

app.get('/api/mobile/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales']), async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const order = data.salesOrders.find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });
    const mine = normalizeText(order.staffCode || order.salesStaffCode) === normalizeText(req.mobileUser.code) || normalizeText(order.staffName || order.salesStaffName) === normalizeText(req.mobileUser.name);
    if (!mine) return res.status(403).json({ ok: false, message: 'Bạn chỉ được xem đơn của mình' });
    res.json({ ok: true, order: { ...order, canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged' } });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được đơn mobile', error: err.message });
  }
});

app.put('/api/mobile/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales']), async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const order = data.salesOrders.find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });
    const mine = normalizeText(order.staffCode || order.salesStaffCode) === normalizeText(req.mobileUser.code) || normalizeText(order.staffName || order.salesStaffName) === normalizeText(req.mobileUser.name);
    if (!mine) return res.status(403).json({ ok: false, message: 'Bạn chỉ được sửa đơn của mình' });
    if (order.masterOrderId || (order.mergeStatus || 'unmerged') === 'merged') {
      return res.status(403).json({ ok: false, message: 'Đơn đã gộp đơn tổng, app bán hàng không được sửa. Vui lòng báo kế toán/admin sửa trong lịch sử bán hàng.' });
    }

    const body = req.body || {};
    const customerPayload = body.customer || {};
    const patchBody = {
      ...body,
      customerId: customerPayload.id || customerPayload.code || body.customerId || body.customerCode || order.customerId,
      customerCode: customerPayload.code || body.customerCode || order.customerCode,
      salesStaffCode: req.mobileUser.code || order.salesStaffCode || order.staffCode || '',
      salesStaffName: req.mobileUser.name || order.salesStaffName || order.staffName || ''
    };
    const salesOrder = updateSalesOrderWithRepost(data, order, patchBody);
    writeMobileLog(data, req.mobileUser, 'mobile_edit_sales_order', {
      refType: 'salesOrder',
      refId: salesOrder.id,
      refCode: salesOrder.code,
      note: `Sửa đơn ${salesOrder.code} từ mobile khi chưa gộp đơn tổng`
    });
    await saveOperationalData(data);
    res.json({ ok: true, source: 'mongo', message: `Đã sửa đơn ${salesOrder.code}`, salesOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được đơn mobile' });
  }
});

app.get('/api/mobile/sales/orders', requireMobileLogin, requireMobileRole(['sales']), async (req, res) => {
  try {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const today = new Date().toISOString().slice(0, 10);
    const onlyMine = String(req.query.mine || '1') !== '0';
    const items = data.salesOrders
      .filter(order => order.date === today)
      .filter(order => !onlyMine || normalizeText(order.staffCode) === normalizeText(req.mobileUser.code) || normalizeText(order.staffName) === normalizeText(req.mobileUser.name))
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50)
      .map(order => ({
        id: order.id,
        code: order.code,
        date: order.date,
        customerName: order.customerName,
        totalAmount: toNumber(order.totalAmount),
        paidAmount: toNumber(order.paidAmount),
        debtAmount: toNumber(order.debtAmount),
        status: order.status,
        deliveryStatus: order.deliveryStatus || 'pending',
        masterOrderId: order.masterOrderId || '',
        masterOrderCode: order.masterOrderCode || '',
        mergeStatus: order.mergeStatus || 'unmerged',
        canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged',
        customerId: order.customerId,
        customerCode: order.customerCode,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        items: order.items || [],
        note: order.note || '',
        createdAt: order.createdAt
      }));
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn đã chấm mobile', error: err.message });
  }
});

registerMobileDeliveryRoutes(app, {
  getPrimaryDataSnapshot,
  persistPrimaryDataSnapshot,
  requireMobileLogin,
  requireMobileRole,
  normalizeText,
  toNumber,
  buildDebtLedgerRows,
  getOrderDeliveryDate,
  isOrderApprovedForDelivery,
  getOrderDeliveryInfo,
  isOrderAssignedToDeliveryUser,
  buildDeliveryOrderRow,
  isDeliveryOrderActive,
  findCustomer,
  createReceiptDocument,
  auditLog,
  writeMobileLog,
  buildReturnItemsFromRequest,
  createReturnOrderDocument,
  makeId,
  buildCashCode
});

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

async function startServer() {
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

  return app.listen(PORT, () => {
    console.log(`Server V45 đang chạy tại http://localhost:${PORT}`);
  });
}

module.exports = { app, startServer };
