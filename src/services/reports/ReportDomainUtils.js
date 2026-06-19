'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const {
  INACTIVE_STATUSES,
  ACCOUNTING_CONFIRMED_STATUSES,
  ACCOUNTING_REOPEN_STATUSES,
  RETURN_CONFIRMED_STATES,
  TRUTHY_DELETE_VALUES,
  activeDocumentFilter,
  accountingConfirmedFilter,
  returnConfirmedFilter,
  businessDateStages
} = require('../dashboard/DashboardMongoExpressions');

const PROMO_LINE_TYPES = new Set(['PROMO', 'PROMOTION', 'KM', 'FREE_GOOD', 'FREE GOODS', 'FREEGOOD', 'GIFT']);
const DELIVERED_STATUSES = new Set(['delivered', 'success', 'completed', 'done', 'accounting_confirmed', 'posted']);
const RECEIPT_TYPE_PATTERN = /(receipt|payment|collection|thu[_\s-]*no|debt[_\s-]*collection)/i;
const RETURN_TYPE_PATTERN = /(return|tra[_\s-]*hang)/i;
const ADJUSTMENT_TYPE_PATTERN = /(bonus|discount|allowance|adjust|write[_\s-]*off|offset|bu[_\s-]*tru|chiet[_\s-]*khau)/i;

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function truthy(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'yes', 'y'].includes(lower(value));
}

function firstText(source = {}, fields = []) {
  for (const field of fields) {
    const value = text(field.split('.').reduce((current, key) => current?.[key], source));
    if (value) return value;
  }
  return '';
}

function firstNumber(source = {}, fields = [], options = {}) {
  const positiveOnly = Boolean(options.positiveOnly);
  const allowZero = options.allowZero !== false;
  for (const field of fields) {
    const raw = field.split('.').reduce((current, key) => current?.[key], source);
    if (raw === undefined || raw === null || text(raw) === '') continue;
    const value = toNumber(raw);
    if (positiveOnly && value <= 0) continue;
    if (!allowZero && value === 0) continue;
    return value;
  }
  return toNumber(options.fallback || 0);
}

function businessDate(row = {}, fields = []) {
  for (const field of fields) {
    const value = field.split('.').reduce((current, key) => current?.[key], row);
    const normalized = dateUtil.toDateOnly(value || '');
    if (normalized) return normalized;
  }
  return dateUtil.toDateOnly(row.createdAt || '');
}

function dateRange(query = {}) {
  const exact = dateUtil.toDateOnly(query.date || '');
  const dateFrom = dateUtil.toDateOnly(query.dateFrom || query.from || query.fromDate || exact || '');
  const dateTo = dateUtil.toDateOnly(query.dateTo || query.to || query.toDate || exact || dateUtil.todayVN());
  return { dateFrom, dateTo };
}

function inDateRange(date, query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const normalized = dateUtil.toDateOnly(date || '');
  if (!normalized) return false;
  if (dateFrom && normalized < dateFrom) return false;
  if (dateTo && normalized > dateTo) return false;
  return true;
}

function isActiveDocument(row = {}) {
  const statuses = [row.status, row.lifecycleStatus, row.deliveryStatus, row.returnStatus, row.returnState]
    .map(lower)
    .filter(Boolean);
  if (statuses.some((status) => INACTIVE_STATUSES.includes(status))) return false;
  if (TRUTHY_DELETE_VALUES.includes(row.deleted) || TRUTHY_DELETE_VALUES.includes(row.isDeleted)) return false;
  return !text(row.deletedAt);
}

function isAccountingConfirmed(row = {}) {
  const status = lower(row.accountingStatus);
  if (ACCOUNTING_REOPEN_STATUSES.includes(status)) return false;
  if (row.accountingNeedsReconfirm === true || row.needReAccounting === true || row.reAccountingRequired === true || row.adminAdjustmentOpen === true) return false;
  return row.accountingConfirmed === true
    || ACCOUNTING_CONFIRMED_STATUSES.includes(status)
    || row.arPosted === true
    || ACCOUNTING_CONFIRMED_STATUSES.includes(lower(row.arStatus));
}

function isReturnConfirmed(row = {}) {
  return row.arPosted === true
    || RETURN_CONFIRMED_STATES.includes(lower(row.returnState))
    || RETURN_CONFIRMED_STATES.includes(lower(row.status))
    || row.accountingConfirmed === true
    || ACCOUNTING_CONFIRMED_STATUSES.includes(lower(row.accountingStatus));
}

function isDelivered(row = {}) {
  return [row.deliveryStatus, row.status, row.lifecycleStatus, row.accountingStatus, row.arStatus]
    .map(lower)
    .filter(Boolean)
    .some((status) => DELIVERED_STATUSES.has(status));
}

function isPromoLine(item = {}) {
  if (truthy(item.isPromo)) return true;
  const lineType = firstText(item, ['lineType', 'type', 'kind', 'itemType']).toUpperCase();
  if (PROMO_LINE_TYPES.has(lineType)) return true;
  const promoQty = firstNumber(item, ['promoQuantity', 'promotionQuantity', 'freeQty', 'freeQuantity']);
  const soldQty = firstNumber(item, ['soldQuantity', 'saleQuantity']);
  return promoQty > 0 && soldQty <= 0;
}

function productCodeOf(item = {}) {
  return firstText(item, ['productCode', 'code', 'sku', 'productId', 'barcode', 'id']);
}

function productNameOf(item = {}) {
  return firstText(item, ['productName', 'name', 'itemName', 'productTitle']);
}

function saleQuantityOf(item = {}) {
  const sold = firstNumber(item, ['soldQuantity', 'saleQuantity'], { positiveOnly: true });
  if (sold > 0) return sold;
  return Math.max(0, firstNumber(item, ['quantity', 'qty', 'totalQty', 'stockQuantity', 'baseQuantity']));
}

function promoQuantityOf(item = {}) {
  const promo = firstNumber(item, ['promoQuantity', 'promotionQuantity', 'freeQty', 'freeQuantity'], { positiveOnly: true });
  if (promo > 0) return promo;
  return isPromoLine(item) ? Math.max(0, firstNumber(item, ['quantity', 'qty', 'totalQty', 'stockQuantity', 'baseQuantity'])) : 0;
}

function historicalCatalogPriceOf(item = {}, product = {}) {
  const historical = firstNumber(item, [
    'catalogSalePriceAtOrder',
    'priceAfterTaxBeforePromotionAtOrder',
    'listPriceAfterVat',
    'productSnapshot.salePrice',
    'catalogSalePrice',
    'grossPrice',
    'originalPrice',
    'basePrice',
    'listPrice'
  ], { positiveOnly: true });
  if (historical > 0) return { value: historical, fallbackCurrentCatalog: false };

  const legacyLinePrice = firstNumber(item, ['salePrice', 'price', 'unitPrice'], { positiveOnly: true });
  if (legacyLinePrice > 0) return { value: legacyLinePrice, fallbackCurrentCatalog: false };

  const current = firstNumber(product, ['salePrice', 'price', 'sellPrice', 'giaBan'], { positiveOnly: true });
  return { value: current, fallbackCurrentCatalog: current > 0 };
}

function actualUnitPriceOf(item = {}, catalogPrice = 0) {
  const hasExplicit = [
    'finalPriceAtOrder', 'finalPrice', 'priceAfterTaxAfterPromotion', 'priceAfterPromotion',
    'priceAfterDiscount', 'netPrice', 'unitPrice', 'salePrice', 'price'
  ].some((field) => {
    const raw = field.split('.').reduce((current, key) => current?.[key], item);
    return raw !== undefined && raw !== null && text(raw) !== '';
  });
  if (!hasExplicit) return Math.max(0, toNumber(catalogPrice));
  return Math.max(0, firstNumber(item, [
    'finalPriceAtOrder', 'finalPrice', 'priceAfterTaxAfterPromotion', 'priceAfterPromotion',
    'priceAfterDiscount', 'netPrice', 'unitPrice', 'salePrice', 'price'
  ]));
}

function explicitLineAmountOf(item = {}) {
  const fields = ['lineAmountAtOrder', 'finalAmount', 'netAmount', 'lineAmount', 'amount', 'totalAmount'];
  for (const field of fields) {
    const raw = field.split('.').reduce((current, key) => current?.[key], item);
    if (raw !== undefined && raw !== null && text(raw) !== '') {
      return { hasValue: true, value: Math.max(0, toNumber(raw)) };
    }
  }
  return { hasValue: false, value: 0 };
}

const ROOT_ACTUAL_AMOUNT_FIELDS = Object.freeze([
  'afterPromoAmount', 'totalAfterPromotion', 'goodsAmountAfterPromotion', 'netAmount',
  'totalAmount', 'grandTotal', 'amount', 'total'
]);

function hasDefinedField(source = {}, field = '') {
  const raw = field.split('.').reduce((current, key) => current?.[key], source);
  return raw !== undefined && raw !== null && text(raw) !== '';
}

function hasRootActualAmount(order = {}) {
  return ROOT_ACTUAL_AMOUNT_FIELDS.some((field) => hasDefinedField(order, field));
}

function rootActualAmountOf(order = {}) {
  for (const field of ROOT_ACTUAL_AMOUNT_FIELDS) {
    if (!hasDefinedField(order, field)) continue;
    const raw = field.split('.').reduce((current, key) => current?.[key], order);
    return Math.max(0, toNumber(raw));
  }
  return 0;
}

function versionValue(row = {}) {
  return firstText(row, ['updatedAt', 'modifiedAt', 'stateChangedAt', 'createdAt', '_id']);
}

function documentBusinessKey(row = {}, kind = 'sales') {
  const fields = kind === 'return'
    ? ['code', 'returnOrderCode', 'documentCode', 'id', '_id']
    : ['code', 'orderCode', 'salesOrderCode', 'documentCode', 'invoiceCode', 'id', '_id'];
  return firstText(row, fields);
}

function deduplicateDocuments(rows = [], kind = 'sales') {
  const map = new Map();
  let duplicateCount = 0;
  for (const row of rows) {
    const key = documentBusinessKey(row, kind) || String(row._id || '');
    const current = map.get(key);
    if (!current || versionValue(row) >= versionValue(current)) {
      if (current) duplicateCount += 1;
      map.set(key, row);
    } else {
      duplicateCount += 1;
    }
  }
  return { rows: Array.from(map.values()), duplicateCount };
}

function ledgerType(row = {}) {
  return [row.type, row.sourceType, row.source, row.refType, row.note].map(text).join(' ');
}

function classifyArCredit(row = {}) {
  const value = ledgerType(row);
  if (RETURN_TYPE_PATTERN.test(value)) return 'return';
  if (ADJUSTMENT_TYPE_PATTERN.test(value)) return 'adjustment';
  if (RECEIPT_TYPE_PATTERN.test(value)) return 'receipt';
  return 'other';
}

function orderIdentityValues(order = {}) {
  return [
    order._id, order.id, order.code, order.orderCode, order.salesOrderCode,
    order.documentCode, order.externalOrderCode, order.invoiceCode
  ].map(text).filter(Boolean);
}

function ledgerOrderIdentityValues(row = {}) {
  return [
    row.orderId, row.salesOrderId, row.sourceOrderId, row.refId, row.sourceId,
    row.orderCode, row.salesOrderCode, row.sourceOrderCode, row.refCode, row.sourceCode
  ].map(text).filter(Boolean);
}

function customerKey(row = {}) {
  return firstText(row, ['customerCode', 'customerId', 'customerName']);
}

function staffIdentity(row = {}, kind = 'sales') {
  if (kind === 'delivery') {
    return {
      code: firstText(row, ['deliveryStaffCode', 'deliveryCode', 'nvghCode', 'deliveryStaff.code']),
      name: firstText(row, ['deliveryStaffName', 'deliveryName', 'nvghName', 'deliveryStaff.name', 'deliveryStaff.fullName'])
    };
  }
  return {
    code: firstText(row, ['salesStaffCode', 'salesmanCode', 'nvbhCode', 'salesStaff.code']),
    name: firstText(row, ['salesStaffName', 'salesmanName', 'nvbhName', 'salesStaff.name', 'salesStaff.fullName'])
  };
}

function paginate(rows = [], query = {}, defaults = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const defaultLimit = Number(defaults.defaultLimit || 50);
  const maxLimit = Number(defaults.maxLimit || 200);
  const full = ['1', 'true', 'yes', 'full'].includes(lower(query.full || query.export));
  const limit = full ? Math.max(rows.length, 1) : Math.min(Math.max(Number(query.limit || defaultLimit), 1), maxLimit);
  const skip = full ? 0 : (page - 1) * limit;
  return {
    rows: full ? rows : rows.slice(skip, skip + limit),
    meta: {
      page: full ? 1 : page,
      limit,
      total: rows.length,
      totalPages: rows.length ? Math.ceil(rows.length / limit) : 0,
      hasMore: full ? false : skip + limit < rows.length
    }
  };
}

module.exports = {
  PROMO_LINE_TYPES,
  activeDocumentFilter,
  accountingConfirmedFilter,
  returnConfirmedFilter,
  businessDateStages,
  text,
  lower,
  truthy,
  firstText,
  firstNumber,
  businessDate,
  dateRange,
  inDateRange,
  isActiveDocument,
  isAccountingConfirmed,
  isReturnConfirmed,
  isDelivered,
  isPromoLine,
  productCodeOf,
  productNameOf,
  saleQuantityOf,
  promoQuantityOf,
  historicalCatalogPriceOf,
  actualUnitPriceOf,
  explicitLineAmountOf,
  ROOT_ACTUAL_AMOUNT_FIELDS,
  hasDefinedField,
  hasRootActualAmount,
  rootActualAmountOf,
  documentBusinessKey,
  deduplicateDocuments,
  classifyArCredit,
  orderIdentityValues,
  ledgerOrderIdentityValues,
  customerKey,
  staffIdentity,
  paginate,
  toNumber
};
