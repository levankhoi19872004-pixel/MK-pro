'use strict';

const Customer = require('../models/Customer');
const { normalizeCode } = require('./commonRules');
const { makeBusinessError } = require('../utils/businessError.util');

async function resolveCustomerByCode(customerCode) {
  const code = normalizeCode(customerCode);
  if (!code) return null;
  return Customer.findOne({ isActive: { $ne: false }, $or: [{ code }, { customerCode: code }, { id: code }, { phone: code }] }).lean();
}

async function validateCustomerCode(customerCode, context = {}) {
  const code = normalizeCode(customerCode);
  if (!code) return { valid: false, customer: null, error: makeBusinessError({ code: 'MISSING_CUSTOMER_CODE', message: 'Thiếu mã khách hàng', orderCode: context.orderCode || '', field: 'customerCode' }) };
  const customer = await resolveCustomerByCode(code);
  if (!customer) return { valid: false, customer: null, error: makeBusinessError({ code: 'INVALID_CUSTOMER_CODE', message: `Mã khách hàng ${code} không tồn tại trong danh mục khách hàng`, orderCode: context.orderCode || '', field: 'customerCode' }) };
  return { valid: true, customer: { ...customer, code: customer.code || customer.customerCode || code, name: customer.name || customer.customerName || '' }, error: null };
}

module.exports = { resolveCustomerByCode, validateCustomerCode };
