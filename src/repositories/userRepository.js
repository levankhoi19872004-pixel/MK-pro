'use strict';

const Staff = require('../models/Staff');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const { buildIdentityFilter } = require('../utils/identity.util');
const { getPagination } = require('../utils/query.util');

function buildStaffMongoFilter(idOrCode) {
  return buildIdentityFilter(idOrCode, ['id', 'code', 'username']);
}

function buildStaffQueryFilter(query = {}) {
  const q = String(query.q || query.search || query.keyword || '').trim();
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };

  const roleRaw = String(query.role || query.roles || '').trim().toLowerCase();
  if (roleRaw) {
    const roleValues = roleRaw.split(',').map(v => v.trim()).filter(Boolean);
    const expandedRoles = new Set();
    roleValues.forEach(role => {
      if (['sales', 'sale', 'nvbh', 'banhang', 'ban_hang', 'salesstaff', 'sales_staff'].includes(role)) {
        ['sales', 'sale', 'nvbh', 'NVBH', 'salesStaff', 'sales_staff', 'admin'].forEach(v => expandedRoles.add(v));
      } else if (['delivery', 'shipper', 'nvgh', 'giaohang', 'giao_hang', 'deliverystaff', 'delivery_staff'].includes(role)) {
        ['delivery', 'shipper', 'nvgh', 'NVGH', 'deliveryStaff', 'delivery_staff', 'admin'].forEach(v => expandedRoles.add(v));
      } else {
        expandedRoles.add(role);
      }
    });
    if (expandedRoles.size) filter.role = { $in: Array.from(expandedRoles) };
  }
  if (q) {
    filter.$or = [
      { code: { $regex: q, $options: 'i' } },
      { username: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
      { fullName: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { role: { $regex: q, $options: 'i' } }
    ];
  }
  return filter;
}

async function findStaffs(query = {}) {
  const page = getPagination({ page: query.page || 1, limit: query.limit || 50 });
  return Staff.find(buildStaffQueryFilter(query))
    .sort({ code: 1, username: 1 })
    .skip(page.skip)
    .limit(Math.min(page.limit || 50, 100))
    .lean();
}

async function findStaffByIdOrCode(idOrCode) {
  return Staff.findOne(buildStaffMongoFilter(idOrCode)).lean();
}

async function findDuplicateStaff(code, username, exceptId) {
  const clauses = [];
  if (code) clauses.push({ code });
  if (username) clauses.push({ username });
  if (!clauses.length) return null;
  const filter = { $or: clauses };
  if (exceptId) filter._id = { $ne: exceptId };
  return Staff.findOne(filter).select('_id code username').lean();
}

async function createStaff(payload) {
  return Staff.create(payload);
}

async function updateStaff(idOrCode, payload) {
  return Staff.findOneAndUpdate(buildStaffMongoFilter(idOrCode), payload, { new: true, runValidators: false }).lean();
}

async function deleteStaff(idOrCode) {
  return Staff.findOneAndDelete(buildStaffMongoFilter(idOrCode)).lean();
}

async function findRoles() {
  return Role.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean();
}

async function findPermissions(roleCode = '') {
  const filter = roleCode ? { roleCode } : {};
  return Permission.find(filter).sort({ roleCode: 1, module: 1 }).lean();
}

module.exports = {
  buildStaffMongoFilter,
  findStaffs,
  findStaffByIdOrCode,
  findDuplicateStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  findRoles,
  findPermissions
};
