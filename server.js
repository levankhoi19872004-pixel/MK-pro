require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { parseExcelBuffer } = require('./utils/excelParser');
const { previewImport, commitImport } = require('./services/importService');
const { renderPrintHtml } = require('./services/printService');
const { buildImportTemplate, getTemplateTypes } = require('./services/excelTemplateService');
const { initDataStore, readDataSync, writeDataSync, getDataStoreStatus } = require('./services/mongoDataStore');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'kho-data.json');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};
const VALID_ROLES = Object.keys(ROLE_LABELS);


app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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
    promotions: [],
    payments: [],
    cashbook: [],
    importLogs: [],
    mobileLogs: []
  };
}

function createDefaultStaffAccounts() {
  const now = new Date().toISOString();
  return [
    { id: 'U_ADMIN', code: 'ADMIN', username: 'admin', password: 'admin', name: 'Quản trị hệ thống', role: 'admin', roleLabel: ROLE_LABELS.admin, isActive: true, createdAt: now, updatedAt: now },
    { id: 'U_KT01', code: 'KT01', username: 'ketoan', password: '123456', name: 'Tài khoản kế toán', role: 'accountant', roleLabel: ROLE_LABELS.accountant, isActive: true, createdAt: now, updatedAt: now },
    { id: 'U_BH01', code: 'BH01', username: 'banhang', password: '123456', name: 'Tài khoản bán hàng', role: 'sales', roleLabel: ROLE_LABELS.sales, isActive: true, createdAt: now, updatedAt: now },
    { id: 'U_GH01', code: 'GH01', username: 'giaohang', password: '123456', name: 'Tài khoản giao hàng', role: 'delivery', roleLabel: ROLE_LABELS.delivery, isActive: true, createdAt: now, updatedAt: now }
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

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
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
    unit: String(product.unit || 'Cái').trim(),
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
      password: String(staff.password || staff.pass || staff.pin || '123456'),
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
    isChildOrder: order.isChildOrder !== false,
    masterOrderId: order.masterOrderId || '',
    mergeStatus: order.mergeStatus || (order.masterOrderId ? 'merged' : 'unmerged'),
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    grossAmount: toNumber(order.grossAmount || order.totalAmount),
    discountAmount: toNumber(order.discountAmount),
    promotionSummary: order.promotionSummary || { discountAmount: toNumber(order.discountAmount), appliedPromotions: [] },
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    debtAmount: toNumber(order.debtAmount),
    status: order.status || 'posted',
    createdAt: order.createdAt || new Date().toISOString()
  }));


  data.masterOrders = data.masterOrders.map((order) => ({
    id: order.id || makeId('MO'),
    code: order.code || '',
    date: order.date || new Date().toISOString().slice(0, 10),
    routeName: String(order.routeName || '').trim(),
    deliveryStaffCode: String(order.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(order.deliveryStaffName || '').trim(),
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


  data.promotions = data.promotions.map((promotion) => {
    const type = ['discount_percent', 'discount_amount'].includes(String(promotion.type || '').trim()) ? String(promotion.type || '').trim() : 'discount_percent';
    const productCodes = Array.isArray(promotion.productCodes)
      ? promotion.productCodes.map((code) => String(code || '').trim()).filter(Boolean)
      : String(promotion.productCodes || '').split(/[;,\n]/).map((code) => String(code || '').trim()).filter(Boolean);
    return {
      id: promotion.id || makeId('KM'),
      code: String(promotion.code || '').trim(),
      name: String(promotion.name || '').trim(),
      type,
      productCodes,
      minQty: toNumber(promotion.minQty || 1),
      discountPercent: toNumber(promotion.discountPercent),
      discountAmount: toNumber(promotion.discountAmount),
      startDate: String(promotion.startDate || '').trim(),
      endDate: String(promotion.endDate || '').trim(),
      note: String(promotion.note || '').trim(),
      isActive: promotion.isActive !== false,
      createdAt: promotion.createdAt || new Date().toISOString(),
      updatedAt: promotion.updatedAt || promotion.createdAt || new Date().toISOString()
    };
  });

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

  data.cashbook = data.cashbook.map((entry) => ({
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
    amount: toNumber(entry.amount),
    note: entry.note || '',
    createdAt: entry.createdAt || new Date().toISOString()
  }));

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

  return data;
}

function readData() {
  return readDataSync();
}

function writeData(data) {
  return writeDataSync(data);
}

function pickProductPayload(body) {
  return {
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    unit: String(body.unit || '').trim() || 'Cái',
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
  if (payload.costPrice < 0 || payload.salePrice < 0) return 'Giá nhập / giá bán không được âm';
  if (payload.minStock < 0 || payload.maxStock < 0) return 'Tồn tối thiểu / tối đa không được âm';
  if (payload.maxStock > 0 && payload.minStock > payload.maxStock) return 'Tồn tối thiểu không được lớn hơn tồn tối đa';
  return '';
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
  const prefix = type === 'out' ? 'PC' : 'PT';
  return `${prefix}${(data.cashbook.length + 1).toString().padStart(5, '0')}`;
}

function findProduct(data, productIdOrCode) {
  const value = normalizeText(productIdOrCode);
  return data.products.find((p) => normalizeText(p.id) === value || normalizeText(p.code) === value);
}

function findCustomer(data, customerIdOrCode) {
  const value = normalizeText(customerIdOrCode);
  return data.customers.find((c) => normalizeText(c.id) === value || normalizeText(c.code) === value);
}

function findStockRow(data, product) {
  return data.stock.find((row) => normalizeText(row.productId) === normalizeText(product.id) || normalizeText(row.productCode) === normalizeText(product.code));
}

function upsertStock(data, item) {
  let stockRow = data.stock.find((row) => normalizeText(row.productId) === normalizeText(item.productId) || normalizeText(row.productCode) === normalizeText(item.productCode));

  if (!stockRow) {
    stockRow = {
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      unit: item.unit,
      quantity: 0,
      updatedAt: new Date().toISOString()
    };
    data.stock.push(stockRow);
  }

  stockRow.productId = item.productId;
  stockRow.productCode = item.productCode;
  stockRow.productName = item.productName;
  stockRow.unit = item.unit;
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

function getCashSummary(data) {
  const cashIn = data.cashbook.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const cashOut = data.cashbook.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { cashIn, cashOut, balance: cashIn - cashOut };
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

  data.payments.forEach((payment) => {
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


function promotionAppliesDate(promotion, date) {
  const value = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (promotion.startDate && value < String(promotion.startDate).slice(0, 10)) return false;
  if (promotion.endDate && value > String(promotion.endDate).slice(0, 10)) return false;
  return true;
}

function pickPromotionPayload(body) {
  const productCodes = String(body.productCodes || '')
    .split(/[;,\n]/)
    .map((code) => String(code || '').trim())
    .filter(Boolean);
  return {
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    type: String(body.type || 'discount_percent').trim(),
    productCodes,
    minQty: toNumber(body.minQty || 1),
    discountPercent: toNumber(body.discountPercent),
    discountAmount: toNumber(body.discountAmount),
    startDate: String(body.startDate || '').trim(),
    endDate: String(body.endDate || '').trim(),
    note: String(body.note || '').trim(),
    isActive: body.isActive !== false
  };
}

function validatePromotion(payload) {
  if (!payload.code) return 'Thiếu mã CTKM';
  if (!payload.name) return 'Thiếu tên CTKM';
  if (!payload.productCodes.length) return 'Thiếu mã sản phẩm áp dụng';
  if (payload.minQty <= 0) return 'Số lượng điều kiện phải lớn hơn 0';
  if (!['discount_percent', 'discount_amount'].includes(payload.type)) return 'Loại khuyến mại không hợp lệ';
  if (payload.type === 'discount_percent' && (payload.discountPercent <= 0 || payload.discountPercent > 100)) return 'Phần trăm giảm phải từ 1 đến 100';
  if (payload.type === 'discount_amount' && payload.discountAmount <= 0) return 'Số tiền giảm phải lớn hơn 0';
  if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) return 'Ngày bắt đầu không được lớn hơn ngày kết thúc';
  return '';
}

function calculateOrderPromotions(data, items, date) {
  const activePromotions = (data.promotions || []).filter((promotion) => promotion.isActive !== false && promotionAppliesDate(promotion, date));
  const appliedPromotions = [];
  let discountAmount = 0;

  for (const promotion of activePromotions) {
    const codeSet = new Set((promotion.productCodes || []).map((code) => normalizeText(code)));
    const matchedItems = items.filter((item) => codeSet.has(normalizeText(item.productCode)) || codeSet.has(normalizeText(item.productId)));
    const totalQty = matchedItems.reduce((sum, item) => sum + toNumber(item.quantity), 0);
    const baseAmount = matchedItems.reduce((sum, item) => sum + toNumber(item.amount), 0);
    if (!matchedItems.length || totalQty < toNumber(promotion.minQty) || baseAmount <= 0) continue;

    let amount = 0;
    if (promotion.type === 'discount_percent') amount = Math.round(baseAmount * toNumber(promotion.discountPercent) / 100);
    if (promotion.type === 'discount_amount') amount = Math.min(toNumber(promotion.discountAmount), baseAmount);
    if (amount <= 0) continue;

    discountAmount += amount;
    appliedPromotions.push({
      id: promotion.id,
      code: promotion.code,
      name: promotion.name,
      type: promotion.type,
      totalQty,
      baseAmount,
      discountAmount: amount
    });
  }

  const grossAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  discountAmount = Math.min(discountAmount, grossAmount);
  return {
    grossAmount,
    discountAmount,
    totalAmount: Math.max(0, grossAmount - discountAmount),
    promotionSummary: { discountAmount, appliedPromotions }
  };
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

// Products
app.get('/api/products', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    const activeOnly = String(req.query.activeOnly || '') === '1';
    let products = data.products || [];

    if (activeOnly) products = products.filter((p) => p.isActive !== false);
    if (q) {
      products = products.filter((p) =>
        normalizeText(p.code).includes(q) ||
        normalizeText(p.name).includes(q) ||
        normalizeText(p.barcode).includes(q) ||
        normalizeText(p.category).includes(q) ||
        normalizeText(p.unit).includes(q)
      );
    }

    res.json({ ok: true, products });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách sản phẩm', error: err.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const data = readData();
    const payload = pickProductPayload(req.body || {});
    const error = validateProduct(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = data.products.some((p) => normalizeText(p.code) === normalizeText(payload.code));
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã sản phẩm đã tồn tại' });

    if (payload.barcode) {
      const existedBarcode = data.products.some((p) => normalizeText(p.barcode) === normalizeText(payload.barcode));
      if (existedBarcode) return res.status(409).json({ ok: false, message: 'Mã vạch đã tồn tại' });
    }

    const now = new Date().toISOString();
    const product = { id: makeId('P'), ...payload, createdAt: now, updatedAt: now };
    data.products.push(product);
    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã tạo sản phẩm', product });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được sản phẩm', error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const data = readData();
    const productId = req.params.id;
    const index = data.products.findIndex((p) => p.id === productId);
    if (index === -1) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm' });

    const payload = pickProductPayload(req.body || {});
    const error = validateProduct(payload);
    if (error) return res.status(400).json({ ok: false, message: error });

    const existedCode = data.products.some((p) => p.id !== productId && normalizeText(p.code) === normalizeText(payload.code));
    if (existedCode) return res.status(409).json({ ok: false, message: 'Mã sản phẩm đã tồn tại' });

    if (payload.barcode) {
      const existedBarcode = data.products.some((p) => p.id !== productId && normalizeText(p.barcode) === normalizeText(payload.barcode));
      if (existedBarcode) return res.status(409).json({ ok: false, message: 'Mã vạch đã tồn tại' });
    }

    const updatedProduct = { ...data.products[index], ...payload, updatedAt: new Date().toISOString() };
    data.products[index] = updatedProduct;

    data.stock.forEach((row) => {
      if (row.productId === productId) {
        row.productCode = updatedProduct.code;
        row.productName = updatedProduct.name;
        row.unit = updatedProduct.unit;
        row.updatedAt = new Date().toISOString();
      }
    });

    writeData(data);
    res.json({ ok: true, message: 'Đã cập nhật sản phẩm', product: updatedProduct });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được sản phẩm', error: err.message });
  }
});

app.patch('/api/products/:id/status', (req, res) => {
  try {
    const data = readData();
    const product = data.products.find((p) => p.id === req.params.id);
    if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm' });

    product.isActive = req.body.isActive !== false;
    product.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ ok: true, message: product.isActive ? 'Đã mở bán sản phẩm' : 'Đã ngừng bán sản phẩm', product });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đổi được trạng thái sản phẩm', error: err.message });
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
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
    const note = String(body.note || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Phiếu nhập chưa có dòng hàng' });

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productId || rawItem.productCode);
      if (!product) return res.status(400).json({ ok: false, message: `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.productId || ''}` });
      if (product.isActive === false) return res.status(400).json({ ok: false, message: `Sản phẩm đang ngừng bán: ${product.code}` });

      const quantity = toNumber(rawItem.quantity);
      const costPrice = toNumber(rawItem.costPrice || product.costPrice);
      if (quantity <= 0) return res.status(400).json({ ok: false, message: `Số lượng nhập phải lớn hơn 0: ${product.code}` });
      if (costPrice < 0) return res.status(400).json({ ok: false, message: `Giá nhập không được âm: ${product.code}` });

      items.push({ productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity, costPrice, amount: quantity * costPrice });
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


// Promotions
app.get('/api/promotions', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let promotions = data.promotions || [];
    if (q) {
      promotions = promotions.filter((promotion) =>
        normalizeText(promotion.code).includes(q) ||
        normalizeText(promotion.name).includes(q) ||
        normalizeText((promotion.productCodes || []).join(' ')).includes(q) ||
        normalizeText(promotion.note).includes(q)
      );
    }
    promotions = promotions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, promotions });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách khuyến mại', error: err.message });
  }
});

app.post('/api/promotions', (req, res) => {
  try {
    const data = readData();
    const payload = pickPromotionPayload(req.body || {});
    const error = validatePromotion(payload);
    if (error) return res.status(400).json({ ok: false, message: error });
    const existed = data.promotions.some((promotion) => normalizeText(promotion.code) === normalizeText(payload.code));
    if (existed) return res.status(409).json({ ok: false, message: 'Mã CTKM đã tồn tại' });
    const now = new Date().toISOString();
    const promotion = { id: makeId('KM'), ...payload, createdAt: now, updatedAt: now };
    data.promotions.push(promotion);
    writeData(data);
    res.status(201).json({ ok: true, message: 'Đã tạo chương trình khuyến mại', promotion });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được khuyến mại', error: err.message });
  }
});

app.put('/api/promotions/:id', (req, res) => {
  try {
    const data = readData();
    const index = data.promotions.findIndex((promotion) => promotion.id === req.params.id || promotion.code === req.params.id);
    if (index === -1) return res.status(404).json({ ok: false, message: 'Không tìm thấy khuyến mại' });
    const payload = pickPromotionPayload(req.body || {});
    const error = validatePromotion(payload);
    if (error) return res.status(400).json({ ok: false, message: error });
    const existed = data.promotions.some((promotion) => promotion.id !== data.promotions[index].id && normalizeText(promotion.code) === normalizeText(payload.code));
    if (existed) return res.status(409).json({ ok: false, message: 'Mã CTKM đã tồn tại' });
    data.promotions[index] = { ...data.promotions[index], ...payload, updatedAt: new Date().toISOString() };
    writeData(data);
    res.json({ ok: true, message: 'Đã cập nhật khuyến mại', promotion: data.promotions[index] });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được khuyến mại', error: err.message });
  }
});

app.patch('/api/promotions/:id/status', (req, res) => {
  try {
    const data = readData();
    const promotion = data.promotions.find((item) => item.id === req.params.id || item.code === req.params.id);
    if (!promotion) return res.status(404).json({ ok: false, message: 'Không tìm thấy khuyến mại' });
    promotion.isActive = req.body.isActive !== false;
    promotion.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ ok: true, message: promotion.isActive ? 'Đã bật khuyến mại' : 'Đã tắt khuyến mại', promotion });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đổi được trạng thái khuyến mại', error: err.message });
  }
});

app.post('/api/promotions/check', (req, res) => {
  try {
    const data = readData();
    const items = Array.isArray(req.body.items) ? req.body.items.map((item) => {
      const product = findProduct(data, item.productId || item.productCode || item.code);
      const quantity = toNumber(item.quantity || item.qty);
      const salePrice = toNumber(item.salePrice || item.price || product?.salePrice);
      return product ? { productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity, salePrice, amount: quantity * salePrice } : null;
    }).filter(Boolean) : [];
    const result = calculateOrderPromotions(data, items, String(req.body.date || new Date().toISOString().slice(0, 10)));
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không kiểm tra được khuyến mại', error: err.message });
  }
});

// Sales / debts
app.get('/api/sales-orders', (req, res) => {
  try {
    const data = readData();
    const orders = [...data.salesOrders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, salesOrders: orders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử bán hàng', error: err.message });
  }
});


function getMasterOrderChildren(data, masterOrder) {
  const ids = new Set((masterOrder.childOrderIds || []).map(String));
  return data.salesOrders.filter((order) => ids.has(String(order.id)) || ids.has(String(order.code)) || String(order.masterOrderId || '') === String(masterOrder.id));
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

app.get('/api/master-orders/unmerged-child-orders', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    const source = String(req.query.source || '').trim().toUpperCase();
    const date = String(req.query.date || '').trim();

    let orders = data.salesOrders.filter((order) =>
      order.isChildOrder !== false &&
      (order.mergeStatus || 'unmerged') !== 'merged' &&
      !order.masterOrderId &&
      !['cancelled', 'delivery_failed_cancelled'].includes(order.status || '')
    );

    if (source) orders = orders.filter((order) => String(order.orderSource || 'NVBH').toUpperCase() === source);
    if (date) orders = orders.filter((order) => String(order.date || '').slice(0, 10) === date);
    if (q) {
      orders = orders.filter((order) =>
        normalizeText(order.code).includes(q) ||
        normalizeText(order.customerCode).includes(q) ||
        normalizeText(order.customerName).includes(q) ||
        normalizeText(order.customerPhone).includes(q) ||
        normalizeText(order.customerAddress).includes(q) ||
        normalizeText(order.orderSource).includes(q)
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
    let masterOrders = [...data.masterOrders];

    if (q) {
      masterOrders = masterOrders.filter((order) =>
        normalizeText(order.code).includes(q) ||
        normalizeText(order.routeName).includes(q) ||
        normalizeText(order.deliveryStaffCode).includes(q) ||
        normalizeText(order.deliveryStaffName).includes(q) ||
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
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
    const note = String(body.note || '').trim();

    if (!childOrderIds.length) return res.status(400).json({ ok: false, message: 'Chưa chọn đơn con để gộp' });
    if (!routeName) return res.status(400).json({ ok: false, message: 'Thiếu tên tuyến / khu vực giao hàng' });
    if (!deliveryStaffCode && !deliveryStaffName) return res.status(400).json({ ok: false, message: 'Thiếu nhân viên giao hàng' });

    const idSet = new Set(childOrderIds);
    const children = data.salesOrders.filter((order) => idSet.has(String(order.id)) || idSet.has(String(order.code)));
    if (children.length !== childOrderIds.length) return res.status(400).json({ ok: false, message: 'Có đơn con không tồn tại' });

    const invalid = children.find((order) => order.isChildOrder === false || order.masterOrderId || (order.mergeStatus || 'unmerged') === 'merged');
    if (invalid) return res.status(400).json({ ok: false, message: `Đơn ${invalid.code || invalid.id} đã gộp hoặc không phải đơn con` });

    const summary = summarizeMasterOrder(children);
    const masterOrder = {
      id: makeId('MO'),
      code: buildMasterOrderCode(data),
      date,
      routeName,
      deliveryStaffCode,
      deliveryStaffName,
      note,
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
      order.masterOrderId = masterOrder.id;
      order.masterOrderCode = masterOrder.code;
      order.mergeStatus = 'merged';
      order.deliveryStatus = order.deliveryStatus || 'pending';
      order.deliveryStaffCode = deliveryStaffCode;
      order.deliveryStaffName = deliveryStaffName;
      order.routeName = routeName;
      order.updatedAt = new Date().toISOString();
    });

    data.masterOrders.push(masterOrder);
    writeData(data);
    res.status(201).json({ ok: true, message: `Đã gộp ${children.length} đơn con thành đơn tổng ${masterOrder.code}`, masterOrder: { ...masterOrder, children } });
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
    children.forEach((order) => {
      order.masterOrderId = '';
      order.masterOrderCode = '';
      order.mergeStatus = 'unmerged';
      order.routeName = '';
      order.deliveryStaffCode = '';
      order.deliveryStaffName = '';
      order.updatedAt = new Date().toISOString();
    });

    masterOrder.status = 'cancelled';
    masterOrder.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ ok: true, message: `Đã hủy đơn tổng ${masterOrder.code} và trả đơn con về trạng thái chưa gộp`, masterOrder });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không hủy được đơn tổng', error: err.message });
  }
});

app.post('/api/sales-orders', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const customer = findCustomer(data, body.customerId || body.customerCode);
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
    const note = String(body.note || '').trim();
    const paidAmount = toNumber(body.paidAmount);
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!customer) return res.status(400).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    if (customer.isActive === false) return res.status(400).json({ ok: false, message: `Khách hàng đang ngừng giao dịch: ${customer.code}` });
    if (!rawItems.length) return res.status(400).json({ ok: false, message: 'Đơn bán chưa có dòng hàng' });

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productId || rawItem.productCode);
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

      items.push({ productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity, salePrice, amount: quantity * salePrice });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const promotionResult = calculateOrderPromotions(data, items, date);
    const grossAmount = promotionResult.grossAmount;
    const discountAmount = promotionResult.discountAmount;
    const totalAmount = promotionResult.totalAmount;
    const promotionSummary = promotionResult.promotionSummary;
    if (paidAmount < 0) return res.status(400).json({ ok: false, message: 'Tiền đã thu không được âm' });
    if (paidAmount > totalAmount) return res.status(400).json({ ok: false, message: 'Tiền đã thu không được lớn hơn tổng sau khuyến mại' });

    const debtAmount = totalAmount - paidAmount;
    const salesOrder = {
      id: makeId('SO'),
      code: buildSalesCode(data),
      date,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      note,
      orderSource: 'NVBH',
      orderSourceName: 'Từ NVBH',
      isChildOrder: true,
      masterOrderId: '',
      mergeStatus: 'unmerged',
      items,
      totalQuantity,
      grossAmount,
      discountAmount,
      promotionSummary,
      totalAmount,
      paidAmount,
      debtAmount,
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
      data.cashbook.push({
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
        staffName: '',
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

app.get('/api/debts', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let debts = buildCustomerDebtSummary(data);

    if (q) {
      debts = debts.filter((row) =>
        normalizeText(row.customerCode).includes(q) ||
        normalizeText(row.customerName).includes(q) ||
        normalizeText(row.phone).includes(q) ||
        normalizeText(row.address).includes(q)
      );
    }

    res.json({ ok: true, debts });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được công nợ', error: err.message });
  }
});

app.post('/api/debt-collections', (req, res) => {
  try {
    const data = readData();
    const body = req.body || {};
    const customer = findCustomer(data, body.customerId || body.customerCode);
    const amount = toNumber(body.amount);
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
    const staffName = String(body.staffName || '').trim();
    const note = String(body.note || '').trim();

    if (!customer) return res.status(400).json({ ok: false, message: 'Không tìm thấy khách hàng' });
    if (amount <= 0) return res.status(400).json({ ok: false, message: 'Số tiền thu phải lớn hơn 0' });

    const currentDebtRow = buildCustomerDebtSummary(data).find((row) => row.customerId === customer.id);
    const currentDebt = currentDebtRow ? currentDebtRow.debt : 0;
    if (currentDebt <= 0) return res.status(400).json({ ok: false, message: 'Khách hàng này hiện không còn công nợ phải thu' });
    if (amount > currentDebt) return res.status(400).json({ ok: false, message: `Số tiền thu lớn hơn công nợ hiện tại. Nợ hiện tại: ${currentDebt}` });

    const payment = {
      id: makeId('PM'),
      date,
      type: 'debt_collection',
      refType: 'debtCollection',
      refId: '',
      refCode: '',
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      debit: 0,
      credit: amount,
      note: note || `Thu công nợ khách hàng ${customer.code}`,
      createdAt: new Date().toISOString()
    };

    const cashEntry = {
      id: makeId('CB'),
      code: buildCashCode(data, 'in'),
      date,
      type: 'in',
      source: 'debt_collection',
      refType: 'debtCollection',
      refId: payment.id,
      refCode: '',
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      staffName,
      amount,
      note: note || `Thu công nợ khách hàng ${customer.code}`,
      createdAt: new Date().toISOString()
    };

    payment.refId = cashEntry.id;
    payment.refCode = cashEntry.code;

    data.payments.push(payment);
    data.cashbook.push(cashEntry);
    writeData(data);

    res.status(201).json({ ok: true, message: 'Đã thu công nợ và ghi tăng quỹ tiền', payment, cashEntry, debts: buildCustomerDebtSummary(data), cashSummary: getCashSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không thu được công nợ', error: err.message });
  }
});

// Cashbook
app.get('/api/cashbook', (req, res) => {
  try {
    const data = readData();
    const q = normalizeText(req.query.q);
    let cashbook = [...data.cashbook];

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
    res.json({ ok: true, cashbook, summary: getCashSummary(data) });
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
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
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

    data.cashbook.push(entry);
    writeData(data);

    res.status(201).json({ ok: true, message: type === 'in' ? 'Đã ghi phiếu thu quỹ' : 'Đã ghi phiếu chi quỹ', entry, summary: getCashSummary(data) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được quỹ tiền', error: err.message });
  }
});


// Import Excel templates
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

// Import Excel
app.post('/api/import/preview', upload.single('file'), (req, res) => {
  try {
    const type = String(req.body.type || '').trim();
    if (!type) return res.status(400).json({ ok: false, message: 'Thiếu loại import' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok: false, message: 'Chưa chọn file Excel' });

    const rows = parseExcelBuffer(req.file.buffer);
    if (!rows.length) return res.status(400).json({ ok: false, message: 'File Excel không có dữ liệu' });

    const data = readData();
    const preview = previewImport(type, rows, data);
    res.json({ ok: true, ...preview });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: err.message });
  }
});

app.post('/api/import/commit', (req, res) => {
  try {
    const type = String(req.body.type || '').trim();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!type) return res.status(400).json({ ok: false, message: 'Thiếu loại import' });
    if (!rows.length) return res.status(400).json({ ok: false, message: 'Chưa có dòng nào để import' });

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
    if (type === 'PAYMENT_RECEIPT') document = data.cashbook.find(entry => entry.id === id || entry.code === id);

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
  return Buffer.from(JSON.stringify({
    id: user.id || user.code || user.username || 'mobile-user',
    username: user.username || user.code || user.name || 'mobile',
    name: user.name || user.fullName || user.username || 'Nhân viên',
    code: user.code || '',
    role: user.role || user.type || 'sales',
    createdAt: new Date().toISOString()
  })).toString('base64url');
}

function decodeMobileToken(token) {
  try {
    return JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'));
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
  if (!user) return res.status(401).json({ ok: false, message: 'Phiên đăng nhập mobile không hợp lệ' });
  req.mobileUser = user;
  next();
}

function requireMobileRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.mobileUser?.role || '';
    if (role === 'admin' || allowedRoles.includes(role)) return next();
    return res.status(403).json({
      ok: false,
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
    barcode: product.barcode,
    category: product.category,
    price: toNumber(product.salePrice),
    salePrice: toNumber(product.salePrice),
    availableQty: stockRow ? toNumber(stockRow.quantity) : 0
  };
}

app.post('/api/mobile/login', (req, res) => {
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
      return candidateNames.includes(normalizeText(username)) && candidatePassword === password;
    });

    if (!staff && username === 'admin' && password === 'admin') {
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
    res.json({ ok: true, token: encodeMobileToken(user), user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đăng nhập được mobile app', error: err.message });
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

app.get('/api/mobile/products', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), (req, res) => {
  try {
    const data = readData();
    const q = String(req.query.q || '').trim();
    const items = data.products
      .filter(product => product.isActive !== false)
      .filter(product => !q || mobileMatchText(product, q, ['code', 'name', 'barcode', 'category']))
      .slice(0, 30)
      .map(product => buildMobileProduct(data, product));
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được sản phẩm mobile', error: err.message });
  }
});

app.get('/api/mobile/stock', requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery']), (req, res) => {
  try {
    const data = readData();
    const q = String(req.query.q || '').trim();
    const items = data.products
      .filter(product => product.isActive !== false)
      .filter(product => !q || mobileMatchText(product, q, ['code', 'name', 'barcode', 'category']))
      .slice(0, 100)
      .map(product => buildMobileProduct(data, product));
    res.json({ ok: true, items });
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
      const product = findProduct(data, rawItem.productId || rawItem.productCode || rawItem.code);
      if (!product) return res.status(400).json({ ok: false, message: `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || ''}` });
      const quantity = toNumber(rawItem.quantity || rawItem.qty);
      const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice);
      if (quantity <= 0) return res.status(400).json({ ok: false, message: `Số lượng phải lớn hơn 0: ${product.code}` });
      const stockRow = findStockRow(data, product);
      const availableQty = stockRow ? toNumber(stockRow.quantity) : 0;
      if (availableQty < quantity) return res.status(400).json({ ok: false, message: `Không đủ tồn mở bán: ${product.code}. Tồn ${availableQty}, cần ${quantity}` });
      items.push({ productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity, salePrice, amount: quantity * salePrice });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const promotionResult = calculateOrderPromotions(data, items, date);
    const grossAmount = promotionResult.grossAmount;
    const discountAmount = promotionResult.discountAmount;
    const totalAmount = promotionResult.totalAmount;
    const promotionSummary = promotionResult.promotionSummary;
    if (paidAmount > totalAmount) return res.status(400).json({ ok: false, message: 'Tiền thu không được lớn hơn tổng sau khuyến mại' });

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
      grossAmount,
      discountAmount,
      promotionSummary,
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
      data.cashbook.push({
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
    const items = data.salesOrders
      .filter(order => !['delivered', 'failed', 'cancelled'].includes(order.deliveryStatus || ''))
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100)
      .map(order => ({
        id: order.id,
        code: order.code,
        customerName: order.customerName,
        phone: order.customerPhone,
        address: order.customerAddress,
        amount: toNumber(order.debtAmount || order.totalAmount),
        totalAmount: toNumber(order.totalAmount),
        paidAmount: toNumber(order.paidAmount),
        debtAmount: toNumber(order.debtAmount),
        status: order.status,
        deliveryStatus: order.deliveryStatus || 'pending',
        items: order.items || []
      }));
    res.json({ ok: true, items });
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
      order.paidAmount = toNumber(order.paidAmount) + collectAmount;
      order.debtAmount = Math.max(0, toNumber(order.totalAmount) - toNumber(order.paidAmount));

      data.payments.push({
        id: makeId('PM'),
        date,
        type: 'delivery_collection',
        refType: 'salesOrder',
        refId: order.id,
        refCode: order.code,
        customerId: order.customerId,
        customerCode: order.customerCode,
        customerName: order.customerName,
        debit: 0,
        credit: collectAmount,
        note: `Giao hàng thu tiền đơn ${order.code}`,
        createdAt: new Date().toISOString()
      });

      data.cashbook.push({
        id: makeId('CB'),
        code: buildCashCode(data, 'in'),
        date,
        type: 'in',
        source: 'mobile_delivery_collection',
        refType: 'salesOrder',
        refId: order.id,
        refCode: order.code,
        customerId: order.customerId,
        customerCode: order.customerCode,
        customerName: order.customerName,
        staffName: req.mobileUser.name || '',
        amount: collectAmount,
        note: `Giao hàng thu tiền đơn ${order.code}`,
        createdAt: new Date().toISOString()
      });
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
    data.cashbook.push(entry);
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

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'API không tồn tại' });
});

async function startServer() {
  try {
    const store = await initDataStore({
      dataFilePath: DATA_FILE,
      createEmptyData,
      normalizeData,
      ensureDefaultStaffAccounts
    });

    app.listen(PORT, () => {
      console.log(`Server V44/V43 Mongo đang chạy tại http://localhost:${PORT}`);
      console.log(`Data mode: ${store.usingMongo ? 'MongoDB' : 'JSON fallback'}`);
      if (store.migratedFromJson) console.log('✅ Đã migrate dữ liệu kho-data.json lên MongoDB');
    });
  } catch (err) {
    console.error('❌ Không khởi động được server:', err);
    process.exit(1);
  }
}

startServer();
