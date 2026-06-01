'use strict';

const User = require('../models/User');
const { STAFF_ROLES } = require('../constants/business.constants');
const { normalizeCode } = require('./commonRules');
const { makeBusinessError } = require('../utils/businessError.util');

function roleList(type) {
  return type === 'delivery' ? STAFF_ROLES.DELIVERY : STAFF_ROLES.SALES;
}

function roleMatches(row = {}, type = 'sales') {
  const roles = roleList(type).map((r) => String(r).toLowerCase());
  const value = String(row.role || row.type || row.position || row.department || '').toLowerCase();
  if (roles.includes(value)) return true;
  if (type === 'sales') return row.isSalesman === true || row.isSalesStaff === true || row.salesStaff === true;
  return row.isDelivery === true || row.isDeliveryStaff === true || row.deliveryStaff === true;
}

async function resolveStaffByCode(staffCode, type = 'sales') {
  const code = normalizeCode(staffCode);
  if (!code) return null;
  const roles = roleList(type).map((r) => new RegExp(`^${String(r).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
  return User.findOne({
    isActive: { $ne: false },
    $and: [
      { $or: [{ staffCode: code }, { username: code }, { code }, { id: code }] },
      { $or: [{ role: { $in: roles } }] }
    ]
  }).lean();
}

async function resolveSalesStaffByCode(staffCode) {
  return resolveStaffByCode(staffCode, 'sales');
}

async function resolveDeliveryStaffByCode(staffCode) {
  return resolveStaffByCode(staffCode, 'delivery');
}

async function validateStaffCode(staffCode, type = 'sales', context = {}) {
  const code = normalizeCode(staffCode);
  const label = type === 'delivery' ? 'NVGH' : 'NVBH';
  if (!code) {
    return { valid: false, staff: null, error: makeBusinessError({ code: `MISSING_${label}_CODE`, message: `Thiếu mã ${label}`, orderCode: context.orderCode || '', field: type === 'delivery' ? 'deliveryStaffCode' : 'salesStaffCode' }) };
  }
  const staff = await resolveStaffByCode(code, type);
  if (!staff || !roleMatches(staff, type)) {
    return { valid: false, staff: null, error: makeBusinessError({ code: `INVALID_${label}_CODE`, message: `Mã ${label} ${code} không tồn tại trong danh sách tài khoản`, orderCode: context.orderCode || '', field: type === 'delivery' ? 'deliveryStaffCode' : 'salesStaffCode' }) };
  }
  return { valid: true, staff: { ...staff, code: staff.staffCode || staff.code || staff.username, name: staff.fullName || staff.name || staff.username }, error: null };
}

function validateSalesStaffCode(staffCode, context = {}) { return validateStaffCode(staffCode, 'sales', context); }
function validateDeliveryStaffCode(staffCode, context = {}) { return validateStaffCode(staffCode, 'delivery', context); }

module.exports = { resolveSalesStaffByCode, resolveDeliveryStaffByCode, validateSalesStaffCode, validateDeliveryStaffCode, roleMatches };
