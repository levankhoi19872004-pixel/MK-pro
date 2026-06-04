'use strict';

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function formatDateOnly(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function nowIso(date = new Date()) {
  return date.toISOString();
}

function todayVN(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function excelSerialToDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return '';
  // Excel serial date system: day 1 = 1900-01-01, with the historical 1900 leap-year bug.
  const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * MS_PER_DAY;
  const date = new Date(utc);
  return formatDateOnly(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseVietnamDate(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return fallback;

  // Excel numeric serial date.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToDate(raw) || fallback || raw.slice(0, 10);
  }

  // ISO/system format: YYYY-MM-DD, YYYY/MM/DD or ISO datetime.
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (isValidDateParts(year, month, day)) return formatDateOnly(year, month, day);
    return fallback || raw.slice(0, 10);
  }

  // Vietnamese import/display format: DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY.
  // Do not auto-flip to MM/DD/YYYY; 01/06/2026 is always 1 June 2026.
  // S3/Unilever thường xuất ngày dạng 03.06.2026 nên cho phép dấu chấm.
  const vn = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/);
  if (vn) {
    const day = Number(vn[1]);
    const month = Number(vn[2]);
    let year = Number(vn[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (isValidDateParts(year, month, day)) return formatDateOnly(year, month, day);
    return fallback || raw.slice(0, 10);
  }

  return fallback || raw.slice(0, 10);
}

function toDateOnly(value, fallback = '') {
  return parseVietnamDate(value, fallback);
}

function isDateInRange(value, options = {}) {
  const date = toDateOnly(value);
  if (!date) return false;
  const exact = toDateOnly(options.date || options.targetDate || '');
  const dateFrom = toDateOnly(options.dateFrom || options.from || '');
  const dateTo = toDateOnly(options.dateTo || options.to || '');
  if (exact && date !== exact) return false;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

module.exports = {
  VIETNAM_TIME_ZONE,
  parseVietnamDate,
  toDateOnly,
  todayVN,
  nowIso,
  isDateInRange,
  excelSerialToDate
};
