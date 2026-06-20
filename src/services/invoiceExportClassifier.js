'use strict';

const dateUtil = require('../utils/date.util');

const INVOICE_TYPES = Object.freeze({
  VAT: 'VAT',
  NON_VAT: 'NON_VAT'
});

const NON_VAT_TEXT_VALUES = Object.freeze([
  'false', '0', 'no', 'n', 'non_vat', 'non-vat', 'khong', 'không'
]);

const INACTIVE_STATUS_VALUES = Object.freeze([
  'void', 'cancelled', 'canceled', 'deleted', 'removed', 'duplicate_cancelled', 'reversed'
]);

const TRUTHY_DELETE_VALUES = Object.freeze([
  true, 1, '1', 'true', 'yes', 'y', 'deleted', 'removed'
]);

function cleanText(value) {
  return String(value ?? '').trim();
}


const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeDateOnly(value) {
  return dateUtil.toDateOnly(value || '') || cleanText(value).slice(0, 10);
}

function vietnamDateBoundaryIso(dateOnly, endOfDay = false) {
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized) return '';
  const start = new Date(`${normalized}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) return '';
  return new Date(start.getTime() + (endOfDay ? DAY_IN_MS - 1 : 0)).toISOString();
}

function normalizeInvoiceType(value) {
  const normalized = cleanText(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === INVOICE_TYPES.VAT) return INVOICE_TYPES.VAT;
  if (['NON_VAT', 'NOVAT', 'NO_VAT', 'KHONG_VAT', 'KHÔNG_VAT'].includes(normalized)) {
    return INVOICE_TYPES.NON_VAT;
  }
  return '';
}

function isExplicitNonVatValue(value) {
  if (value === false || value === 0) return true;
  if (value === true || value === 1 || value === null || value === undefined) return false;
  return NON_VAT_TEXT_VALUES.includes(cleanText(value).toLowerCase());
}

function resolveInvoiceType(order = {}) {
  return isExplicitNonVatValue(order.vatInvoiceRequired)
    ? INVOICE_TYPES.NON_VAT
    : INVOICE_TYPES.VAT;
}

function isTruthyDeleteValue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  return TRUTHY_DELETE_VALUES.includes(cleanText(value).toLowerCase());
}

function hasDeletedAt(value) {
  if (value === null || value === undefined) return false;
  const text = cleanText(value).toLowerCase();
  return Boolean(text && text !== 'null' && text !== 'undefined');
}

function isActiveInvoiceOrder(order = {}) {
  const statuses = [order.status, order.lifecycleStatus, order.deliveryStatus]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);
  if (statuses.some((status) => INACTIVE_STATUS_VALUES.includes(status))) return false;
  if (isTruthyDeleteValue(order.deleted) || isTruthyDeleteValue(order.isDeleted)) return false;
  if (hasDeletedAt(order.deletedAt)) return false;
  return true;
}

function invoiceTypeStringExpression() {
  return {
    $toLower: {
      $trim: {
        input: {
          $convert: {
            input: '$vatInvoiceRequired',
            to: 'string',
            onError: '',
            onNull: ''
          }
        }
      }
    }
  };
}

function buildInvoiceTypeMongoClause(invoiceType) {
  const normalized = normalizeInvoiceType(invoiceType);
  if (!normalized) return null;
  const isNonVat = { $in: [invoiceTypeStringExpression(), [...NON_VAT_TEXT_VALUES]] };
  return {
    $expr: normalized === INVOICE_TYPES.NON_VAT
      ? isNonVat
      : { $not: [isNonVat] }
  };
}

function buildActiveInvoiceMongoClause() {
  const inactive = [...INACTIVE_STATUS_VALUES];
  const deletedValues = [...TRUTHY_DELETE_VALUES];
  return {
    $and: [
      { status: { $nin: inactive } },
      { lifecycleStatus: { $nin: inactive } },
      { deliveryStatus: { $nin: inactive } },
      { deleted: { $nin: deletedValues } },
      { isDeleted: { $nin: deletedValues } },
      {
        $or: [
          { deletedAt: { $exists: false } },
          { deletedAt: null },
          { deletedAt: '' }
        ]
      }
    ]
  };
}


function buildInvoiceOrderFilter(query = {}, invoiceType) {
  const normalizedType = normalizeInvoiceType(invoiceType);
  if (!normalizedType) throw Object.assign(new Error('Loại xuất hóa đơn không hợp lệ'), { statusCode: 400 });

  const clauses = [
    buildActiveInvoiceMongoClause(),
    buildInvoiceTypeMongoClause(normalizedType)
  ].filter(Boolean);
  const dateFrom = normalizeDateOnly(query.dateFrom || query.from || query.fromDate || '');
  const dateTo = normalizeDateOnly(query.dateTo || query.to || query.toDate || '');

  if (dateFrom || dateTo) {
    const dateRange = {
      ...(dateFrom ? { $gte: dateFrom } : {}),
      ...(dateTo ? { $lte: dateTo } : {})
    };
    const createdAtRange = {
      ...(dateFrom ? { $gte: vietnamDateBoundaryIso(dateFrom, false) } : {}),
      ...(dateTo ? { $lte: vietnamDateBoundaryIso(dateTo, true) } : {})
    };
    clauses.push({
      $or: [
        { orderDate: dateRange },
        { date: dateRange },
        { documentDate: dateRange },
        { createdAt: createdAtRange }
      ]
    });
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function partitionInvoiceOrders(orders = []) {
  const result = { VAT: [], NON_VAT: [], excluded: [] };
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isActiveInvoiceOrder(order)) {
      result.excluded.push(order);
      continue;
    }
    result[resolveInvoiceType(order)].push(order);
  }
  return result;
}

module.exports = {
  INVOICE_TYPES,
  NON_VAT_TEXT_VALUES,
  INACTIVE_STATUS_VALUES,
  TRUTHY_DELETE_VALUES,
  normalizeInvoiceType,
  isExplicitNonVatValue,
  resolveInvoiceType,
  isActiveInvoiceOrder,
  buildInvoiceTypeMongoClause,
  buildActiveInvoiceMongoClause,
  buildInvoiceOrderFilter,
  partitionInvoiceOrders
};
