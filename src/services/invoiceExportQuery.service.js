'use strict';

const mongoose = require('mongoose');
const dateUtil = require('../utils/date.util');
const SalesOrder = require('../models/SalesOrder');
const ReturnOrder = require('../models/ReturnOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const {
  INVOICE_TYPES,
  normalizeInvoiceType,
  buildActiveInvoiceMongoClause,
  buildInvoiceTypeMongoClause
} = require('./invoiceExportClassifier');
const {
  RETURN_STATES,
  getReturnState
} = require('../domain/lifecycle/ReturnStateMachine');

const INVOICE_GROUPS = Object.freeze({
  VAT: INVOICE_TYPES.VAT,
  NON_VAT: INVOICE_TYPES.NON_VAT,
  ALL: 'ALL'
});

const ORDER_PROJECTION = [
  'id', 'tenantId', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderCode',
  'masterOrderId', 'masterOrderCode', 'masterId', 'masterCode', 'deliveryMasterId', 'deliveryMasterCode',
  'date', 'orderDate', 'documentDate', 'createdDate', 'createdAt',
  'deleted', 'isDeleted', 'deletedAt',
  'customerId', 'customerCode', 'customerName', 'customerPhone',
  'salesStaffCode', 'salesStaffName', 'salesPersonCode', 'salesPersonName',
  'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName', 'maNVBH', 'maNVBHName',
  'sseCustomerCode', 'customerSseCode', 'accountingCustomerCode', 'customerAccountingCode', 'customerErpCode',
  'sseSalesmanCode', 'accountingSalesmanCode', 'salesStaffSseCode', 'salesStaffAccountingCode',
  'vatInvoiceRequired', 'status', 'lifecycleStatus', 'deliveryStatus',
  'source', 'orderSource', 'totalAmount', 'grandTotal', 'paidAmount', 'paymentAmount', 'debtAmount',
  'vatInvoiceNote', 'vatInvoiceUpdatedBy', 'vatInvoiceUpdatedAt', 'items'
].join(' ');

const RETURN_PROJECTION = [
  'id', 'tenantId', 'code', 'returnOrderCode', 'documentCode',
  'salesOrderId', 'orderId', 'sourceOrderId', 'deliveryOrderId',
  'salesOrderCode', 'orderCode', 'sourceOrderCode', 'deliveryOrderCode', 'originalOrderCode',
  'masterOrderId', 'masterOrderCode', 'masterDeliveryOrderId', 'masterDeliveryOrderCode', 'masterId', 'masterCode',
  'items', 'status', 'returnStatus', 'returnState', 'warehouseReceiveStatus',
  'accountingStatus', 'accountingConfirmed', 'accountingConfirmedAt',
  'arPosted', 'arPostedAt', 'deleted', 'isDeleted', 'deletedAt',
  'updatedAt', 'createdAt', 'date', 'documentDate'
].join(' ');

function cleanText(value) {
  return String(value ?? '').trim();
}

function exportError(message, code = 'INVALID_EXPORT_FILTER', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function isValidDateOnly(value) {
  const raw = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const normalized = dateUtil.toDateOnly(raw);
  return normalized === raw;
}

function parseOptionalDate(value, label) {
  const raw = cleanText(value);
  if (!raw) return '';
  if (!isValidDateOnly(raw)) {
    throw exportError(`${label} phải có định dạng YYYY-MM-DD`, 'INVALID_EXPORT_DATE');
  }
  return raw;
}

function normalizeInvoiceGroup(value, fallback = INVOICE_GROUPS.ALL) {
  const raw = cleanText(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (!raw) return fallback;
  if (raw === INVOICE_GROUPS.ALL || raw === 'TAT_CA' || raw === 'TẤT_CẢ') return INVOICE_GROUPS.ALL;
  return normalizeInvoiceType(raw);
}

function normalizeExportQuery(query = {}, options = {}) {
  const dateFrom = parseOptionalDate(query.dateFrom || query.fromDate || query.from || '', 'Từ ngày');
  const dateTo = parseOptionalDate(query.dateTo || query.toDate || query.to || '', 'Đến ngày');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw exportError('Từ ngày không được lớn hơn Đến ngày', 'INVALID_EXPORT_DATE_RANGE');
  }

  const invoiceGroup = normalizeInvoiceGroup(
    options.invoiceGroup ?? query.invoiceType ?? query.invoiceGroup,
    options.defaultInvoiceGroup || INVOICE_GROUPS.ALL
  );
  if (!invoiceGroup) {
    throw exportError('invoiceType chỉ nhận VAT, NON_VAT hoặc ALL', 'INVALID_INVOICE_TYPE');
  }

  const salesStaffCode = cleanText(query.salesStaffCode || '');
  const limitDefault = Number(options.defaultLimit || 20000);
  const limitMax = Number(options.maxLimit || 100000);
  const parsedLimit = Number(query.limit || limitDefault);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : limitDefault, 1), limitMax);

  return { dateFrom, dateTo, salesStaffCode, invoiceGroup, limit };
}

function missingFieldClause(field) {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: '' }
    ]
  };
}

function dateRangeClause(field, dateFrom, dateTo) {
  return {
    [field]: {
      ...(dateFrom ? { $gte: dateFrom } : {}),
      ...(dateTo ? { $lte: dateTo } : {})
    }
  };
}

function vietnamBoundaryIso(dateOnly, endOfDay = false) {
  if (!dateOnly) return '';
  const start = new Date(`${dateOnly}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) return '';
  return new Date(start.getTime() + (endOfDay ? 24 * 60 * 60 * 1000 - 1 : 0)).toISOString();
}

function createdAtRangeClause(dateFrom, dateTo) {
  return {
    createdAt: {
      ...(dateFrom ? { $gte: vietnamBoundaryIso(dateFrom, false) } : {}),
      ...(dateTo ? { $lte: vietnamBoundaryIso(dateTo, true) } : {})
    }
  };
}

function buildBusinessDateMongoClause(filters = {}) {
  const { dateFrom = '', dateTo = '' } = filters;
  if (!dateFrom && !dateTo) return null;

  const orderMissing = missingFieldClause('orderDate');
  const documentMissing = missingFieldClause('documentDate');
  const dateMissing = missingFieldClause('date');
  const createdDateMissing = missingFieldClause('createdDate');

  return {
    $or: [
      dateRangeClause('orderDate', dateFrom, dateTo),
      { $and: [orderMissing, dateRangeClause('documentDate', dateFrom, dateTo)] },
      { $and: [orderMissing, documentMissing, dateRangeClause('date', dateFrom, dateTo)] },
      { $and: [orderMissing, documentMissing, dateMissing, dateRangeClause('createdDate', dateFrom, dateTo)] },
      { $and: [orderMissing, documentMissing, dateMissing, createdDateMissing, createdAtRangeClause(dateFrom, dateTo)] }
    ]
  };
}

function buildSalesStaffMongoClause(salesStaffCode) {
  const code = cleanText(salesStaffCode);
  if (!code) return null;

  const canonicalMissing = missingFieldClause('salesStaffCode');
  const salesPersonMissing = missingFieldClause('salesPersonCode');
  const salesmanMissing = missingFieldClause('salesmanCode');
  const nvbhMissing = missingFieldClause('nvbhCode');

  return {
    $or: [
      { salesStaffCode: code },
      { $and: [canonicalMissing, { salesPersonCode: code }] },
      { $and: [canonicalMissing, salesPersonMissing, { salesmanCode: code }] },
      { $and: [canonicalMissing, salesPersonMissing, salesmanMissing, { nvbhCode: code }] },
      { $and: [canonicalMissing, salesPersonMissing, salesmanMissing, nvbhMissing, { maNVBH: code }] }
    ]
  };
}

function buildTenantClause(currentUser = {}) {
  // Dự án mặc định single-tenant. Chỉ áp scope tenant khi vận hành đã bật rõ multi-tenant.
  // Trước đây TENANT_MODE để trống vẫn bị hiểu như multi-tenant, làm dữ liệu đơn cũ
  // chưa có tenantId bị lọc hết và file xuất chỉ còn tiêu đề.
  const tenantMode = cleanText(process.env.TENANT_MODE || 'single').toLowerCase();
  if (tenantMode !== 'multi') return null;
  const tenantId = cleanText(currentUser.tenantId || currentUser.tenantCode);
  return tenantId ? { tenantId } : null;
}

function buildInvoiceOrderMongoFilter(query = {}, options = {}) {
  const filters = options.normalizedFilters || normalizeExportQuery(query, options);
  const clauses = [buildActiveInvoiceMongoClause()];
  if (filters.invoiceGroup !== INVOICE_GROUPS.ALL) {
    clauses.push(buildInvoiceTypeMongoClause(filters.invoiceGroup));
  }
  const dateClause = buildBusinessDateMongoClause(filters);
  const staffClause = buildSalesStaffMongoClause(filters.salesStaffCode);
  const tenantClause = buildTenantClause(options.currentUser || {});
  if (dateClause) clauses.push(dateClause);
  if (staffClause) clauses.push(staffClause);
  if (tenantClause) clauses.push(tenantClause);
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function businessDateOf(order = {}) {
  return dateUtil.toDateOnly(
    order.orderDate || order.documentDate || order.date || order.createdDate || order.createdAt || ''
  );
}

function businessSalesStaffCodeOf(order = {}) {
  return cleanText(
    order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH || ''
  );
}

function matchesInvoiceExportFilters(order = {}, query = {}, options = {}) {
  let filters;
  try {
    filters = options.normalizedFilters || normalizeExportQuery(query, options);
  } catch (_error) {
    return false;
  }
  const date = businessDateOf(order);
  if (filters.dateFrom && (!date || date < filters.dateFrom)) return false;
  if (filters.dateTo && (!date || date > filters.dateTo)) return false;
  if (filters.salesStaffCode && businessSalesStaffCodeOf(order) !== filters.salesStaffCode) return false;
  return true;
}

function uniqueText(values = []) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function orderLinkValues(order = {}) {
  return {
    ids: uniqueText([order._id, order.id, order.orderId, order.salesOrderId, order.sourceOrderId, order.deliveryOrderId]),
    codes: uniqueText([
      order.code, order.orderCode, order.salesOrderCode,
      order.documentCode, order.invoiceCode, order.sourceOrderCode, order.deliveryOrderCode
    ]),
    masterIds: uniqueText([order.masterOrderId, order.masterId, order.deliveryMasterId]),
    masterCodes: uniqueText([order.masterOrderCode, order.masterCode, order.deliveryMasterCode])
  };
}

function buildReturnLinkFilter(orders = [], currentUser = {}) {
  const ids = [];
  const codes = [];
  const masterIds = [];
  const masterCodes = [];
  for (const order of orders || []) {
    const links = orderLinkValues(order);
    ids.push(...links.ids);
    codes.push(...links.codes);
    masterIds.push(...links.masterIds);
    masterCodes.push(...links.masterCodes);
  }
  const idValues = uniqueText(ids);
  const codeValues = uniqueText(codes);
  const masterIdValues = uniqueText(masterIds);
  const masterCodeValues = uniqueText(masterCodes);
  const links = [];
  if (idValues.length) {
    links.push(
      { salesOrderId: { $in: idValues } },
      { orderId: { $in: idValues } },
      { sourceOrderId: { $in: idValues } },
      { deliveryOrderId: { $in: idValues } }
    );
  }
  if (codeValues.length) {
    links.push(
      { salesOrderCode: { $in: codeValues } },
      { orderCode: { $in: codeValues } },
      { sourceOrderCode: { $in: codeValues } },
      { deliveryOrderCode: { $in: codeValues } },
      { originalOrderCode: { $in: codeValues } }
    );
  }
  if (masterIdValues.length) {
    links.push(
      { masterOrderId: { $in: masterIdValues } },
      { masterDeliveryOrderId: { $in: masterIdValues } },
      { masterId: { $in: masterIdValues } }
    );
  }
  if (masterCodeValues.length) {
    links.push(
      { masterOrderCode: { $in: masterCodeValues } },
      { masterDeliveryOrderCode: { $in: masterCodeValues } },
      { masterCode: { $in: masterCodeValues } }
    );
  }
  if (!links.length) return { _id: null };

  // Query all linked return documents once, then apply the same operational
  // eligibility rule used by the delivery screen in JavaScript. Do not require
  // accounting confirmation here: delivery returns are commonly stored as
  // returnStatus='active'/accountingStatus='pending' while already representing
  // goods physically returned by the customer.
  const clauses = [{ $or: links }];
  const tenantClause = buildTenantClause(currentUser);
  if (tenantClause) clauses.push(tenantClause);
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function isDeletedRecord(row = {}) {
  const truthy = new Set(['1', 'true', 'yes', 'y', 'deleted', 'removed']);
  if (row.deleted === true || row.isDeleted === true) return true;
  if (truthy.has(cleanText(row.deleted).toLowerCase()) || truthy.has(cleanText(row.isDeleted).toLowerCase())) return true;
  const deletedAt = cleanText(row.deletedAt).toLowerCase();
  return Boolean(deletedAt && deletedAt !== 'null' && deletedAt !== 'undefined');
}

function isEligibleReturnOrder(row = {}) {
  if (isDeletedRecord(row)) return false;

  const inactiveStatuses = new Set([
    'cancelled', 'canceled', 'void', 'voided', 'deleted', 'removed',
    'cleared', 'duplicate_cancelled', 'rejected', 'inactive'
  ]);
  const rawStatuses = [
    row.returnState,
    row.status,
    row.returnStatus,
    row.accountingStatus,
    row.warehouseReceiveStatus
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  if (rawStatuses.some((value) => inactiveStatuses.has(value))) return false;

  const state = getReturnState(row);
  if (state === RETURN_STATES.CANCELLED || state === RETURN_STATES.DRAFT) return false;

  // Operational return documents in this project are frequently waiting_receive
  // or received while accountingStatus is still pending. They are already shown
  // as customer returns in “Đơn giao hôm nay” and must reduce the invoice export.
  return [
    RETURN_STATES.WAITING_RECEIVE,
    RETURN_STATES.RECEIVED,
    RETURN_STATES.ACCOUNTING_CONFIRMED,
    RETURN_STATES.POSTED_TO_AR
  ].includes(state);
}

async function leanResult(query) {
  return query && typeof query.lean === 'function' ? query.lean() : query;
}

function applySelect(query, projection) {
  return query && typeof query.select === 'function' ? query.select(projection) : query;
}

function applySort(query, sort) {
  return query && typeof query.sort === 'function' ? query.sort(sort) : query;
}

function applyLimit(query, limit) {
  return query && typeof query.limit === 'function' ? query.limit(limit) : query;
}

async function loadInvoiceExportData({ query = {}, invoiceGroup = INVOICE_GROUPS.ALL, currentUser = {}, maxOrders = 100000 } = {}) {
  const filters = normalizeExportQuery(query, { invoiceGroup, defaultInvoiceGroup: invoiceGroup, maxLimit: maxOrders });
  const orderFilter = buildInvoiceOrderMongoFilter(query, { normalizedFilters: filters, currentUser });
  let orderQuery = SalesOrder.find(orderFilter);
  orderQuery = applySelect(orderQuery, ORDER_PROJECTION);
  orderQuery = applySort(orderQuery, { orderDate: 1, documentDate: 1, date: 1, code: 1 });
  orderQuery = applyLimit(orderQuery, filters.limit);
  const orders = (await leanResult(orderQuery)) || [];

  const customerCodes = uniqueText(orders.map((order) => order.customerCode));
  const customerIds = uniqueText(orders.map((order) => order.customerId)).filter((value) => mongoose.isValidObjectId(value));
  const productCodes = [];
  const productIds = [];
  for (const order of orders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const code = cleanText(item.productCode || item.code || item.sku || item.barcode);
      const id = cleanText(item.productId || item._id);
      if (code) productCodes.push(code);
      if (mongoose.isValidObjectId(id)) productIds.push(id);
    }
  }

  const customerClauses = [];
  if (customerCodes.length) customerClauses.push({ code: { $in: customerCodes } });
  if (customerIds.length) customerClauses.push({ _id: { $in: customerIds } });
  const productClauses = [];
  const uniqueProductCodes = uniqueText(productCodes);
  const uniqueProductIds = uniqueText(productIds);
  if (uniqueProductCodes.length) productClauses.push({ code: { $in: uniqueProductCodes } });
  if (uniqueProductIds.length) productClauses.push({ _id: { $in: uniqueProductIds } });

  let returnQuery = ReturnOrder.find(buildReturnLinkFilter(orders, currentUser));
  returnQuery = applySelect(returnQuery, RETURN_PROJECTION);
  const [rawReturnOrders, customers, products] = await Promise.all([
    leanResult(returnQuery),
    customerClauses.length ? leanResult(Customer.find({ $or: customerClauses })) : [],
    productClauses.length ? leanResult(Product.find({ $or: productClauses })) : []
  ]);

  return {
    filters,
    orders,
    returnOrders: (rawReturnOrders || []).filter(isEligibleReturnOrder),
    customers: customers || [],
    products: products || []
  };
}

module.exports = {
  INVOICE_GROUPS,
  ORDER_PROJECTION,
  RETURN_PROJECTION,
  normalizeInvoiceGroup,
  normalizeExportQuery,
  buildBusinessDateMongoClause,
  buildSalesStaffMongoClause,
  buildInvoiceOrderMongoFilter,
  businessDateOf,
  businessSalesStaffCodeOf,
  matchesInvoiceExportFilters,
  buildReturnLinkFilter,
  isEligibleReturnOrder,
  loadInvoiceExportData
};
