'use strict';

const User = require('../models/User');
const { STAFF_ROLES } = require('../constants/business.constants');
const { normalizeCode } = require('./commonRules');
const { makeBusinessError } = require('../utils/businessError.util');

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roleList(type) {
  return type === 'delivery' ? STAFF_ROLES.DELIVERY : STAFF_ROLES.SALES;
}

function normalizeRoleText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');
}

function roleMatches(row = {}, type = 'sales') {
  const allowed = roleList(type).map(normalizeRoleText);
  const roleValues = [
    row.role,
    row.type,
    row.position,
    row.department,
    row.roleLabel,
    row.group,
    row.team
  ].map(normalizeRoleText).filter(Boolean);

  if (roleValues.some((value) => allowed.includes(value))) return true;

  if (type === 'sales') {
    if (row.isSalesman === true || row.isSalesStaff === true || row.salesStaff === true) return true;
    return roleValues.some((value) => ['banhang', 'nhanvienbanhang', 'nvbanhang', 'nvbh', 'sales', 'salesstaff'].includes(value));
  }

  if (row.isDelivery === true || row.isDeliveryStaff === true || row.deliveryStaff === true) return true;
  return roleValues.some((value) => ['giaohang', 'nhanviengiaohang', 'nvgiaohang', 'nvgh', 'delivery', 'deliverystaff', 'shipper'].includes(value));
}

function codeCandidates(staffCode) {
  const code = normalizeCode(staffCode);
  if (!code) return [];
  const values = new Set([code, String(staffCode).trim()]);
  if (/^\d+$/.test(code)) values.add(Number(code));
  return Array.from(values).filter((value) => value !== '' && value !== null && value !== undefined);
}

function buildCodeFilter(staffCode) {
  const values = codeCandidates(staffCode);
  const textValues = values.filter((value) => typeof value === 'string');
  const numericValues = values.filter((value) => typeof value === 'number');
  const exactRegexes = textValues.map((value) => new RegExp(`^${escapeRegex(value)}$`, 'i'));

  // Quy tắc V45: mã NVBH/NVGH lấy từ tài khoản trong collection users.
  // Ưu tiên users.staffCode, nhưng nhiều dữ liệu cũ lưu mã nhân viên ở users.code.
  // Không dùng username/id để tránh tài khoản chung như `banhang`, `giaohang` bị nhận nhầm.
  // STAFF_CODE_MATCH_SAFE_FIELDS_START
  const codeFields = [
    'staffCode',
    'code',
    'employeeCode',
    'salesStaffCode',
    'deliveryStaffCode',
    'maNhanVien',
    'employeeId',
    'staffId'
  ];
  // STAFF_CODE_MATCH_SAFE_FIELDS_END
  const clauses = [];
  for (const field of codeFields) {
    if (textValues.length) clauses.push({ [field]: { $in: textValues } });
    if (numericValues.length) clauses.push({ [field]: { $in: numericValues } });
    for (const rx of exactRegexes) clauses.push({ [field]: rx });
  }
  return clauses;
}

async function resolveStaffByCode(staffCode, type = 'sales') {
  const code = normalizeCode(staffCode);
  if (!code) return null;

  const codeFilter = buildCodeFilter(code);
  if (!codeFilter.length) return null;

  const candidates = await User.find({
    isActive: { $ne: false },
    $or: codeFilter
  })
    .select('id staffCode code employeeCode salesStaffCode deliveryStaffCode username name fullName phone role type position department roleLabel isSalesman isSalesStaff salesStaff isDelivery isDeliveryStaff deliveryStaff isActive')
    .lean()
    .catch(() => []);

  // Ưu tiên đúng vai trò NVBH/NVGH nếu tài khoản có khai báo role.
  const matched = candidates.find((row) => roleMatches(row, type));
  if (matched) return matched;

  // Dữ liệu users cũ có thể chỉ lưu mã nhân viên nhưng chưa gắn role chuẩn.
  // Với import DMS, quy tắc nghiệp vụ là: mã NVBH phải tồn tại trong users Mongo.
  // Vì vậy cho phép fallback theo mã exact để tránh báo sai "Thiếu/không tồn tại mã NVBH"
  // khi tài khoản chưa được chuẩn hóa role.
  return candidates[0] || null;
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
  if (!staff) {
    return { valid: false, staff: null, error: makeBusinessError({ code: `INVALID_${label}_CODE`, message: `Mã ${label} ${code} không tồn tại trong danh sách tài khoản`, orderCode: context.orderCode || '', field: type === 'delivery' ? 'deliveryStaffCode' : 'salesStaffCode' }) };
  }
  // STAFF_REAL_CODE_NO_USERNAME_START
  const realCode = staff.staffCode || staff.code || staff.employeeCode || staff.salesStaffCode || staff.deliveryStaffCode || staff.maNhanVien || staff.employeeId || staff.staffId || code;
  // STAFF_REAL_CODE_NO_USERNAME_END
  return { valid: true, staff: { ...staff, code: String(realCode || '').trim(), name: staff.fullName || staff.name || staff.username }, error: null };
}

function validateSalesStaffCode(staffCode, context = {}) { return validateStaffCode(staffCode, 'sales', context); }
function validateDeliveryStaffCode(staffCode, context = {}) { return validateStaffCode(staffCode, 'delivery', context); }

module.exports = { resolveSalesStaffByCode, resolveDeliveryStaffByCode, validateSalesStaffCode, validateDeliveryStaffCode, roleMatches };
