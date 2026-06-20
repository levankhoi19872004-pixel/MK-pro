'use strict';

const dateUtil = require('../../utils/date.util');
const { text, lower } = require('./FundSummaryDomain');

const MAX_RANGE_DAYS = 366;
const MAX_PAGE_LIMIT = 200;
const EXPORT_ROW_LIMIT = 50000;
const TRANSACTION_TYPES = new Set(['all', 'deposit', 'expense', 'transfer']);
const ROLE_FILTERS = new Map([
  ['sales', 'NVBH'],
  ['nvbh', 'NVBH'],
  ['delivery', 'NVGH'],
  ['nvgh', 'NVGH'],
  ['accountant', 'Kế toán'],
  ['cashier', 'Thủ quỹ'],
  ['supplier', 'Nhà cung cấp'],
  ['customer', 'Khách hàng'],
  ['other', 'Khác'],
  ['unknown', 'Chưa xác định'],
  ['internal', 'Nội bộ']
]);
const SORT_FIELDS = new Set([
  'personName',
  'depositedAmount',
  'depositVoucherCount',
  'expenseAmount',
  'expenseVoucherCount',
  'netAmount',
  'lastTransactionAt',
  'internalTransferAmount'
]);

function strictDateOnly(value, fieldName) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || dateUtil.toDateOnly(raw, '') !== raw) {
    const error = new Error(`${fieldName} không hợp lệ, định dạng yêu cầu YYYY-MM-DD`);
    error.status = 400;
    error.code = 'INVALID_DATE';
    throw error;
  }
  return raw;
}

function dateOrdinal(value) {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function vietnamUtcRange(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00+07:00`);
  const endDate = dateUtil.addDaysToDateOnly(toDate, 1);
  const end = new Date(`${endDate}T00:00:00+07:00`);
  return { start, end };
}

function normalizeFilters(query = {}, options = {}) {
  const today = dateUtil.todayVN();
  const fromDate = strictDateOnly(query.fromDate || query.dateFrom || today, 'Từ ngày');
  const toDate = strictDateOnly(query.toDate || query.dateTo || fromDate, 'Đến ngày');
  if (toDate < fromDate) {
    const error = new Error('Đến ngày phải lớn hơn hoặc bằng Từ ngày');
    error.status = 400;
    error.code = 'INVALID_DATE_RANGE';
    throw error;
  }
  if (dateOrdinal(toDate) - dateOrdinal(fromDate) > MAX_RANGE_DAYS) {
    const error = new Error(`Khoảng ngày không được vượt quá ${MAX_RANGE_DAYS} ngày`);
    error.status = 400;
    error.code = 'DATE_RANGE_TOO_LARGE';
    throw error;
  }

  const transactionType = lower(query.transactionType || 'all');
  if (!TRANSACTION_TYPES.has(transactionType)) {
    const error = new Error('Loại giao dịch không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_TRANSACTION_TYPE';
    throw error;
  }

  let personRole = text(query.personRole);
  if (personRole) {
    const mapped = ROLE_FILTERS.get(lower(personRole));
    if (!mapped) {
      const error = new Error('Vai trò không hợp lệ');
      error.status = 400;
      error.code = 'INVALID_PERSON_ROLE';
      throw error;
    }
    personRole = mapped;
  }

  const sortBy = text(query.sortBy || 'netAmount');
  if (!SORT_FIELDS.has(sortBy)) {
    const error = new Error('Trường sắp xếp không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_SORT_FIELD';
    throw error;
  }
  const sortOrder = lower(query.sortOrder || 'desc');
  if (!['asc', 'desc'].includes(sortOrder)) {
    const error = new Error('Chiều sắp xếp không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_SORT_ORDER';
    throw error;
  }

  const rawPage = query.page === undefined || query.page === '' ? 1 : Number(query.page);
  if (!Number.isInteger(rawPage) || rawPage < 1) {
    const error = new Error('page phải là số nguyên lớn hơn hoặc bằng 1');
    error.status = 400;
    error.code = 'INVALID_PAGE';
    throw error;
  }
  const rawLimit = query.limit === undefined || query.limit === '' ? 50 : Number(query.limit);
  if (!Number.isInteger(rawLimit)) {
    const error = new Error('limit phải là số nguyên');
    error.status = 400;
    error.code = 'INVALID_LIMIT';
    throw error;
  }
  const page = rawPage;
  const requestedLimit = rawLimit;
  if (requestedLimit < 1 || requestedLimit > (options.exportMode ? EXPORT_ROW_LIMIT : MAX_PAGE_LIMIT)) {
    const error = new Error(`limit phải từ 1 đến ${options.exportMode ? EXPORT_ROW_LIMIT : MAX_PAGE_LIMIT}`);
    error.status = 400;
    error.code = 'INVALID_LIMIT';
    throw error;
  }

  const fundCode = lower(query.fundCode || query.fundType || '');
  if (fundCode && !['cash', 'bank'].includes(fundCode) && !/^[a-z0-9_.:-]{1,40}$/i.test(fundCode)) {
    const error = new Error('Mã quỹ không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_FUND_CODE';
    throw error;
  }

  const personCode = text(query.personCode);
  const q = text(query.q || query.search || query.person);
  if (personCode.length > 80 || q.length > 120) {
    const error = new Error('Điều kiện tìm người quá dài');
    error.status = 400;
    error.code = 'INVALID_PERSON_FILTER';
    throw error;
  }

  return {
    fromDate,
    toDate,
    personCode,
    personRole,
    q,
    transactionType,
    fundCode,
    page,
    limit: requestedLimit,
    sortBy,
    sortOrder,
    tenantId: text(options.tenantId || query.tenantId),
    multiTenant: String(process.env.TENANT_MODE || 'single').toLowerCase() === 'multi'
  };
}

module.exports = {
  normalizeFilters,
  vietnamUtcRange,
  constants: {
    MAX_RANGE_DAYS,
    MAX_PAGE_LIMIT,
    EXPORT_ROW_LIMIT
  }
};
