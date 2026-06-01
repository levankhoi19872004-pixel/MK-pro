'use strict';

const { normalizeCode } = require('./commonRules');
const staffRules = require('./staffRules');
const customerRules = require('./customerRules');
const productRules = require('./productRules');
const { makeBusinessError, makeBusinessWarning } = require('../utils/businessError.util');

function pushUnique(list, value) {
  if (!value) return;
  const message = typeof value === 'string' ? value : value.message;
  if (!message) return;
  if (!list.some((item) => (typeof item === 'string' ? item : item.message) === message)) list.push(value);
}

async function validateImportSalesOrder(order = {}, context = {}) {
  const orderCode = normalizeCode(order.documentCode || order.orderCode || order.code);
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

async function validateImportBatch(orders = []) {
  const seen = new Set();
  const out = [];
  for (const order of orders || []) {
    let row = await validateImportSalesOrder(order);
    const code = normalizeCode(row.documentCode || row.orderCode || row.code);
    if (code && seen.has(code)) {
      const msg = `Mã đơn / số hóa đơn ${code} bị trùng trong file preview`;
      row = { ...row, valid: false, canImport: false, errors: [...(row.errors || []), msg], businessErrors: [...(row.businessErrors || []), makeBusinessError({ code: 'DUPLICATE_ORDER_CODE_IN_BATCH', message: msg, orderCode: code, field: 'documentCode' })] };
    }
    if (code) seen.add(code);
    out.push(row);
  }
  return out;
}

module.exports = { validateImportSalesOrder, validateImportBatch };
