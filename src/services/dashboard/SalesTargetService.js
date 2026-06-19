'use strict';

const SalesTarget = require('../../models/SalesTarget');
const User = require('../../models/User');
const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../../utils/excelWriter.util');
const { parseExcelBuffer } = require('../../../utils/excelParser');

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_TARGET_ROWS = 200;

function createValidationError(message, code, details = []) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  if (details.length) error.details = details;
  return error;
}

function assertPeriod(period) {
  const value = String(period || '').trim();
  if (!PERIOD_PATTERN.test(value)) {
    throw createValidationError(
      'Tháng chỉ tiêu phải có định dạng YYYY-MM',
      'INVALID_SALES_TARGET_PERIOD'
    );
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
    throw createValidationError(
      'Chỉ tiêu phải là số không âm',
      'INVALID_SALES_TARGET_AMOUNT'
    );
  }
  return Math.round(number);
}

function normalizeImportedTargetAmount(value) {
  if (typeof value === 'number') return normalizeTargetAmount(value);

  const text = String(value ?? '').trim();
  if (!text) {
    throw createValidationError(
      'Thiếu chỉ tiêu tháng',
      'MISSING_SALES_TARGET_AMOUNT'
    );
  }
  if (text.includes('-')) {
    throw createValidationError(
      'Chỉ tiêu phải là số không âm',
      'INVALID_SALES_TARGET_AMOUNT'
    );
  }

  // Chỉ tiêu là số tiền nguyên. Chỉ hỗ trợ số thuần hoặc phân tách hàng nghìn.
  const compact = text
    .replace(/vnd/gi, '')
    .replace(/[₫đ]/gi, '')
    .replace(/\s+/g, '');
  if (!/^\d+$/.test(compact) && !/^\d{1,3}([.,]\d{3})+$/.test(compact)) {
    throw createValidationError(
      'Chỉ tiêu tháng không phải số hợp lệ',
      'INVALID_SALES_TARGET_AMOUNT'
    );
  }
  return normalizeTargetAmount(Number(compact.replace(/[.,]/g, '')));
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

function activeSalesUserQuery() {
  return {
    role: 'sales',
    isActive: { $ne: false }
  };
}

async function listActiveSalesUsers() {
  return User.find(activeSalesUserQuery()).select({
    username: 1,
    fullName: 1,
    name: 1,
    code: 1,
    staffCode: 1,
    employeeCode: 1,
    salesStaffCode: 1,
    salesStaffName: 1,
    role: 1,
    isActive: 1
  }).sort({ fullName: 1, name: 1, staffCode: 1 }).lean();
}

function normalizeHeader(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function rowValueByAliases(row = {}, aliases = []) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row || {})) {
    if (String(key).startsWith('__')) continue;
    if (normalizedAliases.has(normalizeHeader(key))) return value;
  }
  return '';
}

function parseTargetImportRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    throw createValidationError(
      'File chỉ tiêu không có dữ liệu',
      'EMPTY_SALES_TARGET_IMPORT'
    );
  }
  if (rows.length > MAX_TARGET_ROWS) {
    throw createValidationError(
      `File chỉ tiêu tối đa ${MAX_TARGET_ROWS} nhân viên`,
      'TOO_MANY_SALES_TARGET_ROWS'
    );
  }

  const parsed = [];
  const errors = [];
  const seenCodes = new Set();

  for (const row of rows) {
    const rowNo = Number(row?.__rowNo || parsed.length + 2);
    const code = String(rowValueByAliases(row, [
      'Mã NVBH',
      'Mã nhân viên bán hàng',
      'Mã nhân viên',
      'Sales Staff Code',
      'Staff Code',
      'salesStaffCode'
    ]) || '').trim();
    const name = String(rowValueByAliases(row, [
      'Tên NVBH',
      'Nhân viên bán hàng',
      'Tên nhân viên',
      'Sales Staff Name',
      'salesStaffName'
    ]) || '').trim();
    const amountRaw = rowValueByAliases(row, [
      'Chỉ tiêu tháng',
      'Chỉ tiêu',
      'Target Amount',
      'Monthly Target',
      'targetAmount'
    ]);
    const note = String(rowValueByAliases(row, ['Ghi chú', 'Note']) || '').trim().slice(0, 500);

    const hasAnyValue = code || name || String(amountRaw ?? '').trim() || note;
    if (!hasAnyValue) continue;

    if (!code) {
      errors.push({ row: rowNo, field: 'salesStaffCode', message: 'Thiếu mã NVBH' });
      continue;
    }
    if (seenCodes.has(code.toLowerCase())) {
      errors.push({ row: rowNo, field: 'salesStaffCode', message: `Trùng mã NVBH ${code}` });
      continue;
    }

    try {
      parsed.push({
        salesStaffCode: code,
        salesStaffName: name,
        targetAmount: normalizeImportedTargetAmount(amountRaw),
        note,
        __rowNo: rowNo
      });
      seenCodes.add(code.toLowerCase());
    } catch (error) {
      errors.push({
        row: rowNo,
        field: 'targetAmount',
        message: error.message || 'Chỉ tiêu không hợp lệ'
      });
    }
  }

  if (errors.length) {
    throw createValidationError(
      `File chỉ tiêu có ${errors.length} dòng không hợp lệ`,
      'INVALID_SALES_TARGET_IMPORT_ROWS',
      errors.slice(0, 30)
    );
  }
  if (!parsed.length) {
    throw createValidationError(
      'File chỉ tiêu không có dòng hợp lệ',
      'EMPTY_SALES_TARGET_IMPORT'
    );
  }
  return parsed;
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
    throw createValidationError(
      `Danh sách chỉ tiêu tối đa ${MAX_TARGET_ROWS} nhân viên`,
      'INVALID_SALES_TARGET_ROWS'
    );
  }

  const activeSalesUsers = await listActiveSalesUsers();
  const salesUserMap = new Map(
    activeSalesUsers
      .map((salesUser) => [userStaffCode(salesUser).toLowerCase(), salesUser])
      .filter(([code]) => Boolean(code))
  );

  const actor = normalizeActor(user);
  const now = new Date();
  const uniqueRows = new Map();
  const validationErrors = [];

  rows.forEach((row, index) => {
    const code = String(row?.salesStaffCode || '').trim();
    if (!code) return;
    const normalizedCode = code.toLowerCase();
    const matchedUser = salesUserMap.get(normalizedCode);
    if (!matchedUser) {
      validationErrors.push({
        row: Number(row?.__rowNo || index + 1),
        field: 'salesStaffCode',
        message: `Mã ${code} không thuộc tài khoản NVBH đang hoạt động`
      });
      return;
    }
    if (uniqueRows.has(normalizedCode)) {
      validationErrors.push({
        row: Number(row?.__rowNo || index + 1),
        field: 'salesStaffCode',
        message: `Trùng mã NVBH ${code}`
      });
      return;
    }

    try {
      uniqueRows.set(normalizedCode, {
        salesStaffCode: userStaffCode(matchedUser),
        salesStaffName: userStaffName(matchedUser) || String(row?.salesStaffName || '').trim(),
        targetAmount: normalizeTargetAmount(row?.targetAmount),
        note: String(row?.note || '').trim().slice(0, 500)
      });
    } catch (error) {
      validationErrors.push({
        row: Number(row?.__rowNo || index + 1),
        field: 'targetAmount',
        message: error.message || 'Chỉ tiêu không hợp lệ'
      });
    }
  });

  if (validationErrors.length) {
    throw createValidationError(
      `Có ${validationErrors.length} dòng chỉ tiêu không hợp lệ`,
      'INVALID_SALES_TARGET_ROWS',
      validationErrors.slice(0, 30)
    );
  }
  if (!uniqueRows.size) {
    throw createValidationError(
      'Không có chỉ tiêu hợp lệ để lưu',
      'EMPTY_SALES_TARGET_ROWS'
    );
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

  const result = await SalesTarget.bulkWrite(operations, { ordered: true });
  return {
    period: normalizedPeriod,
    savedCount: uniqueRows.size,
    matchedCount: Number(result.matchedCount || 0),
    modifiedCount: Number(result.modifiedCount || 0),
    upsertedCount: Number(result.upsertedCount || 0),
    targets: await listByPeriod(normalizedPeriod)
  };
}

async function importFromExcel(period, buffer, user = {}) {
  const normalizedPeriod = assertPeriod(period);
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw createValidationError(
      'Chưa có file chỉ tiêu để upload',
      'MISSING_SALES_TARGET_FILE'
    );
  }

  const rows = parseTargetImportRows(await parseExcelBuffer(buffer));
  const result = await saveBatch(normalizedPeriod, rows, user);
  return {
    ...result,
    importedRows: rows.length
  };
}

async function buildImportTemplate(period) {
  const normalizedPeriod = assertPeriod(period);
  const [activeSalesUsers, targets] = await Promise.all([
    listActiveSalesUsers(),
    listByPeriod(normalizedPeriod)
  ]);
  const targetMap = new Map(
    targets.map((target) => [String(target.salesStaffCode || '').trim().toLowerCase(), target])
  );

  const rows = [
    ['Mã NVBH', 'Tên NVBH', 'Chỉ tiêu tháng', 'Ghi chú'],
    ...activeSalesUsers
      .map((salesUser) => {
        const code = userStaffCode(salesUser);
        const target = targetMap.get(code.toLowerCase()) || {};
        return [
          code,
          userStaffName(salesUser),
          Number(target.targetAmount || 0),
          String(target.note || '')
        ];
      })
      .filter((row) => Boolean(row[0]))
  ];

  const workbook = createWorkbook();
  appendAoaSheet(workbook, 'Import', rows, {
    widths: [18, 30, 22, 36],
    autoFilter: true
  });

  return {
    buffer: writeWorkbook(workbook),
    fileName: `Mau_Chi_Tieu_NVBH_${normalizedPeriod}.xlsx`,
    rowCount: Math.max(0, rows.length - 1)
  };
}

module.exports = {
  PERIOD_PATTERN,
  MAX_TARGET_ROWS,
  assertPeriod,
  normalizeTargetAmount,
  normalizeImportedTargetAmount,
  userStaffCode,
  userStaffName,
  normalizeHeader,
  parseTargetImportRows,
  listActiveSalesUsers,
  listByPeriod,
  saveBatch,
  importFromExcel,
  buildImportTemplate
};
