'use strict';

const SalesTarget = require('../../models/SalesTarget');
const User = require('../../models/User');

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_TARGET_ROWS = 200;

function assertPeriod(period) {
  const value = String(period || '').trim();
  if (!PERIOD_PATTERN.test(value)) {
    const error = new Error('Tháng chỉ tiêu phải có định dạng YYYY-MM');
    error.status = 400;
    error.code = 'INVALID_SALES_TARGET_PERIOD';
    throw error;
  }
  return value;
}

function normalizeActor(user = {}) {
  return {
    userId: String(user.id || user._id || user.userId || ''),
    username: String(user.username || ''),
    name: String(user.name || user.fullName || '')
  };
}

function normalizeTargetAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error('Chỉ tiêu phải là số không âm');
    error.status = 400;
    error.code = 'INVALID_SALES_TARGET_AMOUNT';
    throw error;
  }
  return Math.round(number);
}

function userStaffCode(user = {}) {
  return String(
    user.salesStaffCode
    || user.staffCode
    || user.employeeCode
    || user.code
    || ''
  ).trim();
}

function userStaffName(user = {}) {
  return String(
    user.salesStaffName
    || user.fullName
    || user.name
    || ''
  ).trim();
}

async function listByPeriod(period) {
  const normalizedPeriod = assertPeriod(period);
  return SalesTarget.find({ period: normalizedPeriod, status: 'active' })
    .sort({ salesStaffName: 1, salesStaffCode: 1 })
    .lean();
}

async function saveBatch(period, rows = [], user = {}) {
  const normalizedPeriod = assertPeriod(period);
  if (!Array.isArray(rows) || rows.length > MAX_TARGET_ROWS) {
    const error = new Error(`Danh sách chỉ tiêu tối đa ${MAX_TARGET_ROWS} nhân viên`);
    error.status = 400;
    error.code = 'INVALID_SALES_TARGET_ROWS';
    throw error;
  }

  const activeSalesUsers = await User.find({
    role: 'sales',
    isActive: { $ne: false }
  }).select({
    username: 1,
    fullName: 1,
    name: 1,
    code: 1,
    staffCode: 1,
    employeeCode: 1,
    salesStaffCode: 1,
    salesStaffName: 1
  }).lean();

  const salesUserMap = new Map(
    activeSalesUsers
      .map((salesUser) => [userStaffCode(salesUser), salesUser])
      .filter(([code]) => Boolean(code))
  );

  const actor = normalizeActor(user);
  const now = new Date();
  const uniqueRows = new Map();

  rows.forEach((row) => {
    const code = String(row?.salesStaffCode || '').trim();
    if (!code) return;
    const matchedUser = salesUserMap.get(code);
    uniqueRows.set(code, {
      salesStaffCode: code,
      salesStaffName: userStaffName(matchedUser || {}) || String(row?.salesStaffName || '').trim(),
      targetAmount: normalizeTargetAmount(row?.targetAmount),
      note: String(row?.note || '').trim().slice(0, 500)
    });
  });

  if (!uniqueRows.size) {
    const error = new Error('Không có chỉ tiêu hợp lệ để lưu');
    error.status = 400;
    error.code = 'EMPTY_SALES_TARGET_ROWS';
    throw error;
  }

  const operations = Array.from(uniqueRows.values()).map((row) => ({
    updateOne: {
      filter: {
        period: normalizedPeriod,
        salesStaffCode: row.salesStaffCode
      },
      update: {
        $set: {
          ...row,
          period: normalizedPeriod,
          status: 'active',
          updatedBy: actor,
          updatedAt: now
        },
        $setOnInsert: {
          createdBy: actor,
          createdAt: now
        }
      },
      upsert: true
    }
  }));

  const result = await SalesTarget.bulkWrite(operations, { ordered: false });
  return {
    period: normalizedPeriod,
    savedCount: uniqueRows.size,
    matchedCount: Number(result.matchedCount || 0),
    modifiedCount: Number(result.modifiedCount || 0),
    upsertedCount: Number(result.upsertedCount || 0),
    targets: await listByPeriod(normalizedPeriod)
  };
}

module.exports = {
  PERIOD_PATTERN,
  MAX_TARGET_ROWS,
  assertPeriod,
  normalizeTargetAmount,
  userStaffCode,
  userStaffName,
  listByPeriod,
  saveBatch
};
