'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const { getPagination } = require('../utils/query.util');

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserMongoFilter(idOrCode) {
  const value = String(idOrCode || '').trim();
  if (!value) return { _id: null };
  const ors = [
    { username: value },
    { staffCode: value },
    { code: value }
  ];
  if (mongoose.Types.ObjectId.isValid(value)) ors.push({ _id: value });
  return { $or: ors };
}

function normalizeRoleAlias(role = '') {
  const text = String(role || '').trim().toLowerCase();
  if (['sale', 'sales', 'nvbh', 'banhang', 'ban_hang', 'salesstaff', 'sales_staff'].includes(text)) return 'sales';
  if (['delivery', 'shipper', 'nvgh', 'giaohang', 'giao_hang', 'deliverystaff', 'delivery_staff'].includes(text)) return 'delivery';
  if (['accountant', 'ketoan', 'ke_toan'].includes(text)) return 'accountant';
  if (['warehouse', 'kho'].includes(text)) return 'warehouse';
  if (['manager', 'quanly', 'quan_ly'].includes(text)) return 'manager';
  if (['admin', 'administrator'].includes(text)) return 'admin';
  return text;
}

function buildUserQueryFilter(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };

  const roleRaw = String(query.role || query.roles || '').trim();
  if (roleRaw) {
    const roles = roleRaw.split(',').map(normalizeRoleAlias).filter(Boolean);
    if (roles.length) filter.role = { $in: [...new Set(roles)] };
  }

  if (q) {
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [
      { staffCode: regex },
      { code: regex },
      { username: regex },
      { fullName: regex },
      { name: regex },
      { phone: regex },
      { role: regex }
    ];
  }
  return filter;
}

async function findUsers(query = {}) {
  const page = getPagination({ page: query.page || 1, limit: query.limit || 50 });
  return User.find(buildUserQueryFilter(query))
    .sort({ staffCode: 1, username: 1 })
    .skip(page.skip)
    .limit(Math.min(page.limit || 50, 100))
    .lean();
}

async function findUserByIdOrCode(idOrCode) {
  return User.findOne(buildUserMongoFilter(idOrCode)).lean();
}

async function findDuplicateUser(staffCode, username, exceptId) {
  const clauses = [];
  if (staffCode) clauses.push({ staffCode });
  if (staffCode) clauses.push({ code: staffCode });
  if (username) clauses.push({ username });
  if (!clauses.length) return null;
  const filter = { $or: clauses };
  if (exceptId && mongoose.Types.ObjectId.isValid(String(exceptId))) filter._id = { $ne: exceptId };
  return User.findOne(filter).select('_id staffCode code username').lean();
}

async function createUser(payload) {
  return User.create(payload);
}

async function updateUser(idOrCode, payload) {
  return User.findOneAndUpdate(buildUserMongoFilter(idOrCode), payload, { new: true, runValidators: false }).lean();
}

async function deleteUser(idOrCode) {
  return User.findOneAndDelete(buildUserMongoFilter(idOrCode)).lean();
}

async function findRoles() {
  return Role.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean();
}

async function findPermissions(roleCode = '') {
  const filter = roleCode ? { roleCode } : {};
  return Permission.find(filter).sort({ roleCode: 1, module: 1 }).lean();
}

module.exports = {
  buildUserMongoFilter,
  findUsers,
  findUserByIdOrCode,
  findDuplicateUser,
  createUser,
  updateUser,
  deleteUser,
  findRoles,
  findPermissions
};
