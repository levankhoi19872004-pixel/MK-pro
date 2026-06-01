'use strict';

const { normalizeCode } = require('./commonRules');
const staffRules = require('./staffRules');
const customerRules = require('./customerRules');
const productRules = require('./productRules');
const SalesOrder = require('../models/SalesOrder');
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

function getOrderCode(order = {}) {
  return normalizeCode(order.documentCode || order.orderCode || order.invoiceCode || order.code);
}

function getSourceFile(order = {}) {
  return cleanText(order.sourceFile || order.fileName || order.originalFileName || order.raw?.sourceFile || order.raw?.__sourceFile || '');
}

async function validateImportSalesOrder(order = {}, context = {}) {
  const orderCode = getOrderCode(order);
  const errors = [];
  const warnings = [];
  const resolved = {};

  if (!orderCode) pushUnique(errors, makeBusinessError({ code: 'MISSING_ORDER_CODE', message: 'Thiếu mã đơn / số hóa đơn', field: 'documentCode' }));

  const customerCode = normalizeCode(order.customerCode);
  const customerResult = await customerRules.validateCustomerCode(customerCode, { orderCode });
  if (!customerResult.valid) pushUnique(errors, customerResult.error);
  else {
    resolved.customerCode = customerResult.customer.code;
    resolved.customerName = customerResult.customer.name;
  }

  const salesStaffCode = normalizeCode(order.staffCode || order.salesStaffCode);
  const staffResult = await staffRules.validateSalesStaffCode(salesStaffCode, { orderCode });
  if (!staffResult.valid) pushUnique(errors, staffResult.error);
  else {
    resolved.salesStaffCode = staffResult.staff.code;
    resolved.salesStaffName = staffResult.staff.name;
  }

  const lines = Array.isArray(order.lineDetails) ? order.lineDetails : [];
  if (!lines.length) pushUnique(errors, makeBusinessError({ code: 'MISSING_ORDER_LINES', message: 'Đơn không có dòng hàng', orderCode, field: 'items' }));
  for (const line of lines) {
    const productCode = normalizeCode(line.productCode);
    const productResult = await productRules.validateProductCode(productCode, { orderCode });
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
    staffCode: resolved.salesStaffCode || salesStaffCode || order.staffCode || '',
    salesStaffCode: resolved.salesStaffCode || salesStaffCode || order.salesStaffCode || '',
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
  const validated = [];
  for (const order of orders || []) validated.push(await validateImportSalesOrder(order));

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

module.exports = { validateImportSalesOrder, validateImportBatch, findExistingOrderCodeSet };
