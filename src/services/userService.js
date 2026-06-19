'use strict';

const userRepository = require('../repositories/userRepository');
const queryGuard = require('../utils/queryGuard.util');
const { makeId, stripMongoFields } = require('../utils/common.util');
const { isBcryptHash, hashPasswordSync } = require('../security/passwordPolicy');

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  warehouse: 'Kho',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};
const VALID_ROLES = Object.keys(ROLE_LABELS);
function pickStaffPayload(body = {}, current = null) {
  const role = VALID_ROLES.includes(String(body.role || current?.role || '').trim()) ? String(body.role || current?.role).trim() : 'sales';
  const code = String(body.code || body.staffCode || current?.staffCode || current?.code || '').trim();
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
  if (passwordInput) {
    payload.password = isBcryptHash(passwordInput) ? passwordInput : hashPasswordSync(passwordInput, { username, staffCode: code, code, phone: payload.phone });
  } else if (current?.password) {
    payload.password = current.password;
  } else {
    throw new Error('Tạo tài khoản mới bắt buộc nhập mật khẩu');
  }
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
  const code = String(raw.staffCode || raw.code || '').trim();
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


function identityValues(user = {}) {
  return [user._id, user.id, user.username, user.staffCode, user.code]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function isSameUserIdentity(user = {}, actor = {}) {
  const target = new Set(identityValues(user));
  return identityValues(actor).some((value) => target.has(value));
}

async function validateAdminContinuity(current, nextPayload, actor = {}) {
  if (!current) return '';
  const demotesActiveAdmin = current.role === 'admin' && (nextPayload.role !== 'admin' || nextPayload.isActive === false);
  if (!demotesActiveAdmin) return '';
  if (isSameUserIdentity(current, actor)) return 'Không được tự hạ quyền hoặc vô hiệu hóa tài khoản admin đang đăng nhập';
  const otherAdmins = await userRepository.countUsers({
    role: 'admin',
    isActive: { $ne: false },
    _id: { $ne: current._id }
  });
  return otherAdmins > 0 ? '' : 'Hệ thống phải luôn còn ít nhất một tài khoản admin hoạt động';
}

async function listUsers(query = {}) {
  // V45 rule: mục Tài khoản phải đọc trực tiếp từ collection users trên MongoDB.
  // Không đọc collection staffs nữa, vì NVBH/NVGH và import đều lấy users.staffCode làm nguồn chuẩn.
  const guardedQuery = { ...(query || {}), page: query?.page || 1, limit: queryGuard.clampLimit(query?.limit) };
  const users = await userRepository.findUsers(guardedQuery);
  return users.map(staffToClient);
}

async function saveUser(body, options = {}) {
  const id = String(body?.id || '').trim();
  const current = id ? await userRepository.findUserByIdOrCode(id) : null;
  let payload;
  try {
    payload = pickStaffPayload(body, current);
  } catch (err) {
    return { error: err.message || 'Mật khẩu không hợp lệ', status: 400 };
  }
  const error = validateStaff(payload);
  if (error) return { error, status: 400 };
  const continuityError = await validateAdminContinuity(current, payload, options.actor || {});
  if (continuityError) return { error: continuityError, status: 409 };
  const duplicated = await userRepository.findDuplicateUser(payload.staffCode || payload.code, payload.username, current?._id);
  if (duplicated) return { error: 'Mã nhân viên hoặc tên đăng nhập đã tồn tại trong MongoDB', status: 409 };
  const saved = current ? await userRepository.updateUser(id, payload) : await userRepository.createUser(payload);
  return { user: staffToClient(saved), created: !current };
}

async function deleteUser(id, options = {}) {
  const current = await userRepository.findUserByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy tài khoản trong collection users', status: 404 };
  if (isSameUserIdentity(current, options.actor || {})) {
    return { error: 'Không được tự vô hiệu hóa tài khoản đang đăng nhập', status: 409 };
  }
  if (current.role === 'admin' && current.isActive !== false) {
    const otherAdmins = await userRepository.countUsers({
      role: 'admin',
      isActive: { $ne: false },
      _id: { $ne: current._id }
    });
    if (otherAdmins < 1) return { error: 'Hệ thống phải luôn còn ít nhất một tài khoản admin hoạt động', status: 409 };
  }
  const actor = options.actor || {};
  const staff = await userRepository.deactivateUser(id, {
    actorCode: actor.staffCode || actor.code || actor.username || '',
    reason: options.reason || 'Ngừng hoạt động qua API DELETE'
  });
  return { user: staffToClient(staff), deactivated: true };
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
  pickStaffPayload,
  isSameUserIdentity,
  validateAdminContinuity
};
