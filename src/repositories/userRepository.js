'use strict';

const Staff = require('../models/Staff');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const { buildIdentityFilter } = require('../utils/identity.util');

function buildStaffMongoFilter(idOrCode) {
  return buildIdentityFilter(idOrCode, ['id', 'code', 'username']);
}

function buildStaffQueryFilter(query = {}) {
  const q = String(query.q || '').trim();
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
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
  return Staff.find(buildStaffQueryFilter(query)).sort({ code: 1, username: 1 }).lean();
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
