'use strict';

const { normalizeCode } = require('./commonRules');
const staffRules = require('./staffRules');
const SalesOrder = require('../models/SalesOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const User = require('../models/User');
const { makeBusinessError, makeBusinessWarning } = require('../utils/businessError.util');

function pushUnique(list, value) {
  if (!value) return;
  const message = typeof value === 'string' ? value : value.message;
  if (!message) return;
  if (!list.some((item) => (typeof item === 'string' ? item : item.message) === message)) list.push(value);
}

function cleanText(value) {
  return String(value ?? '').trim();
}


function normalizeImportHeaderKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function getObjectValueByAliases(obj = {}, aliases = []) {
  if (!obj || typeof obj !== 'object') return '';
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, alias) && cleanText(obj[alias])) return obj[alias];
  }
  const aliasSet = new Set(aliases.map(normalizeImportHeaderKey).filter(Boolean));
  for (const key of Object.keys(obj)) {
    if (aliasSet.has(normalizeImportHeaderKey(key)) && cleanText(obj[key])) return obj[key];
  }
  return '';
}

const IMPORT_SALES_STAFF_CODE_ALIASES = [
  'staffCode', 'salesStaffCode', 'salesmanCode', 'employeeCode', 'sellerCode', 'saleCode', 'salesCode',
  'Mã NVBH', 'Ma NVBH', 'Mã NVTT', 'Ma NVTT', 'Mã NV', 'Ma NV',
  'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên TT', 'Ma nhan vien TT',
  'Mã nhân viên bán hàng', 'Ma nhan vien ban hang', 'Mã NV bán hàng', 'Ma NV ban hang',
  'NV bán hàng', 'NV ban hang', 'Nhân viên bán hàng', 'Nhan vien ban hang',
  'Salesman Code', 'Sales Rep Code', 'Sales Staff Code', 'Seller Code', 'Employee Code',
  'Mã nhân viên', 'Mã NVBH', 'Mã NVTT'
];

function extractSalesStaffCode(order = {}) {
  const direct = getObjectValueByAliases(order, IMPORT_SALES_STAFF_CODE_ALIASES);
  if (direct) return normalizeCode(direct);
  const raw = getObjectValueByAliases(order.raw || {}, IMPORT_SALES_STAFF_CODE_ALIASES);
  if (raw) return normalizeCode(raw);
  const rows = Array.isArray(order.__importRows) ? order.__importRows : [];
  for (const row of rows) {
    const value = getObjectValueByAliases(row, IMPORT_SALES_STAFF_CODE_ALIASES);
    if (value) return normalizeCode(value);
  }
  const adjustedRows = Array.isArray(order.__adjustedRows) ? order.__adjustedRows : [];
  for (const row of adjustedRows) {
    const value = getObjectValueByAliases(row, IMPORT_SALES_STAFF_CODE_ALIASES);
    if (value) return normalizeCode(value);
  }
  return '';
}

function getOrderCode(order = {}) {
  return normalizeCode(order.documentCode || order.orderCode || order.invoiceCode || order.code);
}

function getSourceFile(order = {}) {
  return cleanText(order.sourceFile || order.fileName || order.originalFileName || order.raw?.sourceFile || order.raw?.__sourceFile || '');
}

function addMapAlias(map, value, row) {
  const key = normalizeCode(value);
  if (key && row) map.set(key, row);
}

function getLineProductCode(line = {}) {
  return normalizeCode(line.productCode || line.code || line.sku || line.barcode || line.productId || line.itemCode);
}

function getUserRealCode(user = {}, fallback = '') {
  return cleanText(user.staffCode || user.code || user.employeeCode || user.salesStaffCode || user.deliveryStaffCode || user.maNhanVien || user.employeeId || user.staffId || user.username || fallback);
}

async function buildImportValidationContext(orders = []) {
  const customerCodes = new Set();
  const productCodes = new Set();
  const staffCodes = new Set();

  for (const order of orders || []) {
    const customerCode = normalizeCode(order.customerCode);
    const salesStaffCode = extractSalesStaffCode(order);
    if (customerCode) customerCodes.add(customerCode);
    if (salesStaffCode) staffCodes.add(salesStaffCode);
    const lines = Array.isArray(order.lineDetails) ? order.lineDetails : [];
    for (const line of lines) {
      const productCode = getLineProductCode(line);
      if (productCode) productCodes.add(productCode);
    }
  }

  const [customers, products, users] = await Promise.all([
    customerCodes.size ? Customer.find({ isActive: { $ne: false }, $or: [
      { code: { $in: Array.from(customerCodes) } },
      { customerCode: { $in: Array.from(customerCodes) } },
      { phone: { $in: Array.from(customerCodes) } },
      { id: { $in: Array.from(customerCodes) } }
    ] }).lean().catch(() => []) : [],
    productCodes.size ? Product.find({ isActive: { $ne: false }, $or: [
      { code: { $in: Array.from(productCodes) } },
      { productCode: { $in: Array.from(productCodes) } },
      { sku: { $in: Array.from(productCodes) } },
      { barcode: { $in: Array.from(productCodes) } },
      { id: { $in: Array.from(productCodes) } }
    ] }).lean().catch(() => []) : [],
    staffCodes.size ? User.find({ isActive: { $ne: false }, $or: [
      { staffCode: { $in: Array.from(staffCodes) } },
      { code: { $in: Array.from(staffCodes) } },
      { employeeCode: { $in: Array.from(staffCodes) } },
      { salesStaffCode: { $in: Array.from(staffCodes) } },
      { deliveryStaffCode: { $in: Array.from(staffCodes) } },
      { username: { $in: Array.from(staffCodes) } },
      { maNhanVien: { $in: Array.from(staffCodes) } },
      { employeeId: { $in: Array.from(staffCodes) } },
      { staffId: { $in: Array.from(staffCodes) } }
    ] }).select('id staffCode code employeeCode salesStaffCode deliveryStaffCode username maNhanVien employeeId staffId name fullName phone role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive').lean().catch(() => []) : []
  ]);

  const customerMap = new Map();
  customers.forEach((c) => [c.code, c.customerCode, c.phone, c.id, String(c._id || '')].forEach((v) => addMapAlias(customerMap, v, c)));

  const productMap = new Map();
  products.forEach((p) => [p.code, p.productCode, p.sku, p.barcode, p.id, String(p._id || '')].forEach((v) => addMapAlias(productMap, v, p)));

  const salesStaffMap = new Map();
  users.forEach((u) => {
    const aliases = [u.staffCode, u.code, u.employeeCode, u.salesStaffCode, u.deliveryStaffCode, u.username, u.maNhanVien, u.employeeId, u.staffId, String(u._id || '')];
    aliases.forEach((v) => addMapAlias(salesStaffMap, v, u));
  });

  return { customerMap, productMap, salesStaffMap };
}

function validateCustomerFromContext(customerCode, context = {}, orderCode = '') {
  const code = normalizeCode(customerCode);
  if (!code) return { valid: false, customer: null, error: makeBusinessError({ code: 'MISSING_CUSTOMER_CODE', message: 'Thiếu mã khách hàng', orderCode, field: 'customerCode' }) };
  const customer = context.customerMap?.get(code);
  if (!customer) return { valid: false, customer: null, error: makeBusinessError({ code: 'INVALID_CUSTOMER_CODE', message: `Mã khách hàng ${code} không tồn tại trong danh mục khách hàng`, orderCode, field: 'customerCode' }) };
  return { valid: true, customer: { ...customer, code: customer.code || customer.customerCode || code, name: customer.name || customer.customerName || '' }, error: null };
}

function validateSalesStaffFromContext(staffCode, context = {}, orderCode = '') {
  const code = normalizeCode(staffCode);
  if (!code) return { valid: false, staff: null, error: makeBusinessError({ code: 'MISSING_NVBH_CODE', message: 'Thiếu mã NVBH', orderCode, field: 'salesStaffCode' }) };
  const staff = context.salesStaffMap?.get(code);
  if (!staff) return { valid: false, staff: null, error: makeBusinessError({ code: 'INVALID_NVBH_CODE', message: `Mã NVBH ${code} không tồn tại trong danh sách tài khoản`, orderCode, field: 'salesStaffCode' }) };
  return { valid: true, staff: { ...staff, code: getUserRealCode(staff, code), name: staff.fullName || staff.name || staff.username || '' }, error: null };
}

function validateProductFromContext(productCode, context = {}, orderCode = '') {
  const code = normalizeCode(productCode);
  if (!code) return { valid: false, product: null, error: makeBusinessError({ code: 'MISSING_PRODUCT_CODE', message: 'Thiếu mã sản phẩm', orderCode, field: 'productCode' }) };
  const product = context.productMap?.get(code);
  if (!product) return { valid: false, product: null, error: makeBusinessError({ code: 'INVALID_PRODUCT_CODE', message: `Mã sản phẩm ${code} không tồn tại trong danh mục sản phẩm`, orderCode, field: 'productCode' }) };
  return { valid: true, product: { ...product, code: product.code || product.productCode || product.sku || code, name: product.name || product.productName || '' }, error: null };
}

async function validateImportSalesOrder(order = {}, context = {}) {
  const orderCode = getOrderCode(order);
  const errors = [];
  const warnings = [];
  const resolved = {};

  if (!orderCode) pushUnique(errors, makeBusinessError({ code: 'MISSING_ORDER_CODE', message: 'Thiếu mã đơn / số hóa đơn', field: 'documentCode' }));

  const customerCode = normalizeCode(order.customerCode);
  const customerResult = context.customerMap ? validateCustomerFromContext(customerCode, context, orderCode) : { valid: false, customer: null, error: makeBusinessError({ code: 'INVALID_CUSTOMER_CODE', message: `Mã khách hàng ${customerCode || '-'} chưa được preload`, orderCode, field: 'customerCode' }) };
  if (!customerResult.valid) pushUnique(errors, customerResult.error);
  else {
    resolved.customerCode = customerResult.customer.code;
    resolved.customerName = customerResult.customer.name;
  }

  const salesStaffCode = extractSalesStaffCode(order);
  const staffResult = context.salesStaffMap ? validateSalesStaffFromContext(salesStaffCode, context, orderCode) : await staffRules.validateSalesStaffCode(salesStaffCode, { orderCode });
  if (!staffResult.valid) pushUnique(errors, staffResult.error);
  else {
    // Quy tắc chuẩn: mã NVBH lưu theo mã đọc trực tiếp từ file Excel import.
    // Tên NVBH được tra từ users Mongo theo mã Excel.
    resolved.salesStaffCode = salesStaffCode;
    resolved.salesStaffName = staffResult.staff.name;
  }

  const lines = Array.isArray(order.lineDetails) ? order.lineDetails : [];
  if (!lines.length) pushUnique(errors, makeBusinessError({ code: 'MISSING_ORDER_LINES', message: 'Đơn không có dòng hàng', orderCode, field: 'items' }));
  for (const line of lines) {
    const productCode = getLineProductCode(line);
    const productResult = context.productMap ? validateProductFromContext(productCode, context, orderCode) : { valid: false, product: null, error: makeBusinessError({ code: 'INVALID_PRODUCT_CODE', message: `Mã sản phẩm ${productCode || '-'} chưa được preload`, orderCode, field: 'productCode' }) };
    if (!productResult.valid) pushUnique(errors, { ...productResult.error, rowNo: line.rowNo || '' });
    if (Number(line.saleQuantity ?? line.requestedQuantity ?? line.quantity ?? 0) < 0) {
      pushUnique(errors, makeBusinessError({ code: 'INVALID_QUANTITY', message: `Số lượng sản phẩm ${productCode || '-'} không hợp lệ`, orderCode, field: 'quantity' }));
    }
  }

  if (order.hasShortage || Number(order.shortageCount || 0) > 0) {
    pushUnique(warnings, makeBusinessWarning({ code: 'INVENTORY_SHORTAGE', message: `Đơn ${orderCode || '-'} có hàng vượt tồn, hệ thống sẽ tự cắt theo tồn thực tế`, orderCode, field: 'inventory' }));
  }

  const flatErrors = errors.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
  const flatWarnings = warnings.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
  return {
    ...order,
    sourceFile: getSourceFile(order),
    fileName: getSourceFile(order),
    documentCode: order.documentCode || orderCode,
    orderCode: order.orderCode || orderCode,
    customerCode: resolved.customerCode || customerCode || order.customerCode || '',
    customerName: resolved.customerName || order.customerName || '',
    staffCode: salesStaffCode || resolved.salesStaffCode || order.staffCode || '',
    salesStaffCode: salesStaffCode || resolved.salesStaffCode || order.salesStaffCode || '',
    staffName: resolved.salesStaffName || order.staffName || '',
    salesStaffName: resolved.salesStaffName || order.salesStaffName || order.staffName || '',
    resolved,
    businessErrors: errors,
    businessWarnings: warnings,
    errors: [...new Set([...(order.errors || []), ...flatErrors])],
    warnings: [...new Set([...(order.warnings || []), ...flatWarnings])],
    valid: (order.valid !== false) && errors.length === 0 && (!Array.isArray(order.errors) || order.errors.length === 0),
    canImport: (order.valid !== false) && errors.length === 0 && (!Array.isArray(order.errors) || order.errors.length === 0)
  };
}

async function findExistingOrderCodeSet(orderCodes = []) {
  const codes = Array.from(new Set((orderCodes || []).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Set();
  const rows = await SalesOrder.find({
    $or: [
      { documentCode: { $in: codes } },
      { invoiceCode: { $in: codes } },
      { code: { $in: codes } }
    ]
  }).select('documentCode invoiceCode code').lean().catch(() => []);
  return new Set(rows.flatMap((row) => [row.documentCode, row.invoiceCode, row.code]).map(cleanText).filter(Boolean));
}

async function validateImportBatch(orders = []) {
  const context = await buildImportValidationContext(orders);
  const validated = [];
  for (const order of orders || []) validated.push(await validateImportSalesOrder(order, context));

  const byCode = new Map();
  validated.forEach((row, index) => {
    const code = getOrderCode(row);
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push({ row, index });
  });

  for (const [code, items] of byCode.entries()) {
    if (items.length <= 1) continue;
    const files = Array.from(new Set(items.map((item) => getSourceFile(item.row)).filter(Boolean)));
    const suffix = files.length ? ` giữa các file: ${files.join(', ')}` : ' trong batch preview';
    const msg = `Mã đơn / số hóa đơn ${code} bị trùng${suffix}`;
    items.forEach(({ index }) => {
      const row = validated[index];
      validated[index] = {
        ...row,
        valid: false,
        canImport: false,
        errors: [...new Set([...(row.errors || []), msg])],
        businessErrors: [...(row.businessErrors || []), makeBusinessError({ code: 'DUPLICATE_ORDER_CODE_IN_BATCH', message: msg, orderCode: code, field: 'documentCode' })]
      };
    });
  }

  const existingCodeSet = await findExistingOrderCodeSet(Array.from(byCode.keys()));
  validated.forEach((row, index) => {
    const code = getOrderCode(row);
    if (!code || !existingCodeSet.has(code)) return;
    const msg = `Mã đơn / số hóa đơn ${code} đã tồn tại trong hệ thống`;
    validated[index] = {
      ...row,
      valid: false,
      canImport: false,
      errors: [...new Set([...(row.errors || []), msg])],
      businessErrors: [...(row.businessErrors || []), makeBusinessError({ code: 'DUPLICATE_ORDER_CODE_IN_DATABASE', message: msg, orderCode: code, field: 'documentCode' })]
    };
  });

  return validated;
}

module.exports = { validateImportSalesOrder, validateImportBatch, findExistingOrderCodeSet, buildImportValidationContext };
