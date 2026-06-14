'use strict';

const dateUtil = require('./date.util');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampLimit(value, fallback = DEFAULT_LIMIT, max = MAX_LIMIT) {
  return Math.min(toPositiveInt(value, fallback), max);
}

function getPagination(query = {}, options = {}) {
  const limit = clampLimit(query.limit, options.defaultLimit || DEFAULT_LIMIT, options.maxLimit || MAX_LIMIT);
  const page = toPositiveInt(query.page, 1);
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function normalizeQueryDateRange(query = {}, options = {}) {
  const next = { ...(query || {}) };
  const today = dateUtil.todayVN();

  const fromKeys = ['dateFrom', 'fromDate', 'startDate', 'from'];
  const toKeys = ['dateTo', 'toDate', 'endDate', 'to'];

  let from = '';
  let to = '';

  for (const key of fromKeys) {
    if (next[key]) {
      from = dateUtil.toDateOnly(next[key]);
      break;
    }
  }
  for (const key of toKeys) {
    if (next[key]) {
      to = dateUtil.toDateOnly(next[key]);
      break;
    }
  }

  const singleDate = dateUtil.toDateOnly(next.date || next.deliveryDate || next.orderDate || '');
  if (singleDate && !from && !to) {
    from = singleDate;
    to = singleDate;
  }

  if (options.defaultToday && !from && !to) {
    from = today;
    to = today;
  }

  if (from) next.dateFrom = from;
  if (to) next.dateTo = to;
  if (!next.date && from && to && from === to) next.date = from;

  return next;
}

function hasAnyFilter(query = {}, fields = []) {
  return fields.some((field) => String(query[field] ?? '').trim());
}

function hasDateFilter(query = {}) {
  return Boolean(
    query.date ||
    query.orderDate ||
    query.deliveryDate ||
    query.dateFrom ||
    query.dateTo ||
    query.fromDate ||
    query.toDate ||
    query.startDate ||
    query.endDate ||
    query.from ||
    query.to
  );
}

function hasBusinessFilter(query = {}) {
  return hasDateFilter(query) || hasAnyFilter(query, [
    'q',
    'keyword',
    'search',
    'code',
    'orderCode',
    'salesOrderCode',
    'customerCode',
    'customerName',
    'customerId',
    'staffCode',
    'staffName',
    'salesStaff',
    'salesman',
    'deliveryStaff',
    'delivery',
    'productCode',
    'warehouseCode',
    'status',
    'routeName',
    'route'
  ]);
}

function ensureSearchKeyword(query = {}, minLength = 2) {
  const q = String(query.q || query.keyword || query.search || '').trim();
  if (q.length < minLength) {
    return { ok: false, message: `Vui lòng nhập ít nhất ${minLength} ký tự để tìm kiếm`, q };
  }
  return { ok: true, q };
}

function requireDateRange(query = {}, options = {}) {
  const normalized = normalizeQueryDateRange(query, options);
  if (!normalized.dateFrom || !normalized.dateTo) {
    return { ok: false, message: 'Vui lòng chọn khoảng thời gian', query: normalized };
  }

  const from = new Date(`${normalized.dateFrom}T00:00:00+07:00`);
  const to = new Date(`${normalized.dateTo}T00:00:00+07:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return { ok: false, message: 'Khoảng thời gian không hợp lệ', query: normalized };
  }

  const maxDays = Number(options.maxDays || 0);
  if (maxDays > 0) {
    const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    if (inclusiveDays > maxDays) {
      return {
        ok: false,
        message: `Khoảng thời gian tối đa là ${maxDays} ngày`,
        query: normalized
      };
    }
  }

  return { ok: true, query: normalized };
}

function buildRegex(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: escaped, $options: 'i' };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  clampLimit,
  getPagination,
  normalizeQueryDateRange,
  hasAnyFilter,
  hasDateFilter,
  hasBusinessFilter,
  ensureSearchKeyword,
  requireDateRange,
  buildRegex
};
