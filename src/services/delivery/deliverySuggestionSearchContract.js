'use strict';

const SEARCH_VERSION = 1;
const MIN_ORDER_CUSTOMER_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const MAX_OUTPUT_LIMIT = 10;
const DEFAULT_OUTPUT_LIMIT = 10;
const MAX_CANDIDATE_LIMIT = 80;
const MAX_TOKENS = 4;
const MAX_TOKEN_LENGTH = 32;

function text(value = '') {
  return String(value ?? '').trim();
}

function normalizeSearchText(value = '') {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCode(value = '') {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

function normalizePhone(value = '') {
  return text(value).replace(/\D/g, '');
}

function normalizeDateKey(value = '') {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  return raw.slice(0, 10);
}

function tokenize(value = '') {
  return [...new Set(normalizeSearchText(value)
    .split(/[^a-z0-9_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .map((token) => token.slice(0, MAX_TOKEN_LENGTH)))]
    .slice(0, MAX_TOKENS);
}

function escapeRegExp(value = '') {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseOutputLimit(value) {
  const n = Number.parseInt(value, 10);
  return Math.max(1, Math.min(MAX_OUTPUT_LIMIT, Number.isFinite(n) ? n : DEFAULT_OUTPUT_LIMIT));
}

function parseCandidateLimit(value, outputLimit = DEFAULT_OUTPUT_LIMIT) {
  const n = Number.parseInt(value, 10);
  const fallback = Math.max(30, outputLimit * 6);
  return Math.max(outputLimit, Math.min(MAX_CANDIDATE_LIMIT, Number.isFinite(n) ? n : fallback));
}

function queryError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeKeyword(value = '', options = {}) {
  const raw = text(value);
  if (raw.length > MAX_QUERY_LENGTH) {
    throw queryError('SUGGESTION_QUERY_TOO_LONG', `Từ khóa gợi ý không được vượt quá ${MAX_QUERY_LENGTH} ký tự.`);
  }
  const normalized = normalizeSearchText(raw);
  const minLength = Number(options.minLength ?? MIN_ORDER_CUSTOMER_QUERY_LENGTH);
  return {
    raw,
    normalized,
    code: normalizeCode(raw),
    phone: normalizePhone(raw),
    tokens: tokenize(raw),
    sufficient: normalized.length >= minLength,
    minLength
  };
}

function buildNormalizedSearchFields(row = {}) {
  const orderCode = normalizeCode(row.orderCode || row.code || row.salesOrderCode || row.id);
  const customerCode = normalizeCode(row.customerCode);
  const customerName = normalizeSearchText(row.customerName);
  const phone = normalizePhone(row.customerPhone || row.phone || row.phoneNumber);
  const address = normalizeSearchText(row.customerAddress || row.address || row.deliveryAddress);
  const sales = normalizeCode(row.salesStaffCode || row.salesmanCode || row.nvbhCode || row.maNVBH);
  const delivery = normalizeCode(row.deliveryStaffCode || row.deliveryCode || row.nvghCode || row.maNVGH);
  const searchText = [orderCode, customerCode, customerName, phone, address, sales, delivery].filter(Boolean).join(' ');
  return {
    suggestOrderCodeNorm: orderCode,
    suggestCustomerCodeNorm: customerCode,
    suggestCustomerNameNorm: customerName,
    suggestCustomerPhoneNorm: phone,
    suggestCustomerAddressNorm: address,
    suggestSalesStaffCodeNorm: sales,
    suggestDeliveryStaffCodeNorm: delivery,
    suggestSearchTextNorm: searchText,
    suggestSearchTokens: tokenize(searchText),
    suggestSearchVersion: SEARCH_VERSION
  };
}

function canonicalScope(query = {}) {
  return {
    deliveryDateKey: normalizeDateKey(query.deliveryDate || query.date),
    salesStaffCode: normalizeCode(query.salesStaffCode || query.salesman || query.nvbh),
    deliveryStaffCode: normalizeCode(query.deliveryStaffCode || query.delivery || query.nvgh),
    customerCode: normalizeCode(query.customerCode)
  };
}

function normalizedRowField(row = {}, canonical, aliases = []) {
  if (row[canonical] !== undefined && row[canonical] !== null && text(row[canonical])) return normalizeCode(row[canonical]);
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && text(row[alias])) return normalizeCode(row[alias]);
  }
  return '';
}

function rowInScope(row = {}, scope = {}) {
  if (row.deleted === true || row.isDeleted === true || ['deleted', 'hard_deleted'].includes(text(row.deleteMode).toLowerCase())) return false;
  const rowDate = normalizeDateKey(row.deliveryDateKey || row.deliveryDate || row.date);
  if (scope.deliveryDateKey && rowDate !== scope.deliveryDateKey) return false;
  const sales = normalizeCode(row.suggestSalesStaffCodeNorm) || normalizedRowField(row, 'salesStaffCode', ['salesmanCode', 'nvbhCode', 'maNVBH']);
  const delivery = normalizeCode(row.suggestDeliveryStaffCodeNorm) || normalizedRowField(row, 'deliveryStaffCode', ['deliveryCode', 'nvghCode', 'maNVGH']);
  const customer = normalizeCode(row.suggestCustomerCodeNorm) || normalizeCode(row.customerCode);
  if (scope.salesStaffCode && sales !== scope.salesStaffCode) return false;
  if (scope.deliveryStaffCode && delivery !== scope.deliveryStaffCode) return false;
  if (scope.customerCode && customer !== scope.customerCode) return false;
  return true;
}

function rowSearchParts(row = {}) {
  const generated = buildNormalizedSearchFields(row);
  return {
    orderCode: normalizeCode(row.suggestOrderCodeNorm || generated.suggestOrderCodeNorm),
    customerCode: normalizeCode(row.suggestCustomerCodeNorm || generated.suggestCustomerCodeNorm),
    customerName: normalizeSearchText(row.suggestCustomerNameNorm || generated.suggestCustomerNameNorm),
    phone: normalizePhone(row.suggestCustomerPhoneNorm || generated.suggestCustomerPhoneNorm),
    address: normalizeSearchText(row.suggestCustomerAddressNorm || generated.suggestCustomerAddressNorm),
    tokens: Array.isArray(row.suggestSearchTokens) && row.suggestSearchTokens.length
      ? row.suggestSearchTokens.map(normalizeSearchText).filter(Boolean)
      : generated.suggestSearchTokens
  };
}

function tokenMatch(haystack = '', tokens = []) {
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function rowMatchesKeyword(row = {}, keyword = {}) {
  const parts = rowSearchParts(row);
  if (!keyword.normalized) return true;
  if (parts.orderCode === keyword.code || parts.customerCode === keyword.code) return true;
  if (parts.orderCode.startsWith(keyword.code) || parts.customerCode.startsWith(keyword.code)) return true;
  if (keyword.phone && parts.phone.startsWith(keyword.phone)) return true;
  if (parts.customerName.startsWith(keyword.normalized)) return true;
  const combined = `${parts.customerName} ${parts.address} ${parts.tokens.join(' ')}`;
  return tokenMatch(combined, keyword.tokens);
}

function rankSuggestion(item = {}, keyword = {}) {
  const code = normalizeCode(item.orderCode || item.customerCode || item.code);
  const name = normalizeSearchText(item.customerName || item.name || item.label);
  const phone = normalizePhone(item.phone);
  const address = normalizeSearchText(item.address);
  if (code && code === keyword.code) return 10000;
  if (code && keyword.code && code.startsWith(keyword.code)) return 9000;
  if (phone && keyword.phone && phone.startsWith(keyword.phone)) return 8000;
  if (name && keyword.normalized && name.startsWith(keyword.normalized)) return 7000;
  if (tokenMatch(`${name} ${address}`, keyword.tokens)) return 5000;
  return 1000;
}

function stableSuggestionCompare(a = {}, b = {}) {
  const rankDiff = Number(b._rank || 0) - Number(a._rank || 0);
  if (rankDiff) return rankDiff;
  const typeDiff = String(a.type || '').localeCompare(String(b.type || ''), 'vi');
  if (typeDiff) return typeDiff;
  return String(a.label || a.code || '').localeCompare(String(b.label || b.code || ''), 'vi', { numeric: true });
}

module.exports = {
  SEARCH_VERSION,
  MIN_ORDER_CUSTOMER_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_OUTPUT_LIMIT,
  MAX_CANDIDATE_LIMIT,
  normalizeSearchText,
  normalizeCode,
  normalizePhone,
  normalizeDateKey,
  tokenize,
  escapeRegExp,
  parseOutputLimit,
  parseCandidateLimit,
  normalizeKeyword,
  buildNormalizedSearchFields,
  canonicalScope,
  rowInScope,
  rowMatchesKeyword,
  rankSuggestion,
  stableSuggestionCompare
};
