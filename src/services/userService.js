'use strict';

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const queryGuard = require('../utils/queryGuard.util');
const { makeId, stripMongoFields } = require('../utils/common.util');
const catalogCache = require('./cache/catalogCache.service');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  accountant: 'Kế toán',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};
const VALID_ROLES = Object.keys(ROLE_LABELS);
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

function hashPasswordSync(password) {
  return bcrypt.hashSync(String(password || '123456'), BCRYPT_ROUNDS);
}

function pickStaffPayload(body = {}, current = null) {
  const role = VALID_ROLES.includes(String(body.role || current?.role || '').trim()) ? String(body.role || current?.role).trim() : 'sales';
  const code = String(body.code || body.staffCode || current?.staffCode || current?.code || body.username || '').trim();
  const username = String(body.username || current?.username || code).trim();
  const passwordInput = String(body.password || '').trim();
  const payload = {
    id: String(body.id || current?._id || current?.id || code || username || makeId('U')).trim(),
    code,
    staffCode: code,
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

function staffToClient(staff) {
  const raw = typeof staff?.toObject === 'function' ? staff.toObject() : (staff || {});
  const code = String(raw.staffCode || raw.code || raw.username || raw._id || '').trim();
  const role = VALID_ROLES.includes(String(raw.role || '').trim()) ? String(raw.role).trim() : 'sales';
  return {
    ...raw,
    id: raw._id ? String(raw._id) : (raw.id || code),
    _id: raw._id ? String(raw._id) : undefined,
    code,
    staffCode: raw.staffCode || code,
    username: raw.username || code,
    name: raw.name || raw.fullName || raw.username || code,
    fullName: raw.fullName || raw.name || raw.username || code,
    phone: raw.phone || '',
    role,
    roleLabel: ROLE_LABELS[role] || role,
    isActive: raw.isActive !== false,
    password: undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

async function listUsers(query = {}) {
  // V45 rule: mục Tài khoản phải đọc trực tiếp từ collection users trên MongoDB.
  // Không đọc collection staffs nữa, vì NVBH/NVGH và import đều lấy users.staffCode làm nguồn chuẩn.
  const guardedQuery = { ...(query || {}), page: query?.page || 1, limit: queryGuard.clampLimit(query?.limit) };
  const users = await userRepository.findUsers(guardedQuery);
  return users.map(staffToClient);
}

async function saveUser(body) {
  const id = String(body?.id || '').trim();
  const current = id ? await userRepository.findUserByIdOrCode(id) : null;
  const payload = pickStaffPayload(body, current);
  const error = validateStaff(payload);
  if (error) return { error, status: 400 };
  const duplicated = await userRepository.findDuplicateUser(payload.staffCode || payload.code, payload.username, current?._id);
  if (duplicated) return { error: 'Mã nhân viên hoặc tên đăng nhập đã tồn tại trong MongoDB', status: 409 };
  const saved = current ? await userRepository.updateUser(id, payload) : await userRepository.createUser(payload);
  catalogCache.invalidateCatalog('staffs');
  return { user: staffToClient(saved), created: !current };
}

async function deleteUser(id) {
  const staff = await userRepository.deleteUser(id);
  if (!staff) return { error: 'Không tìm thấy tài khoản trong collection users', status: 404 };
  catalogCache.invalidateCatalog('staffs');
  return { user: staffToClient(staff) };
}

async function listStaffs(query) {
  return listUsers(query);
}

async function listRoles() {
  const roles = await userRepository.findRoles();
  return roles.map(stripMongoFields);
}

async function listPermissions(roleCode) {
  const permissions = await userRepository.findPermissions(String(roleCode || '').trim());
  return permissions.map(stripMongoFields);
}

module.exports = {
  ROLE_LABELS,
  VALID_ROLES,
  listUsers,
  saveUser,
  deleteUser,
  listStaffs,
  listRoles,
  listPermissions,
  staffToClient,
  pickStaffPayload
};
