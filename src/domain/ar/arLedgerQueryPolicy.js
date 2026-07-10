'use strict';

const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const {
  DEBT_CATEGORIES,
  PHASE87_READ_MODEL_CATEGORIES,
  normalizeAccountingAmount,
  isPhase87ReadModelArDebtLedger,
  isCanonicalArDebtLedger,
  validateArLedgerContract
} = require('./arLedgerValidator');
const {
  ACTIVE_DEBT_READ_MODEL_CATEGORIES,
  EXCLUDED_DEBT_READ_MODEL_CATEGORIES
} = require('./arDebtCategoryRegistry');

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function escapeRegExp(value = '') {
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStaffCode(value = '') {
  return clean(value).toLowerCase();
}

function normalizeDebtStatus(status = 'open') {
  const raw = lower(status || 'open');
  if (!raw || ['open', 'debt', 'unpaid', 'hasdebt', 'has_debt', 'khach_con_no', 'khách còn nợ'].includes(raw)) return 'open';
  if (['closed', 'paid', 'settled', 'done', 'het_no', 'hết nợ'].includes(raw)) return 'closed';
  if (['all', 'any', '*'].includes(raw)) return 'all';
  if (['overdue', 'qua_han', 'quá hạn'].includes(raw)) return 'overdue';
  if (['overpaid', 'credit', 'du_co', 'dư có'].includes(raw)) return 'overpaid';
  return raw;
}

function normalizeArDebtFilters(filters = {}) {
  const page = Math.max(1, Math.floor(Number(filters.page || 1)) || 1);
  const limit = Math.min(Math.max(1, Math.floor(Number(filters.limit || 50)) || 50), 500);
  return {
    ...filters,
    q: clean(filters.q || filters.search || filters.keyword),
    customerCode: clean(filters.customerCode || filters.customerId || filters.code || filters.id),
    sourceId: clean(filters.sourceId || filters.salesOrderId || filters.orderId || filters.refId),
    sourceCode: clean(filters.sourceCode || filters.salesOrderCode || filters.orderCode || filters.refCode),
    salesStaffCode: clean(filters.salesStaffCode || filters.salesmanCode || filters.nvbhCode || filters.salesman),
    deliveryStaffCode: clean(filters.deliveryStaffCode || filters.deliveryCode || filters.nvghCode || filters.delivery),
    status: normalizeDebtStatus(filters.status || (filters.includePaid === '1' ? 'all' : 'open')),
    dateFrom: clean(filters.dateFrom || filters.fromDate || filters.from),
    dateTo: clean(filters.dateTo || filters.toDate || filters.to),
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function exactCodeRegex(value = '') {
  const raw = clean(value);
  return raw ? new RegExp(`^${escapeRegExp(raw)}$`, 'i') : null;
}

function appendAnd(match, condition) {
  if (!condition) return match;
  if (!Array.isArray(match.$and)) match.$and = [];
  match.$and.push(condition);
  return match;
}

function ledgerIdentityKeys(row = {}) {
  return [row.id, row.code, row._id, row.ledgerId, row.idempotencyKey].map(clean).filter(Boolean);
}

function reversalOriginalKeys(row = {}) {
  return [
    row.reversedLedgerId,
    row.originalLedgerId,
    row.reversalOf,
    row.refId,
    row.originalLedgerCode
  ].map(clean).filter(Boolean);
}

function isArDebtReversalLedger(row = {}) {
  return /-REVERSAL$/i.test(clean(row.category || row.ledgerType));
}

function hasActiveOriginalForReversal(row = {}, canonicalRows = []) {
  const keys = new Set(reversalOriginalKeys(row));
  if (!keys.size) return false;
  return (Array.isArray(canonicalRows) ? canonicalRows : []).some((candidate) => {
    if (candidate === row || isArDebtReversalLedger(candidate)) return false;
    return ledgerIdentityKeys(candidate).some((key) => keys.has(key));
  });
}

function filterReadModelEligibleArLedgers(rows = []) {
  const canonicalRows = (Array.isArray(rows) ? rows : []).filter(isCanonicalArDebtLedger);
  return canonicalRows.filter((row) => {
    if (!isArDebtReversalLedger(row)) return true;
    return hasActiveOriginalForReversal(row, canonicalRows);
  });
}

function isOrphanReadModelReversal(row = {}, rows = []) {
  return isArDebtReversalLedger(row) && !hasActiveOriginalForReversal(row, rows);
}

function buildCanonicalArLedgerMatch(filters = {}) {
  const normalized = normalizeArDebtFilters(filters);
  const match = {
    account: 'AR',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: { $ne: true },
    category: { $in: [...PHASE87_READ_MODEL_CATEGORIES] }
  };

  if (clean(filters.tenantId)) match.tenantId = clean(filters.tenantId);
  if (normalized.customerCode) {
    const rx = exactCodeRegex(normalized.customerCode);
    appendAnd(match, { $or: [{ customerCode: rx }, { customerId: rx }] });
  }
  if (normalized.sourceId) {
    const rx = exactCodeRegex(normalized.sourceId);
    appendAnd(match, { $or: [{ sourceId: rx }, { salesOrderId: rx }, { orderId: rx }, { refId: rx }] });
  }
  if (normalized.sourceCode) {
    const rx = exactCodeRegex(normalized.sourceCode);
    appendAnd(match, { $or: [{ sourceCode: rx }, { salesOrderCode: rx }, { orderCode: rx }, { refCode: rx }] });
  }
  if (normalized.salesStaffCode) {
    const rx = exactCodeRegex(normalized.salesStaffCode);
    appendAnd(match, { $or: [{ salesStaffCode: rx }, { salesmanCode: rx }, { nvbhCode: rx }] });
  }
  if (normalized.deliveryStaffCode) {
    const rx = exactCodeRegex(normalized.deliveryStaffCode);
    appendAnd(match, { $or: [{ deliveryStaffCode: rx }, { deliveryCode: rx }, { nvghCode: rx }] });
  }
  if (normalized.q) {
    const rx = new RegExp(escapeRegExp(normalized.q), 'i');
    appendAnd(match, {
      $or: [
        { customerCode: rx },
        { customerName: rx },
        { customerId: rx },
        { sourceCode: rx },
        { sourceId: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { code: rx },
        { id: rx }
      ]
    });
  }
  if (normalized.dateFrom || normalized.dateTo) {
    match.date = {};
    if (normalized.dateFrom) match.date.$gte = normalized.dateFrom;
    if (normalized.dateTo) match.date.$lte = normalized.dateTo;
  }
  return match;
}

function buildActiveDebtReadModelLedgerMatch(filters = {}) {
  const normalized = normalizeArDebtFilters(filters);
  const match = {
    account: 'AR',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'] },
    category: { $in: [...ACTIVE_DEBT_READ_MODEL_CATEGORIES] },
    ledgerType: { $in: [...ACTIVE_DEBT_READ_MODEL_CATEGORIES] }
  };

  if (clean(filters.tenantId)) match.tenantId = clean(filters.tenantId);
  if (normalized.customerCode) {
    const rx = exactCodeRegex(normalized.customerCode);
    appendAnd(match, { $or: [{ customerCode: rx }, { customerId: rx }] });
  }
  if (normalized.sourceId) {
    const rx = exactCodeRegex(normalized.sourceId);
    appendAnd(match, { $or: [{ sourceId: rx }, { salesOrderId: rx }, { orderId: rx }, { refId: rx }] });
  }
  if (normalized.sourceCode) {
    const rx = exactCodeRegex(normalized.sourceCode);
    appendAnd(match, { $or: [{ sourceCode: rx }, { salesOrderCode: rx }, { orderCode: rx }, { refCode: rx }] });
  }
  if (normalized.salesStaffCode) {
    const rx = exactCodeRegex(normalized.salesStaffCode);
    appendAnd(match, { $or: [{ salesStaffCode: rx }, { salesmanCode: rx }, { nvbhCode: rx }] });
  }
  if (normalized.deliveryStaffCode) {
    const rx = exactCodeRegex(normalized.deliveryStaffCode);
    appendAnd(match, { $or: [{ deliveryStaffCode: rx }, { deliveryCode: rx }, { nvghCode: rx }] });
  }
  if (normalized.q) {
    const rx = new RegExp(escapeRegExp(normalized.q), 'i');
    appendAnd(match, {
      $or: [
        { customerCode: rx },
        { customerName: rx },
        { customerId: rx },
        { sourceCode: rx },
        { sourceId: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { code: rx },
        { id: rx }
      ]
    });
  }
  if (normalized.dateFrom || normalized.dateTo) {
    match.date = {};
    if (normalized.dateFrom) match.date.$gte = normalized.dateFrom;
    if (normalized.dateTo) match.date.$lte = normalized.dateTo;
  }
  return match;
}

function getSignedArAmount(ledger = {}) {
  if (!isPhase87ReadModelArDebtLedger(ledger)) {
    const validation = validateArLedgerContract(ledger);
    const error = new Error(`Cannot compute AR signed amount from non-canonical ledger: ${validation.ledgerId}`);
    error.code = 'NON_CANONICAL_AR_LEDGER';
    error.validation = validation;
    throw error;
  }
  const { debit, credit } = normalizeAccountingAmount(ledger);
  return debit - credit;
}

function ledgerDate(row = {}) {
  return clean(row.date || row.documentDate || row.deliveryDate || row.createdAt);
}

function firstText(row = {}, fields = []) {
  for (const field of fields) {
    const value = clean(String(field).split('.').reduce((acc, key) => acc?.[key], row));
    if (value) return value;
  }
  return '';
}

function normalizeCanonicalLedgerRow(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return {
    ...row,
    id: firstText(row, ['id', 'code', '_id']),
    sourceType: clean(row.sourceType),
    sourceId: firstText(row, ['sourceId', 'salesOrderId', 'orderId', 'refId']),
    sourceCode: firstText(row, ['sourceCode', 'salesOrderCode', 'orderCode', 'refCode', 'code']),
    customerCode: clean(row.customerCode),
    customerName: clean(row.customerName),
    category: clean(row.category).toUpperCase(),
    ledgerType: clean(row.ledgerType).toUpperCase(),
    entryType: clean(row.entryType).toLowerCase(),
    debit: amounts.debit,
    credit: amounts.credit,
    amount: amounts.amount,
    direction: amounts.direction,
    amountField: amounts.amountField,
    signedAmount: amounts.debit - amounts.credit,
    date: ledgerDate(row),
    salesStaffCode: firstText(row, ['salesStaffCode', 'salesmanCode', 'nvbhCode']),
    salesStaffName: firstText(row, ['salesStaffName', 'salesmanName', 'nvbhName']),
    deliveryStaffCode: firstText(row, ['deliveryStaffCode', 'deliveryCode', 'nvghCode']),
    deliveryStaffName: firstText(row, ['deliveryStaffName', 'deliveryName', 'nvghName']),
    masterOrderId: clean(row.masterOrderId),
    masterOrderCode: clean(row.masterOrderCode)
  };
}

function canonicalRowMatchesFilters(row = {}, filters = {}) {
  const normalized = normalizeArDebtFilters(filters);
  const canon = normalizeCanonicalLedgerRow(row);
  if (normalized.customerCode && normalizeStaffCode(canon.customerCode) !== normalizeStaffCode(normalized.customerCode)) return false;
  if (normalized.sourceId && normalizeStaffCode(canon.sourceId) !== normalizeStaffCode(normalized.sourceId)) return false;
  if (normalized.sourceCode && normalizeStaffCode(canon.sourceCode) !== normalizeStaffCode(normalized.sourceCode)) return false;
  if (normalized.salesStaffCode && normalizeStaffCode(canon.salesStaffCode) !== normalizeStaffCode(normalized.salesStaffCode)) return false;
  if (normalized.deliveryStaffCode && normalizeStaffCode(canon.deliveryStaffCode) !== normalizeStaffCode(normalized.deliveryStaffCode)) return false;
  if (normalized.q) {
    const needle = lower(normalized.q);
    if (![canon.customerCode, canon.customerName, canon.sourceCode, canon.sourceId, canon.id].some((value) => lower(value).includes(needle))) return false;
  }
  return true;
}

function matchesDebtStatus(amount, row = {}, status = 'open') {
  const normalized = normalizeDebtStatus(status);
  const debt = normalizeDebtAmount(amount, DEBT_ZERO_TOLERANCE);
  if (normalized === 'all') return true;
  if (normalized === 'open') return hasOpenDebt(debt);
  if (normalized === 'closed') return !hasOpenDebt(debt);
  if (normalized === 'overpaid') return debt < 0;
  if (normalized === 'overdue') return hasOpenDebt(debt) && Number(row.overdueDays || row.overdueCount || 0) > 0;
  return lower(row.status) === normalized;
}

module.exports = {
  DEBT_ZERO_TOLERANCE,
  ACTIVE_DEBT_READ_MODEL_CATEGORIES,
  EXCLUDED_DEBT_READ_MODEL_CATEGORIES,
  buildCanonicalArLedgerMatch,
  buildActiveDebtReadModelLedgerMatch,
  normalizeArDebtFilters,
  normalizeDebtStatus,
  normalizeStaffCode,
  normalizeCanonicalLedgerRow,
  canonicalRowMatchesFilters,
  matchesDebtStatus,
  getSignedArAmount,
  isArDebtReversalLedger,
  ledgerIdentityKeys,
  reversalOriginalKeys,
  filterReadModelEligibleArLedgers,
  isOrphanReadModelReversal
};
