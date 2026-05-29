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
const { parseExcelBuffer } = require('./utils/excelParser');
const { previewImport, commitImport } = require('./services/importService');
const { renderPrintHtml } = require('./services/printService');
const { buildImportTemplate, getTemplateTypes, TEMPLATE_DEFINITIONS } = require('./services/excelTemplateService');
const connectDB = require('./src/config/db');
const mongoose = require('mongoose');
const Product = require('./src/models/Product');

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

const looseSchemaOptions = { strict: false, versionKey: false };
function getLooseModel(modelName, collectionName) {
  return mongoose.models[modelName] || mongoose.model(modelName, new mongoose.Schema({}, looseSchemaOptions), collectionName);
}

const MongoStore = {
  products: Product,
  customers: getLooseModel('MongoCustomerStore', 'customers'),
  staffs: getLooseModel('MongoUserStore', 'users'),
  warehouses: getLooseModel('MongoWarehouseStore', 'warehouses'),
  stock: getLooseModel('MongoInventoryStore', 'inventories'),
  importOrders: getLooseModel('MongoImportStore', 'imports'),
  salesOrders: getLooseModel('MongoOrderStore', 'orders'),
  masterOrders: getLooseModel('MongoMasterOrderStore', 'master_orders'),
  payments: getLooseModel('MongoJournalStore', 'journals'),
  receipts: getLooseModel('MongoReceiptStore', 'receipts'),
  returnOrders: getLooseModel('MongoReturnOrderStore', 'returnOrders'),
  cashbooks: getLooseModel('MongoCashbookStore', 'cashbooks'),
  bankbooks: getLooseModel('MongoBankbookStore', 'bankbooks'),
  cashbook: getLooseModel('MongoCashbookLegacyStore', 'cashbooks'),
  importLogs: getLooseModel('MongoImportLogStore', 'import_logs'),
  mobileLogs: getLooseModel('MongoMobileLogStore', 'mobile_logs'),
  auditLogs: getLooseModel('MongoAuditLogStore', 'audit_logs'),
  settings: getLooseModel('MongoSettingStore', 'settings'),
  promotions: getLooseModel('MongoPromotionStore', 'promotions'),
  importTemplates: getLooseModel('MongoImportTemplateStore', 'import_templates')
};

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
const DATA_FILE = path.join(__dirname, 'data', 'kho-data.json');

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
app.use(express.static(path.join(__dirname, 'public')));

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
    importTemplates: []
  };
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
  return normalizeData(ensureDefaultStaffAccounts(data));
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
  const normalized = normalizeData(ensureDefaultStaffAccounts(cloneData(data)));
  for (const key of Object.keys(createEmptyData())) {
    await persistCollectionToMongo(key, normalized[key]);
  }

  const settingsPayload = {
    key: 'app_state',
    updatedAt: new Date().toISOString(),
    counters: Object.fromEntries(Object.keys(createEmptyData()).map((key) => [key, (normalized[key] || []).length]))
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

function readData() {
  if (!APP_DATA_CACHE) {
    APP_DATA_CACHE = readJsonDataFile();
    console.warn('⚠️ APP_DATA_CACHE chưa khởi tạo từ Mongo, tạm đọc data/kho-data.json');
  }
  return cloneData(APP_DATA_CACHE);
}

function writeData(data) {
  const normalized = normalizeData(ensureDefaultStaffAccounts(cloneData(data)));
  APP_DATA_CACHE = normalized;

  // Giữ file JSON chỉ như backup cục bộ, không còn là nguồn dữ liệu chính.
  try {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  } catch (error) {
    console.warn('⚠️ Không ghi được file backup JSON:', error.message);
  }

  queueMongoPersist(normalized);
}

async function loadMongoDataToCache() {
  const data = createEmptyData();
  for (const key of Object.keys(createEmptyData())) {
    const Model = MongoStore[key];
    const rows = await Model.find({}).lean();
    data[key] = rows.map(stripMongoFields);
  }
  APP_DATA_CACHE = normalizeData(ensureDefaultStaffAccounts(data));
  console.log('✅ Đã nạp dữ liệu từ Mongo vào cache:', Object.fromEntries(Object.keys(APP_DATA_CACHE).map((key) => [key, APP_DATA_CACHE[key].length])));
  return APP_DATA_CACHE;
}

async function migrateJsonToMongoIfEmpty() {
  const jsonData = readJsonDataFile();
  for (const key of Object.keys(createEmptyData())) {
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
    const data = readData();
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
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    phone: String(body.phone || '').trim(),
    address: String(body.address || '').trim(),
    area: String(body.area || '').trim(),
    staffName: String(body.staffName || '').trim(),
    isActive: body.isActive !== false
  };
}

function validateCustomer(payload) {
  if (!payload.code) return 'Thiếu mã khách hàng';
  if (!payload.name) return 'Thiếu tên khách hàng';
  return '';
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

app.get('/api/data', (req, res) => {
  try {
    res.json({ ok: true, data: readData() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được dữ liệu', error: err.message });
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
    const data = readData();
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

// Customers
app.get('/api/customers', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    const activeOnly = String(req.query.activeOnly || '') === '1';
    let customers = data.customers || [];

    if (activeOnly) customers = customers.filter((c) => c.isActive !== false);
    if (q) {
      customers = customers.filter((c) =>
        normalizeText(c.code).includes(q) ||
        normalizeText(c.name).includes(q) ||
        normalizeText(c.phone).includes(q) ||
        normalizeText(c.address).includes(q) ||
        normalizeText(c.area).includes(q) ||
        normalizeText(c.staffName).includes(q)
      );
    }

    res.json({ ok: true, customers });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách khách hàng', error: err.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const data = readData();
    const payload = pickCustomerPayload(req.body || {});
    const error = validateCustomer(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = data.customers.some((c) => normalizeText(c.code) === normalizeText(payload.code));
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã khách hàng đã tồn tại' });

    const now = new Date().toISOString();
    const customer = { id: makeId('C'), ...payload, createdAt: now, updatedAt: now };
    data.customers.push(customer);
    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã tạo khách hàng', customer });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được khách hàng', error: err.message });
  }
});

app.put('/api/customers/:id', (req, res) => {
  try {
    const data = readData();
    const customer = data.customers.find((c) => c.id === req.params.id || c.code === req.params.id);
    if (!customer) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng' });

    const payload = pickCustomerPayload(req.body || {});
    const error = validateCustomer(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = data.customers.some((c) => c.id !== customer.id && normalizeText(c.code) === normalizeText(payload.code));
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã khách hàng đã tồn tại' });

    Object.assign(customer, payload, { updatedAt: new Date().toISOString() });
    writeData(data);
    res.json({ ok: true, message: 'Đã cập nhật khách hàng', customer });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được khách hàng', error: err.message });
  }
});

app.delete('/api/customers/:id', (req, res) => {
  try {
    const data = readData();
    const before = data.customers.length;
    data.customers = data.customers.filter((c) => c.id !== req.params.id && c.code !== req.params.id);
    if (data.customers.length === before) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    writeData(data);
    res.json({ ok: true, message: 'Đã xóa khách hàng' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được khách hàng', error: err.message });
  }
});

app.post('/api/customers/bulk-delete', (req, res) => {
  try {
    const data = readData();
    const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []);
    if (!ids.size) return res.status(400).json({ ok: false, message: 'Chưa chọn khách hàng để xóa' });
    const before = data.customers.length;
    data.customers = data.customers.filter((c) => !ids.has(String(c.id)) && !ids.has(String(c.code)));
    const deleted = before - data.customers.length;
    writeData(data);
    res.json({ ok: true, message: `Đã xóa ${deleted} khách hàng`, deleted });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa nhiều khách hàng', error: err.message });
  }
});


// Stock / import
app.get('/api/stock', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let stock = data.stock || [];

    if (q) {
      stock = stock.filter((row) =>
        normalizeText(row.productCode).includes(q) ||
        normalizeText(row.productName).includes(q) ||
        normalizeText(row.unit).includes(q)
      );
    }

    stock = stock.sort((a, b) => normalizeText(a.productCode).localeCompare(normalizeText(b.productCode)));
    res.json({ ok: true, stock });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được tồn kho', error: err.message });
  }
});

app.get('/api/import-orders', (req, res) => {
  try {
    const data = readData();
    const orders = [...data.importOrders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, importOrders: orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử nhập kho', error: err.message });
  }
});

app.post('/api/import-orders', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const supplier = String(body.supplier || '').trim();
    const deliveryDateInput = String(body.deliveryDate || body.date || new Date().toISOString().slice(0, 10)).trim();
    const date = deliveryDateInput.slice(0, 10);
    const note = String(body.note || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Phiếu nhập chưa có dòng hàng' });

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productCode || rawItem.productId);
      if (!product) return res.status(400).json({ ok: false, message: `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.productId || ''}` });
      if (product.isActive === false) return res.status(400).json({ ok: false, message: `Sản phẩm đang ngừng bán: ${product.code}` });

      const quantity = toNumber(rawItem.quantity);
      const costPrice = toNumber(rawItem.costPrice || product.costPrice);
      if (quantity <= 0) return res.status(400).json({ ok: false, message: `Số lượng nhập phải lớn hơn 0: ${product.code}` });
      if (costPrice < 0) return res.status(400).json({ ok: false, message: `Giá nhập không được âm: ${product.code}` });

      items.push({ productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, costPrice, amount: quantity * costPrice });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const importOrder = {
      id: makeId('IM'),
      code: buildImportCode(data),
      date,
      supplier,
      note,
      items,
      totalQuantity,
      totalAmount,
      createdAt: new Date().toISOString()
    };

    data.importOrders.push(importOrder);
    items.forEach((item) => upsertStock(data, item));
    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã tạo phiếu nhập và cộng tồn kho', importOrder, stock: data.stock });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được phiếu nhập', error: err.message });
  }
});


app.put('/api/import-orders/:id', (req, res) => {
  try {
    const data = readData();
    const orderId = String(req.params.id || '').trim();
    const index = (data.importOrders || []).findIndex((order) => String(order.id) === orderId || String(order.code) === orderId);
    if (index < 0) return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu nhập cần sửa' });

    const oldOrder = data.importOrders[index];
    const body = req.body || {};
    const supplier = String(body.supplier || '').trim();
    const date = String(body.date || oldOrder.date || new Date().toISOString().slice(0, 10)).trim();
    const note = String(body.note || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Phiếu nhập chưa có dòng hàng' });

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productCode || rawItem.productId);
      if (!product) return res.status(400).json({ ok: false, message: `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.productId || ''}` });
      if (product.isActive === false) return res.status(400).json({ ok: false, message: `Sản phẩm đang ngừng bán: ${product.code}` });

      const quantity = toNumber(rawItem.quantity);
      const costPrice = toNumber(rawItem.costPrice || product.costPrice);
      if (quantity <= 0) return res.status(400).json({ ok: false, message: `Số lượng nhập phải lớn hơn 0: ${product.code}` });
      if (costPrice < 0) return res.status(400).json({ ok: false, message: `Giá nhập không được âm: ${product.code}` });

      items.push({ productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, costPrice, amount: quantity * costPrice });
    }

    for (const item of oldOrder.items || []) {
      const stockRow = data.stock.find((row) => normalizeText(row.productId) === normalizeText(item.productId) || normalizeText(row.productCode) === normalizeText(item.productCode));
      if (stockRow && toNumber(stockRow.quantity) - toNumber(item.quantity) < 0) {
        return res.status(400).json({ ok: false, message: `Không thể sửa phiếu vì tồn kho ${item.productCode} đã được xuất/bán, nếu trừ phiếu cũ sẽ âm kho` });
      }
    }

    (oldOrder.items || []).forEach((item) => upsertStock(data, { ...item, quantity: -toNumber(item.quantity) }));
    items.forEach((item) => upsertStock(data, item));

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const updatedOrder = {
      ...oldOrder,
      date,
      supplier,
      note,
      items,
      totalQuantity,
      totalAmount,
      updatedAt: new Date().toISOString(),
      editLogs: [
        ...(oldOrder.editLogs || []),
        { at: new Date().toISOString(), action: 'update_import_order', oldTotalQuantity: oldOrder.totalQuantity, newTotalQuantity: totalQuantity, oldTotalAmount: oldOrder.totalAmount, newTotalAmount: totalAmount }
      ]
    };

    data.importOrders[index] = updatedOrder;
    writeData(data);
    res.json({ ok: true, message: 'Đã sửa phiếu nhập và cập nhật lại tồn kho', importOrder: updatedOrder, stock: data.stock });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không sửa được phiếu nhập', error: err.message });
  }
});

// Sales / debts
app.get('/api/sales-orders', (req, res) => {
  try {
    const data = readData();
    const repaired = repairOrphanMergedSalesOrders(data);
    if (repaired) writeData(data);
    const orders = [...data.salesOrders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, salesOrders: orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử bán hàng', error: err.message });
  }
});

app.put('/api/sales-orders/:id', (req, res) => {
  try {
    if (!canAccountingEdit(req)) {
      return res.status(403).json({ ok: false, message: 'Chỉ kế toán hoặc admin được sửa đơn trong lịch sử bán hàng' });
    }
    const data = readData();
    const order = data.salesOrders.find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });

    const beforeMasterOrderId = order.masterOrderId || order.masterOrderCode || '';
    const salesOrder = updateSalesOrderWithRepost(data, order, req.body || {});
    syncMasterOrderAfterChildChange(data, beforeMasterOrderId);
    writeData(data);
    res.json({ ok: true, message: `Đã sửa đơn ${salesOrder.code} và cập nhật lại tồn kho/công nợ/đơn tổng`, salesOrder, stock: data.stock, debtSummary: buildCustomerDebtSummary(data), cashSummary: getCashSummary(data) });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được đơn bán' });
  }
});

app.post('/api/sales-orders/:id/cancel', (req, res) => {
  try {
    if (!canAccountingEdit(req)) {
      return res.status(403).json({ ok: false, message: 'Chỉ kế toán hoặc admin được hủy đơn bán' });
    }
    const data = readData();
    const order = data.salesOrders.find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });
    if (['delivered', 'returned', 'cancelled', 'void'].includes(String(order.status || '').toLowerCase())) {
      return res.status(400).json({ ok: false, message: 'Đơn đã giao/trả/hủy không được xóa. Hãy dùng nghiệp vụ trả hàng hoặc void chứng từ.' });
    }
    if (order.masterOrderId || order.masterOrderCode || (order.mergeStatus || '') === 'merged') {
      return res.status(400).json({ ok: false, message: 'Đơn đã gộp đơn tổng. Hãy hủy gộp đơn tổng trước rồi mới hủy đơn bán.' });
    }

    const before = { ...order };
    (order.items || []).forEach((item) => restoreStock(data, item));
    order.status = 'cancelled';
    order.orderStatus = 'cancelled';
    order.deliveryStatus = 'cancelled';
    order.cancelDate = new Date().toISOString().slice(0, 10);
    order.cancelledAt = new Date().toISOString();
    order.cancelReason = String(req.body?.reason || 'Hủy đơn bán theo nghiệp vụ').trim();
    order.cancelBy = String(req.body?.cancelBy || req.user?.name || req.user?.username || 'system').trim();
    order.debtAmount = 0;
    order.balanceAmount = 0;
    order.paymentStatus = 'cancelled';
    order.updatedAt = new Date().toISOString();
    auditLog(data, 'cancel_sales_order', 'salesOrder', order, before, order, 'Hủy đơn bán: đảo tồn kho, không xóa dữ liệu gốc', order.cancelBy);
    writeData(data);
    res.json({ ok: true, message: `Đã hủy đơn ${order.code || order.id}. Dữ liệu được giữ lại, tồn kho/công nợ được đảo theo trạng thái cancelled.`, salesOrder: order, stock: data.stock, debts: buildCustomerDebtSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không hủy được đơn bán', error: err.message });
  }
});


function getMasterOrderChildren(data, masterOrder) {
  const ids = new Set((masterOrder.childOrderIds || []).map(String));
  const masterId = String(masterOrder.id || '').trim();
  const masterCode = String(masterOrder.code || '').trim();

  return data.salesOrders.filter((order) => {
    const orderId = String(order.id || '').trim();
    const orderCode = String(order.code || '').trim();
    const orderMasterId = String(order.masterOrderId || '').trim();
    const orderMasterCode = String(order.masterOrderCode || '').trim();

    return ids.has(orderId) ||
      ids.has(orderCode) ||
      (masterId && orderMasterId === masterId) ||
      (masterCode && orderMasterCode === masterCode);
  });
}


function releaseChildOrderFromMaster(order) {
  if (!order) return order;
  order.masterOrderId = '';
  order.masterOrderCode = '';
  order.mergeStatus = 'unmerged';
  order.routeName = '';
  order.deliveryStaffId = '';
  order.deliveryStaffCode = '';
  order.deliveryStaffName = '';
  order.deliveryDate = '';
  order.deliveryStatus = '';
  order.deliveryRoute = '';
  order.updatedAt = new Date().toISOString();
  return order;
}

function repairOrphanMergedSalesOrders(data) {
  const activeMasterIds = new Set((data.masterOrders || [])
    .filter((master) => !master.hidden && !['cancelled', 'void', 'deleted'].includes(String(master.status || '').toLowerCase()))
    .map((master) => String(master.id || '').trim())
    .filter(Boolean));
  const activeMasterCodes = new Set((data.masterOrders || [])
    .filter((master) => !master.hidden && !['cancelled', 'void', 'deleted'].includes(String(master.status || '').toLowerCase()))
    .map((master) => String(master.code || '').trim())
    .filter(Boolean));

  let changed = false;
  (data.salesOrders || []).forEach((order) => {
    const masterId = String(order.masterOrderId || '').trim();
    const masterCode = String(order.masterOrderCode || '').trim();
    const isMerged = String(order.mergeStatus || 'unmerged') === 'merged' || masterId || masterCode;
    const hasActiveMaster = (masterId && activeMasterIds.has(masterId)) || (masterCode && activeMasterCodes.has(masterCode));
    if (isMerged && !hasActiveMaster) {
      releaseChildOrderFromMaster(order);
      changed = true;
    }
  });
  return changed;
}

function summarizeMasterOrder(children) {
  return {
    totalOrders: children.length,
    totalQuantity: children.reduce((sum, order) => sum + toNumber(order.totalQuantity), 0),
    totalAmount: children.reduce((sum, order) => sum + toNumber(order.totalAmount), 0),
    totalPaid: children.reduce((sum, order) => sum + toNumber(order.paidAmount), 0),
    totalDebt: children.reduce((sum, order) => sum + toNumber(order.debtAmount), 0)
  };
}

function getOrderSalesStaffCode(order) {
  return String(order.salesStaffCode || order.staffCode || order.salesStaffId || '').trim();
}

function getOrderSalesStaffName(order) {
  return String(order.salesStaffName || order.staffName || '').trim();
}

function getOrderSalesStaffKey(order) {
  const code = getOrderSalesStaffCode(order);
  const name = getOrderSalesStaffName(order);
  return normalizeText(code || name || 'NO_SALES_STAFF') || 'no_sales_staff';
}

function buildMasterOrder(data, children, common) {
  const summary = summarizeMasterOrder(children);
  const first = children[0] || {};
  const salesStaffCode = common.salesStaffCode !== undefined ? common.salesStaffCode : getOrderSalesStaffCode(first);
  const salesStaffName = common.salesStaffName !== undefined ? common.salesStaffName : getOrderSalesStaffName(first);
  const deliveryStaff = findStaff(data, common.deliveryStaffId || common.deliveryStaffCode || common.deliveryStaffName) || {};
  const deliveryStaffId = String(common.deliveryStaffId || deliveryStaff.id || '').trim();
  const deliveryStaffCode = String(common.deliveryStaffCode || deliveryStaff.code || '').trim();
  const deliveryStaffName = String(common.deliveryStaffName || deliveryStaff.name || '').trim();
  const deliveryDate = String(common.deliveryDate || common.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const masterOrder = {
    id: makeId('MO'),
    code: buildMasterOrderCode(data),
    date: deliveryDate,
    deliveryDate,
    routeName: common.routeName,
    deliveryStaffId,
    deliveryStaffCode,
    deliveryStaffName,
    salesStaffId: String(first.salesStaffId || '').trim(),
    salesStaffCode,
    salesStaffName,
    note: common.note,
    childOrderIds: children.map((order) => order.id),
    totalOrders: summary.totalOrders,
    totalQuantity: summary.totalQuantity,
    totalAmount: summary.totalAmount,
    totalPaid: summary.totalPaid,
    totalDebt: summary.totalDebt,
    status: 'assigned',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  children.forEach((order) => {
    // Khi gộp đơn tổng, đơn con được phân xuống app giao hàng tự động theo người giao + ngày giao.
    order.masterOrderId = masterOrder.id;
    order.masterOrderCode = masterOrder.code;
    order.mergeStatus = 'merged';
    order.deliveryStatus = order.deliveryStatus || 'pending';
    order.deliveryDate = deliveryDate;
    order.deliveryStaffId = deliveryStaffId;
    order.deliveryStaffCode = deliveryStaffCode;
    order.deliveryStaffName = deliveryStaffName;
    order.routeName = common.routeName;
    order.deliveryRoute = common.routeName;
    order.updatedAt = new Date().toISOString();
  });

  data.masterOrders.push(masterOrder);
  return masterOrder;
}

app.get('/api/master-orders/unmerged-child-orders', (req, res) => {
  try {
    const data = readData();
    const repaired = repairOrphanMergedSalesOrders(data);
    if (repaired) writeData(data);
    const q = normalizeText(req.query.q);
    const source = String(req.query.source || '').trim().toUpperCase();
    const date = String(req.query.date || '').trim();
    const salesStaff = normalizeText(req.query.salesStaff || req.query.staff || '');

    let orders = data.salesOrders.filter((order) =>
      order.isChildOrder !== false &&
      (order.mergeStatus || 'unmerged') !== 'merged' &&
      !order.masterOrderId &&
      !['cancelled', 'delivery_failed_cancelled'].includes(order.status || '')
    );

    if (source) orders = orders.filter((order) => String(order.orderSource || 'NVBH').toUpperCase() === source);
    if (date) orders = orders.filter((order) => String(order.date || '').slice(0, 10) === date);
    if (salesStaff) {
      orders = orders.filter((order) =>
        normalizeText(order.salesStaffCode || order.staffCode).includes(salesStaff) ||
        normalizeText(order.salesStaffName || order.staffName).includes(salesStaff)
      );
    }
    if (q) {
      orders = orders.filter((order) =>
        normalizeText(order.code).includes(q) ||
        normalizeText(order.customerCode).includes(q) ||
        normalizeText(order.customerName).includes(q) ||
        normalizeText(order.customerPhone).includes(q) ||
        normalizeText(order.customerAddress).includes(q) ||
        normalizeText(order.orderSource).includes(q) ||
        normalizeText(order.salesStaffCode || order.staffCode).includes(q) ||
        normalizeText(order.salesStaffName || order.staffName).includes(q)
      );
    }

    orders = orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách đơn con chưa gộp', error: err.message });
  }
});

app.get('/api/master-orders', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    // Danh sách chính chỉ hiển thị đơn tổng đang hoạt động.
    // Đơn tổng đã hủy được gỡ khỏi luồng chính để đơn con có thể quay lại trạng thái chưa gộp.
    let masterOrders = [...data.masterOrders].filter((order) => !order.hidden && order.status !== 'cancelled');

    if (dateFrom) masterOrders = masterOrders.filter((order) => String(order.date || '').slice(0, 10) >= dateFrom);
    if (dateTo) masterOrders = masterOrders.filter((order) => String(order.date || '').slice(0, 10) <= dateTo);

    if (q) {
      masterOrders = masterOrders.filter((order) =>
        normalizeText(order.code).includes(q) ||
        normalizeText(order.routeName).includes(q) ||
        normalizeText(order.deliveryStaffCode).includes(q) ||
        normalizeText(order.deliveryStaffName).includes(q) ||
        normalizeText(order.salesStaffCode).includes(q) ||
        normalizeText(order.salesStaffName).includes(q) ||
        normalizeText(order.note).includes(q)
      );
    }

    masterOrders = masterOrders
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((order) => {
        const children = getMasterOrderChildren(data, order);
        return { ...order, children, ...summarizeMasterOrder(children) };
      });

    res.json({ ok: true, masterOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách đơn tổng', error: err.message });
  }
});

app.get('/api/master-orders/:id', (req, res) => {
  try {
    const data = readData();
    const masterOrder = data.masterOrders.find((order) => order.id === req.params.id || order.code === req.params.id);
    if (!masterOrder) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn tổng' });
    const children = getMasterOrderChildren(data, masterOrder);
    res.json({ ok: true, masterOrder: { ...masterOrder, children, ...summarizeMasterOrder(children) } });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được đơn tổng', error: err.message });
  }
});

app.post('/api/master-orders', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const childOrderIds = Array.isArray(body.childOrderIds) ? body.childOrderIds.map(String).filter(Boolean) : [];
    const routeName = String(body.routeName || '').trim();
    const deliveryStaffCode = String(body.deliveryStaffCode || '').trim();
    const deliveryStaffName = String(body.deliveryStaffName || '').trim();
    const deliveryDateInput = String(body.deliveryDate || body.date || new Date().toISOString().slice(0, 10)).trim();
    const date = deliveryDateInput.slice(0, 10);
    const note = String(body.note || '').trim();
    const groupBySalesStaff = body.groupBySalesStaff === true || body.groupBySalesStaff === 'true' || body.groupBySalesStaff === 'on' || body.groupBySalesStaff === '1';

    if (!childOrderIds.length) return res.status(400).json({ ok: false, message: 'Chưa chọn đơn con để gộp' });
    if (!routeName) return res.status(400).json({ ok: false, message: 'Thiếu tên tuyến / khu vực giao hàng' });
    if (!deliveryStaffCode && !deliveryStaffName) return res.status(400).json({ ok: false, message: 'Thiếu nhân viên giao hàng' });

    const idSet = new Set(childOrderIds);
    const children = data.salesOrders.filter((order) => idSet.has(String(order.id)) || idSet.has(String(order.code)));
    if (children.length !== childOrderIds.length) return res.status(400).json({ ok: false, message: 'Có đơn con không tồn tại' });

    const invalid = children.find((order) => order.isChildOrder === false || order.masterOrderId || (order.mergeStatus || 'unmerged') === 'merged');
    if (invalid) return res.status(400).json({ ok: false, message: `Đơn ${invalid.code || invalid.id} đã gộp hoặc không phải đơn con` });

    const common = { date, deliveryDate: date, routeName, deliveryStaffCode, deliveryStaffName, note };
    const masterOrders = [];

    if (groupBySalesStaff) {
      const grouped = new Map();
      children.forEach((order) => {
        const key = getOrderSalesStaffKey(order);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(order);
      });

      grouped.forEach((groupChildren) => {
        const first = groupChildren[0] || {};
        const salesStaffCode = getOrderSalesStaffCode(first);
        const salesStaffName = getOrderSalesStaffName(first) || 'Chưa có NV bán hàng';
        const groupNote = [note, `Gộp theo NV bán hàng: ${salesStaffCode ? salesStaffCode + ' - ' : ''}${salesStaffName}`].filter(Boolean).join(' | ');
        masterOrders.push(buildMasterOrder(data, groupChildren, { ...common, note: groupNote, salesStaffCode, salesStaffName }));
      });
    } else {
      const staffKeys = new Set(children.map(getOrderSalesStaffKey));
      if (staffKeys.size > 1) {
        return res.status(400).json({ ok: false, message: 'Các đơn con thuộc nhiều nhân viên bán hàng. Hãy bật “Gộp riêng theo từng NV bán hàng” hoặc chỉ chọn đơn của cùng một NV.' });
      }
      masterOrders.push(buildMasterOrder(data, children, common));
    }

    writeData(data);
    const totalChildren = masterOrders.reduce((sum, order) => sum + toNumber(order.totalOrders), 0);
    const message = masterOrders.length > 1
      ? `Đã gộp ${totalChildren} đơn con thành ${masterOrders.length} đơn tổng theo từng nhân viên bán hàng`
      : `Đã gộp ${totalChildren} đơn con thành đơn tổng ${masterOrders[0].code}`;
    res.status(201).json({ ok: true, message, masterOrder: masterOrders[0], masterOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được đơn tổng', error: err.message });
  }
});

app.post('/api/master-orders/:id/cancel', (req, res) => {
  try {
    const data = readData();
    const masterOrder = data.masterOrders.find((order) => order.id === req.params.id || order.code === req.params.id);
    if (!masterOrder) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn tổng' });
    if (masterOrder.status === 'completed') return res.status(400).json({ ok: false, message: 'Không thể hủy đơn tổng đã hoàn thành' });

    const children = getMasterOrderChildren(data, masterOrder);
    children.forEach((order) => releaseChildOrderFromMaster(order));

    // Không giữ đơn tổng đã hủy trên danh sách chính.
    // Đơn con là chứng từ gốc nên chỉ gỡ liên kết masterOrderId/masterOrderCode, không xóa đơn con.
    data.masterOrders = data.masterOrders.filter((order) => order.id !== masterOrder.id && order.code !== masterOrder.code);

    writeData(data);
    res.json({
      ok: true,
      message: `Đã hủy và xóa đơn tổng ${masterOrder.code} khỏi danh sách. Đơn con đã được trả về trạng thái chưa gộp.`,
      removedMasterOrder: { ...masterOrder, status: 'cancelled', hidden: true, updatedAt: new Date().toISOString() },
      releasedChildren: children.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không hủy được đơn tổng', error: err.message });
  }
});

app.post('/api/sales-orders', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const customer = findCustomer(data, body.customerId || body.customerCode);
    const deliveryDateInput = String(body.deliveryDate || body.date || new Date().toISOString().slice(0, 10)).trim();
    const date = deliveryDateInput.slice(0, 10);
    const note = String(body.note || '').trim();
    const paidAmount = toNumber(body.paidAmount);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const salesStaff = findStaff(data, body.salesStaffId || body.salesStaffCode || body.salesStaffName || body.staffCode || body.staffName);

    if (!customer) return res.status(400).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    if (customer.isActive === false) return res.status(400).json({ ok: false, message: `Khách hàng đang ngừng giao dịch: ${customer.code}` });
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Đơn bán chưa có dòng hàng' });

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productCode || rawItem.productId);
      if (!product) return res.status(400).json({ ok: false, message: `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.productId || ''}` });
      if (product.isActive === false) return res.status(400).json({ ok: false, message: `Sản phẩm đang ngừng bán: ${product.code}` });

      const quantity = toNumber(rawItem.quantity);
      const salePrice = toNumber(rawItem.salePrice || product.salePrice);
      if (quantity <= 0) return res.status(400).json({ ok: false, message: `Số lượng bán phải lớn hơn 0: ${product.code}` });
      if (salePrice < 0) return res.status(400).json({ ok: false, message: `Giá bán không được âm: ${product.code}` });

      const stockRow = findStockRow(data, product);
      const availableQty = stockRow ? toNumber(stockRow.quantity) : 0;
      if (availableQty < quantity) {
        return res.status(400).json({ ok: false, message: `Không đủ tồn kho: ${product.code} - ${product.name}. Tồn hiện tại ${availableQty}, cần bán ${quantity}` });
      }

      items.push({ productId: product.id, productCode: product.code, productName: product.name, ...buildProductLineMeta(product), quantity, salePrice, amount: quantity * salePrice });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    if (paidAmount < 0) return res.status(400).json({ ok: false, message: 'Tiền đã thu không được âm' });
    if (paidAmount > totalAmount) return res.status(400).json({ ok: false, message: 'Tiền đã thu không được lớn hơn tổng đơn' });

    const debtAmount = totalAmount - paidAmount;
    const salesOrder = {
      id: makeId('SO'),
      code: buildSalesCode(data),
      date,
      documentDate: date,
      dueDate: String(body.dueDate || addDaysToDate(date, getCustomerCreditDays(data, customer.id))).slice(0, 10),
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      salesStaffId: salesStaff ? salesStaff.id : '',
      salesStaffCode: salesStaff ? salesStaff.code : String(body.salesStaffCode || body.staffCode || '').trim(),
      salesStaffName: salesStaff ? salesStaff.name : String(body.salesStaffName || body.staffName || '').trim(),
      staffName: salesStaff ? salesStaff.name : String(body.salesStaffName || body.staffName || '').trim(),
      note,
      orderSource: 'NVBH',
      orderSourceName: 'Từ NVBH',
      isChildOrder: true,
      masterOrderId: '',
      mergeStatus: 'unmerged',
      items,
      totalQuantity,
      totalAmount,
      paidAmount,
      debtAmount,
      balanceAmount: debtAmount,
      paymentStatus: debtAmount <= 0 ? 'paid' : 'open',
      status: 'posted',
      createdAt: new Date().toISOString()
    };

    data.salesOrders.push(salesOrder);
    items.forEach((item) => reduceStock(data, item));

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
      note: `Phát sinh từ đơn bán ${salesOrder.code}`,
      createdAt: new Date().toISOString()
    });

    if (paidAmount > 0) {
      data.cashbooks.push({
        id: makeId('CB'),
        code: buildCashCode(data, 'in'),
        date,
        type: 'in',
        source: 'sales_payment',
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        staffName: salesOrder.salesStaffName || '',
        amount: paidAmount,
        note: `Thu tiền từ đơn bán ${salesOrder.code}`,
        createdAt: new Date().toISOString()
      });
    }

    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã tạo đơn bán, trừ tồn kho và ghi công nợ/quỹ tiền', salesOrder, stock: data.stock, debtSummary: buildCustomerDebtSummary(data), cashSummary: getCashSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được đơn bán', error: err.message });
  }
});

app.get('/api/payments', (req, res) => {
  try {
    const data = readData();
    const payments = [...data.payments].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, payments });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được phát sinh công nợ', error: err.message });
  }
});


app.get('/api/delivery-today', (req, res) => {
  try {
    const data = readData();
    const targetDate = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const q = normalizeText(req.query.q);
    const salesman = normalizeText(req.query.salesman);
    const delivery = normalizeText(req.query.delivery || req.query.deliveryStaffId || req.query.deliveryStaff);
    const route = normalizeText(req.query.route);
    const status = normalizeText(req.query.status);
    const includeCompleted = String(req.query.includeCompleted || '') === '1';

    const ledger = buildDebtLedgerRows(data);
    const debtByOrder = new Map(ledger.map((row) => [String(row.orderId), row]));
    let orders = (data.salesOrders || [])
      .filter((order) => isOrderApprovedForDelivery(order))
      .map((order) => buildDeliveryOrderRow(data, order, debtByOrder.get(String(order.id)), targetDate))
      .filter((row) => row.deliveryDate === targetDate)
      .filter((row) => includeCompleted || isDeliveryOrderActive(row.deliveryStatus));

    if (q) orders = orders.filter((row) => [row.orderCode, row.customerCode, row.customerName, row.customerPhone, row.customerAddress, row.routeName, row.salesmanCode, row.salesmanName, row.deliveryStaffCode, row.deliveryStaffName].some((value) => normalizeText(value).includes(q)));
    if (salesman) orders = orders.filter((row) => [row.salesmanCode, row.salesmanName, row.salesmanId].some((value) => normalizeText(value).includes(salesman)));
    if (delivery) orders = orders.filter((row) => [row.deliveryStaffCode, row.deliveryStaffName, row.deliveryStaffId].some((value) => normalizeText(value).includes(delivery)));
    if (route) orders = orders.filter((row) => normalizeText(row.routeName).includes(route));
    if (status) {
      orders = orders.filter((row) => {
        if (status === 'unpaid') return toNumber(row.debt) > 0;
        if (status === 'late') return row.isLate;
        return normalizeText(row.deliveryStatus) === status || normalizeText(row.visualStatus) === status;
      });
    }

    orders.sort((a, b) => String(a.routeName).localeCompare(String(b.routeName)) || String(a.deliveryStaffName).localeCompare(String(b.deliveryStaffName)) || String(a.createdAt).localeCompare(String(b.createdAt)));

    const kpi = {
      totalOrders: orders.length,
      delivering: orders.filter((row) => row.deliveryStatus === 'delivering').length,
      delivered: orders.filter((row) => row.deliveryStatus === 'delivered').length,
      unpaid: orders.filter((row) => toNumber(row.debt) > 0).length,
      late: orders.filter((row) => row.isLate).length,
      totalDebt: orders.reduce((sum, row) => sum + toNumber(row.debt), 0)
    };

    const routeMap = new Map();
    orders.forEach((row) => {
      const key = row.routeName || 'Chưa có tuyến';
      if (!routeMap.has(key)) routeMap.set(key, { routeName: key, orderCount: 0, deliveryStaffCode: row.deliveryStaffCode, deliveryStaffName: row.deliveryStaffName, totalDebt: 0 });
      const item = routeMap.get(key);
      item.orderCount += 1;
      item.totalDebt += toNumber(row.debt);
      if (!item.deliveryStaffName && row.deliveryStaffName) item.deliveryStaffName = row.deliveryStaffName;
      if (!item.deliveryStaffCode && row.deliveryStaffCode) item.deliveryStaffCode = row.deliveryStaffCode;
    });

    res.json({
      ok: true,
      date: targetDate,
      formula: 'deliveryDate = ngày chọn + deliveryStaff = bộ lọc/người giao + deliveryStatus chưa hoàn tất/hủy',
      kpi,
      routes: Array.from(routeMap.values()),
      orders
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được đơn đi giao hôm nay', error: err.message });
  }
});

app.get('/api/debts', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    const salesman = normalizeText(req.query.salesman || req.query.salesmanId || req.query.salesmanName);
    const delivery = normalizeText(req.query.delivery || req.query.deliveryStaffId || req.query.deliveryStaffName);
    const status = normalizeText(req.query.status);
    const dateFrom = String(req.query.dateFrom || '').slice(0, 10);
    const dateTo = String(req.query.dateTo || '').slice(0, 10);
    const dueFrom = String(req.query.dueFrom || '').slice(0, 10);
    const dueTo = String(req.query.dueTo || '').slice(0, 10);
    let ledger = buildDebtLedgerRows(data);

    if (q) {
      ledger = ledger.filter((row) => [row.customerCode, row.customerName, row.phone, row.address, row.orderCode, row.salesmanCode, row.salesmanName, row.deliveryStaffCode, row.deliveryStaffName, row.masterOrderCode]
        .some((value) => normalizeText(value).includes(q)));
    }
    if (salesman) ledger = ledger.filter((row) => [row.salesmanId, row.salesmanCode, row.salesmanName].some((value) => normalizeText(value).includes(salesman)));
    if (delivery) ledger = ledger.filter((row) => [row.deliveryStaffId, row.deliveryStaffCode, row.deliveryStaffName].some((value) => normalizeText(value).includes(delivery)));
    if (status) ledger = ledger.filter((row) => normalizeText(row.status) === status || (status === 'debt' && row.debt > 0));
    if (dateFrom) ledger = ledger.filter((row) => String(row.documentDate || '') >= dateFrom);
    if (dateTo) ledger = ledger.filter((row) => String(row.documentDate || '') <= dateTo);
    if (dueFrom) ledger = ledger.filter((row) => String(row.dueDate || '') >= dueFrom);
    if (dueTo) ledger = ledger.filter((row) => String(row.dueDate || '') <= dueTo);

    const customerSummary = buildDebtSummaryByCustomerFromRows(ledger);
    const summary = {
      totalDebit: ledger.reduce((sum, row) => sum + toNumber(row.debit), 0),
      totalCredit: ledger.reduce((sum, row) => sum + toNumber(row.credit), 0),
      totalDebt: ledger.reduce((sum, row) => sum + toNumber(row.debt), 0),
      orderCount: ledger.length,
      customerCount: customerSummary.length,
      overdueCount: ledger.filter((row) => row.status === 'overdue').length,
      paidCount: ledger.filter((row) => row.status === 'paid').length
    };

    res.json({ ok: true, debts: ledger, customerSummary, summary });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được công nợ', error: err.message });
  }
});


function createReceiptDocument(data, { customer, amount, date, method = 'cash', staffName = '', note = '', refType = 'receipt', refId = '', refCode = '' }) {
  const openDebtRow = buildDebtLedgerRows(data).find((row) => row.customerId === customer.id && toNumber(row.debt) > 0) || {};
  const receipt = {
    id: makeId('RC'), code: buildReceiptCode(data), date,
    customerId: customer.id, customerCode: customer.code, customerName: customer.name,
    orderId: openDebtRow.orderId || '', orderCode: openDebtRow.orderCode || '',
    salesmanId: openDebtRow.salesmanId || '', salesmanCode: openDebtRow.salesmanCode || '', salesmanName: openDebtRow.salesmanName || '',
    deliveryStaffId: openDebtRow.deliveryStaffId || '', deliveryStaffCode: openDebtRow.deliveryStaffCode || '', deliveryStaffName: openDebtRow.deliveryStaffName || '',
    method, amount: toNumber(amount), staffName, note,
    refType, refId, refCode, status: 'posted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  data.receipts.push(receipt);
  data.payments.push({
    id: makeId('PM'), date, type: 'debt_collection', method,
    refType: 'receipt', refId: receipt.id, refCode: receipt.code,
    customerId: customer.id, customerCode: customer.code, customerName: customer.name,
    orderId: receipt.orderId, orderCode: receipt.orderCode,
    salesmanId: receipt.salesmanId, salesmanCode: receipt.salesmanCode, salesmanName: receipt.salesmanName,
    deliveryStaffId: receipt.deliveryStaffId, deliveryStaffCode: receipt.deliveryStaffCode, deliveryStaffName: receipt.deliveryStaffName,
    debit: 0, credit: receipt.amount, note: note || `Thu công nợ khách hàng ${customer.code}`,
    status: 'posted', createdAt: new Date().toISOString()
  });
  if (method === 'transfer') {
    data.bankbooks.push({
      id: makeId('BB'), code: buildBankCode(data), date, type: 'in', source: 'debt_bank_transfer',
      refType: 'receipt', refId: receipt.id, refCode: receipt.code,
      customerId: customer.id, customerCode: customer.code, customerName: customer.name,
      orderId: receipt.orderId, orderCode: receipt.orderCode,
      salesmanId: receipt.salesmanId, salesmanCode: receipt.salesmanCode, salesmanName: receipt.salesmanName,
      deliveryStaffId: receipt.deliveryStaffId, deliveryStaffCode: receipt.deliveryStaffCode, deliveryStaffName: receipt.deliveryStaffName,
      staffName, amount: receipt.amount, note: note || `Thu chuyển khoản khách hàng ${customer.code}`,
      status: 'posted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  } else {
    data.cashbooks.push({
      id: makeId('CB'), code: buildCashCode(data, 'in'), date, type: 'in', source: 'debt_cash_collection', method: 'cash',
      refType: 'receipt', refId: receipt.id, refCode: receipt.code,
      customerId: customer.id, customerCode: customer.code, customerName: customer.name,
      orderId: receipt.orderId, orderCode: receipt.orderCode,
      salesmanId: receipt.salesmanId, salesmanCode: receipt.salesmanCode, salesmanName: receipt.salesmanName,
      deliveryStaffId: receipt.deliveryStaffId, deliveryStaffCode: receipt.deliveryStaffCode, deliveryStaffName: receipt.deliveryStaffName,
      staffName, amount: receipt.amount, note: note || `Thu tiền mặt khách hàng ${customer.code}`,
      status: 'posted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
  return receipt;
}

function createReturnOrderDocument(data, { customer, amount, date, items = [], staffName = '', note = '', salesOrder = null, refType = 'returnOrder', returnType = 'partial' }) {
  const returnItems = Array.isArray(items) && items.length ? items : [];
  const totalQuantity = returnItems.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const totalAmount = toNumber(amount) || returnItems.reduce((sum, item) => sum + toNumber(item.amount || (toNumber(item.quantity) * toNumber(item.salePrice || item.price))), 0);
  const normalizedReturnType = returnType === 'full' ? 'full' : 'partial';
  const returnOrder = {
    id: makeId('RT'), code: buildReturnOrderCode(data), date,
    returnType: normalizedReturnType,
    customerId: customer.id, customerCode: customer.code, customerName: customer.name,
    salesOrderId: salesOrder?.id || '', salesOrderCode: salesOrder?.code || '',
    salesmanId: salesOrder?.salesStaffId || salesOrder?.salesmanId || '', salesmanCode: salesOrder?.salesStaffCode || salesOrder?.salesmanCode || '', salesmanName: salesOrder?.salesStaffName || salesOrder?.salesmanName || salesOrder?.staffName || '',
    deliveryStaffId: salesOrder?.deliveryStaffId || '', deliveryStaffCode: salesOrder?.deliveryStaffCode || '', deliveryStaffName: salesOrder?.deliveryStaffName || '',
    items: returnItems, totalQuantity, totalAmount, staffName, note,
    status: 'posted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  returnItems.forEach((item) => restoreStock(data, item));
  if (salesOrder) {
    salesOrder.returnAmount = toNumber(salesOrder.returnAmount) + totalAmount;
    salesOrder.debtAmount = Math.max(0, toNumber(salesOrder.totalAmount) - toNumber(salesOrder.paidAmount) - toNumber(salesOrder.returnAmount));
    salesOrder.returnStatus = normalizedReturnType === 'full' ? 'full_return' : 'partial_return';
    if (normalizedReturnType === 'full') {
      salesOrder.deliveryStatus = 'returned';
      salesOrder.status = 'returned';
    }
    salesOrder.updatedAt = new Date().toISOString();
  }
  data.returnOrders.push(returnOrder);
  data.payments.push({
    id: makeId('PM'), date, type: 'return_order', method: 'return',
    refType, refId: returnOrder.id, refCode: returnOrder.code,
    customerId: customer.id, customerCode: customer.code, customerName: customer.name,
    orderId: returnOrder.salesOrderId, orderCode: returnOrder.salesOrderCode,
    salesmanId: returnOrder.salesmanId, salesmanCode: returnOrder.salesmanCode, salesmanName: returnOrder.salesmanName,
    deliveryStaffId: returnOrder.deliveryStaffId, deliveryStaffCode: returnOrder.deliveryStaffCode, deliveryStaffName: returnOrder.deliveryStaffName,
    debit: 0, credit: totalAmount, note: note || `Trả hàng giảm công nợ ${customer.code}`,
    status: 'posted', createdAt: new Date().toISOString()
  });
  auditLog(data, 'create_return_order', 'returnOrder', returnOrder, null, returnOrder, normalizedReturnType === 'full' ? 'Tạo chứng từ trả toàn bộ đơn' : 'Tạo chứng từ trả hàng một phần', staffName);
  return returnOrder;
}

function buildReturnItemsFromRequest(order, rawItems = [], returnType = 'partial') {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  if (returnType === 'full') {
    return orderItems.map((item) => ({
      ...item,
      quantity: toNumber(item.quantity),
      qtyReturn: toNumber(item.quantity),
      price: toNumber(item.salePrice || item.price),
      amount: toNumber(item.quantity) * toNumber(item.salePrice || item.price),
      reason: 'Trả cả đơn'
    })).filter((item) => toNumber(item.quantity) > 0);
  }

  const requested = Array.isArray(rawItems) ? rawItems : [];
  return requested.map((raw) => {
    const code = String(raw.productCode || raw.productId || '').trim();
    const qtyReturn = toNumber(raw.qtyReturn ?? raw.quantity);
    const reason = String(raw.reason || raw.returnReason || '').trim();
    const source = orderItems.find((item) => String(item.productCode || item.productId || '').trim() === code);
    if (!source) throw new Error(`Sản phẩm ${code || '(trống)'} không nằm trong đơn ${order.code || order.id}`);
    const orderedQty = toNumber(source.quantity);
    if (qtyReturn <= 0) throw new Error(`Số lượng trả của ${source.productCode || code} phải lớn hơn 0`);
    if (qtyReturn > orderedQty) throw new Error(`Số lượng trả của ${source.productCode || code} không được lớn hơn số lượng trong đơn`);
    const price = toNumber(source.salePrice || source.price);
    return {
      ...source,
      quantity: qtyReturn,
      qtyReturn,
      price,
      amount: qtyReturn * price,
      reason
    };
  }).filter((item) => toNumber(item.quantity) > 0);
}

app.post('/api/debt-collections', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const customer = findCustomer(data, body.customerId || body.customerCode);
    const cashAmount = toNumber(body.cashAmount);
    const transferAmount = toNumber(body.transferAmount);
    const returnAmount = toNumber(body.returnAmount);
    const legacyAmount = toNumber(body.amount);
    const hasSplitValues = body.cashAmount !== undefined || body.transferAmount !== undefined || body.returnAmount !== undefined;
    const methodRaw = String(body.method || body.paymentMethod || 'cash').trim().toLowerCase();
    const legacyMethod = ['cash', 'transfer', 'return'].includes(methodRaw) ? methodRaw : 'cash';
    const totalAmount = hasSplitValues ? cashAmount + transferAmount + returnAmount : legacyAmount;
    const deliveryDateInput = String(body.deliveryDate || body.date || new Date().toISOString().slice(0, 10)).trim();
    const date = deliveryDateInput.slice(0, 10);
    const staffName = String(body.staffName || '').trim();
    const note = String(body.note || '').trim();
    if (!customer) return res.status(400).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    if (cashAmount < 0 || transferAmount < 0 || returnAmount < 0) return res.status(400).json({ ok: false, message: 'Giá trị tiền mặt, chuyển khoản, hàng trả về không được âm' });
    if (totalAmount <= 0) return res.status(400).json({ ok: false, message: 'Cần nhập ít nhất một giá trị: tiền mặt, chuyển khoản hoặc hàng trả về' });
    const currentDebtRow = buildCustomerDebtSummary(data).find((row) => row.customerId === customer.id);
    const currentDebt = currentDebtRow ? currentDebtRow.debt : 0;
    if (currentDebt <= 0) return res.status(400).json({ ok: false, message: 'Khách hàng này hiện không còn công nợ phải xử lý' });
    if (totalAmount > currentDebt) return res.status(400).json({ ok: false, message: `Tổng giá trị lớn hơn công nợ hiện tại. Nợ hiện tại: ${currentDebt}` });

    const documents = [];
    if (hasSplitValues) {
      if (cashAmount > 0) {
        const receipt = createReceiptDocument(data, { customer, amount: cashAmount, date, method: 'cash', staffName, note: note || 'Thu công nợ tiền mặt' });
        auditLog(data, 'create_receipt', 'receipt', receipt, null, receipt, 'Tạo phiếu thu tiền mặt', staffName);
        documents.push(receipt);
      }
      if (transferAmount > 0) {
        const receipt = createReceiptDocument(data, { customer, amount: transferAmount, date, method: 'transfer', staffName, note: note || 'Thu công nợ chuyển khoản' });
        auditLog(data, 'create_receipt', 'receipt', receipt, null, receipt, 'Tạo phiếu thu chuyển khoản', staffName);
        documents.push(receipt);
      }
      if (returnAmount > 0) {
        const returnOrder = createReturnOrderDocument(data, { customer, amount: returnAmount, date, items: body.items || [], staffName, note: note || 'Trả hàng giảm công nợ' });
        documents.push(returnOrder);
      }
    } else if (legacyMethod === 'return') {
      const returnOrder = createReturnOrderDocument(data, { customer, amount: legacyAmount, date, items: body.items || [], staffName, note });
      documents.push(returnOrder);
    } else {
      const receipt = createReceiptDocument(data, { customer, amount: legacyAmount, date, method: legacyMethod, staffName, note });
      auditLog(data, 'create_receipt', 'receipt', receipt, null, receipt, 'Tạo phiếu thu công nợ', staffName);
      documents.push(receipt);
    }
    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã ghi chứng từ công nợ: tiền mặt / chuyển khoản / hàng trả về', documents, debts: buildCustomerDebtSummary(data), cashSummary: getCashSummary(data), bankSummary: getBankSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xử lý được công nợ', error: err.message });
  }
});

app.get('/api/receipts', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let receipts = [...(data.receipts || [])];
    if (q) receipts = receipts.filter((r) => [r.code, r.customerCode, r.customerName, r.staffName, r.note, r.method, r.status].some((v) => normalizeText(v).includes(q)));
    receipts = receipts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, receipts });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử phiếu thu', error: err.message });
  }
});

app.put('/api/receipts/:id', (req, res) => {
  try {
    const data = readData();
    const receipt = (data.receipts || []).find((r) => r.id === req.params.id || r.code === req.params.id);
    if (!receipt) return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu thu' });
    if (receipt.status === 'void') return res.status(400).json({ ok: false, message: 'Phiếu thu đã hủy, không được sửa' });
    const before = cloneData(receipt);
    const amount = req.body.amount === undefined ? receipt.amount : toNumber(req.body.amount);
    if (amount <= 0) return res.status(400).json({ ok: false, message: 'Số tiền phải lớn hơn 0' });
    receipt.date = String(req.body.date || receipt.date).slice(0, 10);
    receipt.amount = amount;
    receipt.staffName = String(req.body.staffName || receipt.staffName || '').trim();
    receipt.note = String(req.body.note || receipt.note || '').trim();
    receipt.updatedAt = new Date().toISOString();
    [...data.payments, ...data.cashbooks, ...data.bankbooks].forEach((entry) => {
      if (entry.refType === 'receipt' && (entry.refId === receipt.id || entry.refCode === receipt.code)) {
        entry.date = receipt.date; entry.amount = amount; entry.credit = entry.credit !== undefined ? amount : entry.credit; entry.staffName = receipt.staffName || entry.staffName; entry.note = receipt.note || entry.note; entry.updatedAt = new Date().toISOString();
      }
    });
    auditLog(data, 'update_receipt', 'receipt', receipt, before, receipt, 'Sửa phiếu thu', receipt.staffName);
    writeData(data);
    res.json({ ok: true, message: 'Đã sửa phiếu thu và cập nhật sổ liên quan', receipt, debts: buildCustomerDebtSummary(data), cashSummary: getCashSummary(data), bankSummary: getBankSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không sửa được phiếu thu', error: err.message });
  }
});

app.delete('/api/receipts/:id', (req, res) => {
  try {
    const data = readData();
    const receipt = (data.receipts || []).find((r) => r.id === req.params.id || r.code === req.params.id);
    if (!receipt) return res.status(404).json({ ok: false, message: 'Không tìm thấy phiếu thu' });
    if (receipt.status === 'void') return res.status(400).json({ ok: false, message: 'Phiếu thu đã hủy trước đó' });
    const before = cloneData(receipt);
    receipt.status = 'void'; receipt.voidReason = String(req.body?.reason || req.query.reason || 'Hủy phiếu thu').trim(); receipt.voidedAt = new Date().toISOString(); receipt.updatedAt = new Date().toISOString();
    [...data.payments, ...data.cashbooks, ...data.bankbooks].forEach((entry) => {
      if (entry.refType === 'receipt' && (entry.refId === receipt.id || entry.refCode === receipt.code)) { entry.status = 'void'; entry.updatedAt = new Date().toISOString(); }
    });
    auditLog(data, 'void_receipt', 'receipt', receipt, before, receipt, receipt.voidReason, receipt.staffName);
    writeData(data);
    res.json({ ok: true, message: 'Đã hủy/void phiếu thu, không xóa dữ liệu gốc', receipt, debts: buildCustomerDebtSummary(data), cashSummary: getCashSummary(data), bankSummary: getBankSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không hủy được phiếu thu', error: err.message });
  }
});

app.get('/api/return-orders', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let returnOrders = [...(data.returnOrders || [])];
    if (q) returnOrders = returnOrders.filter((r) => [r.code, r.customerCode, r.customerName, r.salesOrderCode, r.staffName, r.note, r.status].some((v) => normalizeText(v).includes(q)));
    returnOrders = returnOrders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, returnOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử trả hàng', error: err.message });
  }
});

// Cashbook
// Cashbook
app.get('/api/cashbook', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let cashbook = [...(data.cashbooks || data.cashbook || []), ...(data.bankbooks || []).map((entry) => ({ ...entry, isBank: true }))];

    if (q) {
      cashbook = cashbook.filter((entry) =>
        normalizeText(entry.code).includes(q) ||
        normalizeText(entry.customerCode).includes(q) ||
        normalizeText(entry.customerName).includes(q) ||
        normalizeText(entry.staffName).includes(q) ||
        normalizeText(entry.note).includes(q) ||
        normalizeText(entry.source).includes(q)
      );
    }

    cashbook = cashbook.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, cashbook, summary: getCashSummary(data), bankSummary: getBankSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được quỹ tiền', error: err.message });
  }
});

app.post('/api/cashbook', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const type = body.type === 'out' ? 'out' : 'in';
    const amount = toNumber(body.amount);
    const deliveryDateInput = String(body.deliveryDate || body.date || new Date().toISOString().slice(0, 10)).trim();
    const date = deliveryDateInput.slice(0, 10);
    const source = String(body.source || 'manual').trim();
    const staffName = String(body.staffName || '').trim();
    const note = String(body.note || '').trim();

    if (amount <= 0) return res.status(400).json({ ok: false, message: 'Số tiền phải lớn hơn 0' });

    const currentBalance = getCashSummary(data).balance;
    if (type === 'out' && amount > currentBalance) {
      return res.status(400).json({ ok: false, message: `Không đủ tồn quỹ. Tồn quỹ hiện tại: ${currentBalance}` });
    }

    const entry = {
      id: makeId('CB'),
      code: buildCashCode(data, type),
      date,
      type,
      source,
      refType: 'manual',
      refId: '',
      refCode: '',
      customerId: '',
      customerCode: '',
      customerName: '',
      staffName,
      amount,
      note,
      createdAt: new Date().toISOString()
    };

    data.cashbooks.push(entry);
    writeData(data);

    res.status(201).json({ ok: true, message: type === 'in' ? 'Đã ghi phiếu thu quỹ' : 'Đã ghi phiếu chi quỹ', entry, summary: getCashSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được quỹ tiền', error: err.message });
  }
});



// Account / user management
app.get('/api/users', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q || '');
    const users = (data.staffs || [])
      .filter((user) => !q || [user.code, user.username, user.name, user.phone, user.roleLabel, user.role].some((value) => normalizeText(value).includes(q)))
      .map(({ password, ...user }) => user);
    res.json({ ok: true, users, roles: ROLE_LABELS });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được tài khoản', error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const role = VALID_ROLES.includes(String(body.role || '').trim()) ? String(body.role || '').trim() : 'sales';
    const user = {
      id: body.id || makeId('U'),
      code: String(body.code || body.username || '').trim(),
      username: String(body.username || body.code || '').trim(),
      password: isBcryptHash(body.password || '') ? String(body.password) : hashPasswordSync(body.password || '123456'),
      name: String(body.name || body.fullName || body.username || '').trim(),
      phone: String(body.phone || '').trim(),
      role,
      roleLabel: ROLE_LABELS[role] || role,
      isActive: body.isActive !== false,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!user.username) return res.status(400).json({ ok: false, message: 'Thiếu tên đăng nhập' });
    if (!user.name) return res.status(400).json({ ok: false, message: 'Thiếu tên người dùng' });
    const existed = (data.staffs || []).find((item) => normalizeText(item.username) === normalizeText(user.username) && normalizeText(item.id) !== normalizeText(user.id));
    if (existed) return res.status(400).json({ ok: false, message: 'Tên đăng nhập đã tồn tại' });
    const index = (data.staffs || []).findIndex((item) => normalizeText(item.id) === normalizeText(user.id));
    if (index >= 0) data.staffs[index] = { ...data.staffs[index], ...user, createdAt: data.staffs[index].createdAt || user.createdAt };
    else data.staffs.unshift(user);
    writeData(data);
    const { password, ...safeUser } = user;
    res.json({ ok: true, message: 'Đã lưu tài khoản', user: safeUser });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được tài khoản', error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const data = readData();
    const id = String(req.params.id || '').trim();
    const before = (data.staffs || []).length;
    data.staffs = (data.staffs || []).filter((user) => normalizeText(user.id) !== normalizeText(id));
    if (data.staffs.length === before) return res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
    writeData(data);
    res.json({ ok: true, message: 'Đã xóa tài khoản' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được tài khoản', error: err.message });
  }
});

// Promotion management: hỗ trợ CTKM, trưng bày, coupon, ontop của Unilever.
app.get('/api/promotions', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q || '');
    const promotions = (data.promotions || []).filter((promotion) => {
      if (!q) return true;
      return [promotion.code, promotion.name, promotion.type, promotion.conditionText, promotion.discountText, promotion.displayReward, promotion.couponText, promotion.ontopText, promotion.note, ...(promotion.productCodes || [])]
        .some((value) => normalizeText(value).includes(q));
    });
    res.json({ ok: true, promotions });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được khuyến mại', error: err.message });
  }
});

app.post('/api/promotions', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const productCodes = Array.isArray(body.productCodes)
      ? body.productCodes.map((code) => String(code || '').trim()).filter(Boolean)
      : String(body.productCodes || '').split(/[;,\n]/).map((code) => code.trim()).filter(Boolean);
    const promotion = {
      id: body.id || makeId('KM'),
      code: String(body.code || '').trim(),
      name: String(body.name || '').trim(),
      type: String(body.type || 'discount').trim(),
      productCodes,
      conditionText: String(body.conditionText || '').trim(),
      discountText: String(body.discountText || '').trim(),
      displayReward: String(body.displayReward || '').trim(),
      couponText: String(body.couponText || '').trim(),
      ontopText: String(body.ontopText || '').trim(),
      startDate: String(body.startDate || '').slice(0, 10),
      endDate: String(body.endDate || '').slice(0, 10),
      note: String(body.note || '').trim(),
      isActive: body.isActive !== false,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!promotion.code) return res.status(400).json({ ok: false, message: 'Thiếu mã CTKM' });
    if (!promotion.name) return res.status(400).json({ ok: false, message: 'Thiếu tên chương trình' });
    const index = (data.promotions || []).findIndex((item) => normalizeText(item.id) === normalizeText(promotion.id) || normalizeText(item.code) === normalizeText(promotion.code));
    if (index >= 0) data.promotions[index] = { ...data.promotions[index], ...promotion, createdAt: data.promotions[index].createdAt || promotion.createdAt };
    else data.promotions.unshift(promotion);
    writeData(data);
    res.json({ ok: true, message: 'Đã lưu khuyến mại', promotion });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được khuyến mại', error: err.message });
  }
});

app.delete('/api/promotions/:id', (req, res) => {
  try {
    const data = readData();
    const id = String(req.params.id || '').trim();
    const before = (data.promotions || []).length;
    data.promotions = (data.promotions || []).filter((promotion) => normalizeText(promotion.id) !== normalizeText(id));
    if (data.promotions.length === before) return res.status(404).json({ ok: false, message: 'Không tìm thấy khuyến mại' });
    writeData(data);
    res.json({ ok: true, message: 'Đã xóa khuyến mại' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được khuyến mại', error: err.message });
  }
});


function normalizeImportTemplatePayload(body = {}) {
  const type = String(body.type || '').trim();
  if (!TEMPLATE_DEFINITIONS[type]) {
    const error = new Error('Loại import không hợp lệ');
    error.statusCode = 400;
    throw error;
  }
  const fields = Array.isArray(body.fields) ? body.fields.map((field) => ({
    excelHeader: String(field.excelHeader || field.header || '').trim(),
    dbField: String(field.dbField || '').trim(),
    required: field.required === true || field.required === 'true',
    defaultValue: field.defaultValue === undefined ? '' : String(field.defaultValue)
  })).filter((field) => field.excelHeader && field.dbField) : [];
  if (!fields.length) {
    const error = new Error('Mẫu import phải có ít nhất 1 dòng mapping cột');
    error.statusCode = 400;
    throw error;
  }
  const def = TEMPLATE_DEFINITIONS[type];
  const allowed = new Set(def.columns || []);
  const invalidField = fields.find((field) => !allowed.has(field.dbField));
  if (invalidField) {
    const error = new Error(`Trường database không hợp lệ: ${invalidField.dbField}`);
    error.statusCode = 400;
    throw error;
  }
  return {
    id: String(body.id || '').trim() || makeId('IT'),
    code: String(body.code || '').trim() || makeId('IT'),
    name: String(body.name || '').trim() || 'Mẫu import tự tạo',
    type,
    sheetName: String(body.sheetName || 'Import').trim() || 'Import',
    startRow: toNumber(body.startRow) || 2,
    fields,
    isActive: body.isActive !== false,
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function findImportTemplate(data, id) {
  const key = normalizeText(id);
  return (data.importTemplates || []).find((template) => normalizeText(template.id) === key || normalizeText(template.code) === key);
}

function applyImportTemplateRows(rows, template) {
  if (!template || !Array.isArray(template.fields) || !template.fields.length) return rows;
  return (rows || []).map((row) => {
    const mapped = { __rowNo: row.__rowNo || '' };
    template.fields.forEach((field) => {
      mapped[field.dbField] = row[field.excelHeader] !== undefined && row[field.excelHeader] !== '' ? row[field.excelHeader] : (field.defaultValue || '');
    });
    return mapped;
  });
}

// Import Excel templates

app.get('/api/import/fields/:type', (req, res) => {
  try {
    const type = String(req.params.type || '').trim();
    const def = TEMPLATE_DEFINITIONS[type];
    if (!def) return res.status(400).json({ ok: false, message: 'Loại import không hợp lệ' });
    const fields = (def.columns || []).map((field, index) => ({ field, label: (def.headers || [])[index] || field }));
    res.json({ ok: true, type, title: def.title, fields });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được danh sách trường', error: err.message });
  }
});

app.get('/api/import/custom-templates', (req, res) => {
  try {
    const data = readData();
    res.json({ ok: true, templates: data.importTemplates || [] });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được mẫu import tự tạo', error: err.message });
  }
});

app.post('/api/import/custom-templates', (req, res) => {
  try {
    const data = readData();
    const template = normalizeImportTemplatePayload(req.body || {});
    if (!Array.isArray(data.importTemplates)) data.importTemplates = [];
    const index = data.importTemplates.findIndex((item) => normalizeText(item.id) === normalizeText(template.id) || normalizeText(item.code) === normalizeText(template.code));
    if (index >= 0) data.importTemplates[index] = { ...data.importTemplates[index], ...template, createdAt: data.importTemplates[index].createdAt || template.createdAt };
    else data.importTemplates.unshift(template);
    writeData(data);
    res.json({ ok: true, message: 'Đã lưu mẫu import tự tạo', template });
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, message: err.message || 'Không lưu được mẫu import' });
  }
});

app.delete('/api/import/custom-templates/:id', (req, res) => {
  try {
    const data = readData();
    const id = String(req.params.id || '').trim();
    const before = (data.importTemplates || []).length;
    data.importTemplates = (data.importTemplates || []).filter((template) => normalizeText(template.id) !== normalizeText(id));
    if (data.importTemplates.length === before) return res.status(404).json({ ok: false, message: 'Không tìm thấy mẫu import' });
    writeData(data);
    res.json({ ok: true, message: 'Đã xóa mẫu import' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được mẫu import', error: err.message });
  }
});

app.get('/api/import/custom-template/:id/download', (req, res) => {
  try {
    const data = readData();
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

// Import Excel
app.post('/api/import/preview', upload.single('file'), (req, res) => {
  try {
    let type = String(req.body.type || '').trim();
    const templateId = String(req.body.templateId || '').trim();
    if (!type) return res.status(400).json({ ok: false, message: 'Thiếu loại import' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok: false, message: 'Chưa chọn file Excel' });

    const rows = parseExcelBuffer(req.file.buffer);
    if (!rows.length) return res.status(400).json({ ok: false, message: 'File Excel không có dữ liệu' });

    const data = readData();
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

    const data = readData();
    const result = commitImport(type, rows, data);
    if (!result.ok) return res.status(400).json(result);
    writeData(data);
    res.json({ ok: true, ...result, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: err.message });
  }
});

app.get('/api/import/logs', (req, res) => {
  try {
    const data = readData();
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

app.get('/api/print/:type/:id', (req, res) => {
  try {
    const data = readData();
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

app.post('/api/mobile/login', authLimiter, [body('username').isLength({ min: 2 }).withMessage('Tài khoản không hợp lệ'), body('password').isLength({ min: 4 }).withMessage('Mật khẩu không hợp lệ')], validateRequest, (req, res) => {
  try {
    const data = readData();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    if (!username || !password) return res.status(400).json({ ok: false, message: 'Thiếu tài khoản hoặc mật khẩu' });

    const staffs = Array.isArray(data.staffs) ? data.staffs : [];
    let staff = staffs.find(item => {
      if (item.isActive === false) return false;
      const candidateNames = [item.username, item.code, item.phone, item.name].map(value => normalizeText(value));
      const candidatePassword = String(item.password || item.pass || item.pin || '123456');
      return candidateNames.includes(normalizeText(username)) && verifyPasswordSync(password, candidatePassword);
    });

    if (!staff && username === 'admin' && verifyPasswordSync(password, hashPasswordSync('admin'))) {
      staff = { id: 'ADMIN', code: 'ADMIN', username: 'admin', name: 'Quản trị hệ thống', role: 'admin' };
    }
    if (!staff) return res.status(401).json({ ok: false, message: 'Sai tài khoản hoặc mật khẩu' });

    const user = {
      id: staff.id || staff.code || username,
      code: staff.code || '',
      username: staff.username || staff.code || username,
      name: staff.name || staff.fullName || username,
      role: VALID_ROLES.includes(staff.role || staff.type) ? (staff.role || staff.type) : 'sales',
      roleLabel: ROLE_LABELS[VALID_ROLES.includes(staff.role || staff.type) ? (staff.role || staff.type) : 'sales']
    };

    writeMobileLog(data, user, 'mobile_login', { note: 'Đăng nhập mobile app' });
    writeData(data);
    res.json({ ok: true, success: true, token: encodeMobileToken(user), refreshToken: encodeMobileRefreshToken(user), expiresIn: ACCESS_TOKEN_EXPIRES_IN, user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đăng nhập được mobile app', error: err.message });
  }
});

app.post('/api/mobile/refresh', authLimiter, (req, res) => {
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

app.get('/api/mobile/me', requireMobileLogin, (req, res) => {
  res.json({ ok: true, user: req.mobileUser, roles: ROLE_LABELS });
});

app.get('/api/mobile/roles', requireMobileLogin, (req, res) => {
  res.json({ ok: true, roles: ROLE_LABELS });
});

app.get('/api/mobile/customers', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), (req, res) => {
  try {
    const data = readData();
    const q = String(req.query.q || '').trim();
    const items = data.customers
      .filter(customer => customer.isActive !== false)
      .filter(customer => !q || mobileMatchText(customer, q, ['code', 'name', 'phone', 'address', 'area', 'staffName']))
      .slice(0, 30)
      .map(customer => ({
        id: customer.id,
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        area: customer.area,
        staffName: customer.staffName
      }));
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được khách hàng mobile', error: err.message });
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
    const data = readData();
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
    const data = readData();
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

app.post('/api/mobile/sales/orders', requireMobileLogin, requireMobileRole(['sales']), (req, res) => {
  try {
    const data = readData();
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

    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã gửi đơn mobile về hệ thống tổng', salesOrder });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được đơn mobile', error: err.message });
  }
});

app.get('/api/mobile/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales']), (req, res) => {
  try {
    const data = readData();
    const order = data.salesOrders.find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn bán' });
    const mine = normalizeText(order.staffCode || order.salesStaffCode) === normalizeText(req.mobileUser.code) || normalizeText(order.staffName || order.salesStaffName) === normalizeText(req.mobileUser.name);
    if (!mine) return res.status(403).json({ ok: false, message: 'Bạn chỉ được xem đơn của mình' });
    res.json({ ok: true, order: { ...order, canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged' } });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được đơn mobile', error: err.message });
  }
});

app.put('/api/mobile/sales/orders/:id', requireMobileLogin, requireMobileRole(['sales']), (req, res) => {
  try {
    const data = readData();
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
    writeData(data);
    res.json({ ok: true, message: `Đã sửa đơn ${salesOrder.code}`, salesOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được đơn mobile' });
  }
});

app.get('/api/mobile/sales/orders', requireMobileLogin, requireMobileRole(['sales']), (req, res) => {
  try {
    const data = readData();
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

app.get('/api/mobile/delivery/orders', requireMobileLogin, requireMobileRole(['delivery']), (req, res) => {
  try {
    const data = readData();
    const targetDate = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const q = normalizeText(req.query.q);
    const status = normalizeText(req.query.status);
    const includeCompleted = String(req.query.includeCompleted || '') === '1';
    const ledger = buildDebtLedgerRows(data);
    const debtByOrder = new Map(ledger.map((row) => [String(row.orderId), row]));

    let items = (data.salesOrders || [])
      .filter((order) => isOrderApprovedForDelivery(order))
      .filter((order) => getOrderDeliveryDate(data, order) === targetDate)
      .filter((order) => isOrderAssignedToDeliveryUser(order, getOrderDeliveryInfo(data, order), req.mobileUser))
      .map((order) => buildDeliveryOrderRow(data, order, debtByOrder.get(String(order.id)), targetDate))
      .filter((order) => includeCompleted || isDeliveryOrderActive(order.deliveryStatus));

    if (q) {
      items = items.filter((order) => [order.code, order.customerCode, order.customerName, order.phone, order.address, order.routeName].some((value) => normalizeText(value).includes(q)));
    }
    if (status) {
      items = items.filter((order) => {
        if (status === 'unpaid') return toNumber(order.debtAmount) > 0;
        if (status === 'late') return order.isLate;
        return normalizeText(order.deliveryStatus) === status || normalizeText(order.visualStatus) === status;
      });
    }

    items = items
      .sort((a, b) => String(a.routeName).localeCompare(String(b.routeName)) || String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(0, 100)
      .map((order) => ({
        id: order.id,
        code: order.code,
        deliveryDate: order.deliveryDate,
        deliveryStatus: order.deliveryStatus || 'pending',
        visualStatus: order.visualStatus || order.deliveryStatus || 'pending',
        routeName: order.routeName || '',
        customerName: order.customerName,
        customerCode: order.customerCode,
        phone: order.phone,
        address: order.address,
        salesmanName: order.salesmanName,
        salesmanCode: order.salesmanCode,
        deliveryStaffName: order.deliveryStaffName,
        deliveryStaffCode: order.deliveryStaffCode,
        amount: toNumber(order.debtAmount),
        totalAmount: toNumber(order.totalAmount),
        paidAmount: toNumber(order.paidAmount),
        debtAmount: toNumber(order.debtAmount),
        cashCollected: toNumber(order.cashCollected),
        bankCollected: toNumber(order.bankCollected),
        returnAmount: toNumber(order.returnAmount),
        status: order.status,
        items: order.items || []
      }));

    res.json({
      ok: true,
      date: targetDate,
      user: {
        id: req.mobileUser.id,
        code: req.mobileUser.code,
        name: req.mobileUser.name
      },
      formula: 'deliveryDate = ngày được chọn + deliveryStaff = nhân viên đang đăng nhập + deliveryStatus chưa hoàn tất/hủy',
      items
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được đơn giao hàng mobile', error: err.message });
  }
});

app.post('/api/mobile/delivery/confirm', requireMobileLogin, requireMobileRole(['delivery']), (req, res) => {
  try {
    const data = readData();
    const orderId = String(req.body.orderId || '').trim();
    const status = String(req.body.status || '').trim();
    const collectAmount = toNumber(req.body.collectAmount);
    const collectionMethodRaw = String(req.body.collectionMethod || req.body.paymentMethod || 'cash').trim().toLowerCase();
    const collectionMethod = ['cash', 'transfer'].includes(collectionMethodRaw) ? collectionMethodRaw : 'cash';
    const note = String(req.body.note || '').trim();
    const order = data.salesOrders.find(item => item.id === orderId || item.code === orderId);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn giao hàng' });
    if (!['success', 'failed'].includes(status)) return res.status(400).json({ ok: false, message: 'Trạng thái giao hàng không hợp lệ' });
    if (collectAmount < 0) return res.status(400).json({ ok: false, message: 'Tiền thu không được âm' });
    if (status === 'success' && collectAmount > toNumber(order.debtAmount)) return res.status(400).json({ ok: false, message: 'Tiền thu không được lớn hơn công nợ còn lại của đơn' });

    order.deliveryStatus = status === 'success' ? 'delivered' : 'failed';
    order.deliveryStaffName = req.mobileUser.name || '';
    order.deliveryStaffCode = req.mobileUser.code || '';
    order.deliveryNote = note;
    order.deliveredAt = new Date().toISOString();
    if (status === 'success') order.status = 'delivered';
    if (status === 'failed') order.status = 'delivery_failed';

    if (status === 'success' && collectAmount > 0) {
      const date = new Date().toISOString().slice(0, 10);
      const customer = findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };
      const receipt = createReceiptDocument(data, {
        customer,
        amount: collectAmount,
        date,
        method: collectionMethod,
        staffName: req.mobileUser.name || '',
        note: note || (collectionMethod === 'transfer' ? `App giao hàng thu chuyển khoản đơn ${order.code}` : `App giao hàng thu tiền mặt đơn ${order.code}`),
        refType: 'mobileDelivery',
        refId: order.id,
        refCode: order.code
      });
      order.paidAmount = toNumber(order.paidAmount) + collectAmount;
      order.debtAmount = Math.max(0, toNumber(order.totalAmount) - toNumber(order.paidAmount) - toNumber(order.returnAmount));
      auditLog(data, 'mobile_delivery_receipt', 'receipt', receipt, null, receipt, 'App giao hàng sinh phiếu thu thật', req.mobileUser.name || '');
    }

    writeMobileLog(data, req.mobileUser, 'mobile_confirm_delivery', {
      refType: 'salesOrder',
      refId: order.id,
      refCode: order.code,
      note: `${status === 'success' ? 'Giao thành công' : 'Giao thất bại'} ${order.code}`
    });

    writeData(data);
    res.json({ ok: true, message: 'Đã cập nhật trạng thái giao hàng', order });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được giao hàng mobile', error: err.message });
  }
});

app.post('/api/mobile/delivery/return', requireMobileLogin, requireMobileRole(['delivery']), (req, res) => {
  try {
    const data = readData();
    const orderId = String(req.body.orderId || '').trim();
    const returnType = String(req.body.returnType || 'partial').trim() === 'full' ? 'full' : 'partial';
    const note = String(req.body.note || '').trim();
    const order = data.salesOrders.find(item => item.id === orderId || item.code === orderId);
    if (!order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn giao hàng' });
    if (['returned', 'cancelled', 'void'].includes(String(order.status || '').toLowerCase())) {
      return res.status(400).json({ ok: false, message: 'Đơn đã trả/hủy, không thể tạo thêm phiếu trả hàng' });
    }

    const items = buildReturnItemsFromRequest(order, req.body.items || [], returnType);
    if (!items.length) return res.status(400).json({ ok: false, message: returnType === 'full' ? 'Đơn không có hàng để trả' : 'Chưa chọn sản phẩm/số lượng trả' });
    const date = new Date().toISOString().slice(0, 10);
    const customer = findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };
    const returnOrder = createReturnOrderDocument(data, {
      customer,
      date,
      items,
      staffName: req.mobileUser.name || '',
      note: note || (returnType === 'full' ? `App giao hàng trả cả đơn ${order.code}` : `App giao hàng trả một phần đơn ${order.code}`),
      salesOrder: order,
      refType: returnType === 'full' ? 'mobileDeliveryFullReturn' : 'mobileDeliveryPartialReturn',
      returnType
    });

    if (returnType === 'partial') {
      order.deliveryStatus = 'partial_return';
      order.status = order.debtAmount <= 0 ? 'delivered' : 'partial_return';
    }
    order.deliveryStaffName = req.mobileUser.name || order.deliveryStaffName || '';
    order.deliveryStaffCode = req.mobileUser.code || order.deliveryStaffCode || '';
    order.deliveryNote = note || order.deliveryNote || '';
    order.updatedAt = new Date().toISOString();

    writeMobileLog(data, req.mobileUser, 'mobile_delivery_return', {
      refType: 'returnOrder',
      refId: returnOrder.id,
      refCode: returnOrder.code,
      note: `${returnType === 'full' ? 'Trả cả đơn' : 'Trả một phần'} ${order.code}`
    });

    writeData(data);
    res.status(201).json({ ok: true, message: returnType === 'full' ? 'Đã tạo phiếu trả cả đơn' : 'Đã tạo phiếu trả hàng một phần', returnOrder, order });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu trả hàng từ app giao hàng' });
  }
});

app.post('/api/mobile/cash/submit', requireMobileLogin, requireMobileRole(['delivery']), (req, res) => {
  try {
    const data = readData();
    const amount = toNumber(req.body.amount);
    const note = String(req.body.note || '').trim();
    if (amount <= 0) return res.status(400).json({ ok: false, message: 'Số tiền nộp quỹ phải lớn hơn 0' });

    const entry = {
      id: makeId('CB'),
      code: buildCashCode(data, 'in'),
      date: new Date().toISOString().slice(0, 10),
      type: 'in',
      source: 'mobile_cash_submit',
      refType: 'cashSubmit',
      refId: '',
      refCode: '',
      customerId: '',
      customerCode: '',
      customerName: '',
      staffName: req.mobileUser.name || '',
      amount,
      note: note || `Nhân viên ${req.mobileUser.name || ''} nộp tiền về quỹ`,
      createdAt: new Date().toISOString()
    };
    data.cashbooks.push(entry);
    writeMobileLog(data, req.mobileUser, 'mobile_cash_submit', {
      refType: 'cashbook',
      refId: entry.id,
      refCode: entry.code,
      note: `Nộp quỹ ${entry.code}`
    });
    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã ghi nhận nộp tiền về quỹ', entry });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi nhận được nộp quỹ mobile', error: err.message });
  }
});


app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile', 'login.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/api/health/db', (req, res) => {
  const mongoose = require('mongoose');
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    ok: mongoose.connection.readyState === 1,
    state: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState
  });
});

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
  await migrateJsonToMongoIfEmpty();
  await loadMongoDataToCache();

  app.listen(PORT, () => {
    console.log(`Server V44 đang chạy tại http://localhost:${PORT}`);
  });
}

startServer();
