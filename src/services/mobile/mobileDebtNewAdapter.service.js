'use strict';

const dateUtil = require('../../utils/date.util');
const { normalizeDebtAmount } = require('../../constants/finance.constants');
const { parseMobilePagination, buildPagination } = require('./mobilePagination.util');

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function positiveMoney(value) {
  return Math.max(0, normalizeDebtAmount(money(value)));
}

function salesStaffCode(user = {}) {
  return text(user.salesStaffCode || user.salesmanCode || user.nvbhCode || user.maNVBH || user.staffCode || user.code);
}

function salesStaffName(user = {}) {
  return text(user.salesStaffName || user.salesmanName || user.nvbhName || user.maNVBHName || user.fullName || user.name);
}

function deliveryStaffCode(user = {}) {
  return text(user.deliveryStaffCode || user.deliveryCode || user.shipperCode || user.nvghCode || user.staffCode || user.code);
}

function deliveryStaffName(user = {}) {
  return text(user.deliveryStaffName || user.deliveryName || user.shipperName || user.nvghName || user.fullName || user.name);
}

function hasAdminDebtScope(user = {}) {
  const role = lower(user.role || user.type || user.userType || user.primaryRole);
  const roles = Array.isArray(user.roles) ? user.roles.map(lower) : [];
  return ['admin', 'accountant', 'accounting', 'manager', 'superadmin'].includes(role)
    || roles.some((item) => ['admin', 'accountant', 'accounting', 'manager', 'superadmin'].includes(item));
}

function buildMobileDebtNewQuery({ query = {}, mobileUser = {}, user = {} } = {}) {
  const role = lower(mobileUser.role || user.role || '');
  const requestedCollectorType = lower(query.collectorType || '');
  const includePaid = String(query.includePaid || '0') === '1';
  const status = text(query.status) || (includePaid ? 'all' : 'open');

  const scopedQuery = {
    ...query,
    status,
    includePendingCollections: query.includePendingCollections ?? '1',
    source: 'mobile-sales-debtnew',
    // DebtNewService uses limit as ledgerLimit. Mobile page limit must not truncate
    // canonical AR rows before grouping, so keep the web-like default ledger window.
    ledgerLimit: query.ledgerLimit || query.rawLimit || 500
  };

  delete scopedQuery.limit;
  delete scopedQuery.page;
  delete scopedQuery.rawLimit;

  if (query.customerKeyword && !scopedQuery.q) scopedQuery.q = query.customerKeyword;

  const canOverrideScope = hasAdminDebtScope(mobileUser) || hasAdminDebtScope(user);
  const forcedSalesCode = salesStaffCode(mobileUser);
  const forcedSalesName = salesStaffName(mobileUser);
  const forcedDeliveryCode = deliveryStaffCode(mobileUser);
  const forcedDeliveryName = deliveryStaffName(mobileUser);

  if (role === 'sales' || requestedCollectorType === 'sales') {
    scopedQuery.collectorType = 'sales';
    if (role === 'sales' && forcedSalesCode) scopedQuery.salesStaffCode = forcedSalesCode;
    else if (role === 'sales' && forcedSalesName) scopedQuery.salesStaffName = forcedSalesName;
    else if (!canOverrideScope && forcedSalesCode) scopedQuery.salesStaffCode = forcedSalesCode;
    else if (!canOverrideScope && forcedSalesName) scopedQuery.salesStaffName = forcedSalesName;
    else if (query.salesmanCode && !query.salesStaffCode) scopedQuery.salesStaffCode = query.salesmanCode;

    delete scopedQuery.deliveryStaffCode;
    delete scopedQuery.deliveryCode;
    delete scopedQuery.deliveryStaffName;
    delete scopedQuery.delivery;
  } else if (role === 'delivery' || requestedCollectorType === 'delivery') {
    scopedQuery.collectorType = 'delivery';
    if (role === 'delivery' && forcedDeliveryCode) scopedQuery.deliveryStaffCode = forcedDeliveryCode;
    else if (role === 'delivery' && forcedDeliveryName) scopedQuery.deliveryStaffName = forcedDeliveryName;
    else if (!canOverrideScope && forcedDeliveryCode) scopedQuery.deliveryStaffCode = forcedDeliveryCode;
    else if (!canOverrideScope && forcedDeliveryName) scopedQuery.deliveryStaffName = forcedDeliveryName;
    else if (query.deliveryCode && !query.deliveryStaffCode) scopedQuery.deliveryStaffCode = query.deliveryCode;

    delete scopedQuery.salesStaffCode;
    delete scopedQuery.salesmanCode;
    delete scopedQuery.salesStaffName;
    delete scopedQuery.salesmanName;
    delete scopedQuery.salesman;
  } else {
    if (query.salesmanCode && !query.salesStaffCode) scopedQuery.salesStaffCode = query.salesmanCode;
    if (query.deliveryCode && !query.deliveryStaffCode) scopedQuery.deliveryStaffCode = query.deliveryCode;
  }

  return scopedQuery;
}

function debtValue(row = {}) {
  return positiveMoney(row.debtAmount ?? row.remainingDebt ?? row.debt ?? row.openDebtAmount ?? row.availableDebtAmount ?? 0);
}

function pendingValue(row = {}) {
  return positiveMoney(row.pendingCollectedAmount ?? row.pendingCollectionAmount ?? 0);
}

function availableValue(row = {}) {
  const explicit = row.availableDebtAmount ?? row.availableDebt ?? row.availableToCollect;
  if (explicit != null) return positiveMoney(explicit);
  return positiveMoney(debtValue(row) - pendingValue(row));
}

function mapDebtNewOrderToMobile(order = {}, customer = {}) {
  const debtAmount = debtValue(order);
  const pendingCollectedAmount = pendingValue(order);
  const availableDebtAmount = Math.max(0, availableValue(order));
  const orderCode = text(order.salesOrderCode || order.orderCode || order.sourceCode || order.refCode || order.orderId || order.salesOrderId);
  const orderId = text(order.salesOrderId || order.orderId || order.sourceId || order.refId || order.id);
  return {
    orderId,
    salesOrderId: orderId,
    orderCode,
    salesOrderCode: orderCode,
    sourceCode: text(order.sourceCode || orderCode),
    refCode: text(order.refCode || orderCode),
    orderDate: dateUtil.toDateOnly(order.orderDate || order.documentDate || order.date || order.lastDebtDate || ''),
    documentDate: dateUtil.toDateOnly(order.documentDate || order.orderDate || order.date || order.lastDebtDate || ''),
    debit: money(order.debit),
    credit: money(order.credit),
    debt: debtAmount,
    debtAmount,
    remainingDebt: debtAmount,
    pendingCollectionAmount: pendingCollectedAmount,
    pendingCollectedAmount,
    availableDebt: availableDebtAmount,
    availableDebtAmount,
    availableToCollect: availableDebtAmount,
    collectionLocked: pendingCollectedAmount > 0,
    collectible: availableDebtAmount > 0,
    pendingCollections: Array.isArray(order.pendingCollections) ? order.pendingCollections : [],
    status: text(order.status),
    salesStaffCode: text(order.salesStaffCode || customer.salesStaffCode || customer.salesmanCode),
    salesStaffName: text(order.salesStaffName || customer.salesStaffName || customer.salesmanName),
    deliveryStaffCode: text(order.deliveryStaffCode || customer.deliveryStaffCode),
    deliveryStaffName: text(order.deliveryStaffName || customer.deliveryStaffName)
  };
}

function mapDebtNewCustomerToMobile(customer = {}) {
  const orders = (Array.isArray(customer.orders) ? customer.orders : []).map((order) => mapDebtNewOrderToMobile(order, customer));
  const debtAmount = debtValue(customer);
  const pendingCollectedAmount = orders.length
    ? orders.reduce((sum, order) => sum + money(order.pendingCollectedAmount), 0)
    : pendingValue(customer);
  const availableDebtAmount = orders.length
    ? orders.reduce((sum, order) => sum + money(order.availableDebtAmount), 0)
    : Math.max(0, positiveMoney(debtAmount - pendingCollectedAmount));
  const oldestDebtDate = orders
    .map((order) => order.orderDate || order.documentDate || '')
    .filter(Boolean)
    .sort()[0] || dateUtil.toDateOnly(customer.oldestDebtDate || customer.lastDebtDate || '');

  return {
    customerId: text(customer.customerId || customer.id),
    customerCode: text(customer.customerCode),
    customerName: text(customer.customerName),
    phone: text(customer.phone || customer.customerPhone),
    address: text(customer.address || customer.customerAddress),
    salesStaffCode: text(customer.salesStaffCode || customer.salesmanCode),
    salesStaffName: text(customer.salesStaffName || customer.salesmanName),
    salesmanCode: text(customer.salesmanCode || customer.salesStaffCode),
    salesmanName: text(customer.salesmanName || customer.salesStaffName),
    deliveryStaffCode: text(customer.deliveryStaffCode),
    deliveryStaffName: text(customer.deliveryStaffName),
    debtAmount,
    remainingDebt: debtAmount,
    pendingCollectionAmount: pendingCollectedAmount,
    pendingCollectedAmount,
    availableDebt: availableDebtAmount,
    availableDebtAmount,
    availableToCollect: availableDebtAmount,
    collectionLocked: pendingCollectedAmount > 0,
    collectible: availableDebtAmount > 0,
    orderCount: money(customer.orderCount || orders.length),
    oldestDebtDate,
    oldestDebtDateText: oldestDebtDate,
    orders,
    ledgers: orders.map((order) => ({
      date: order.documentDate || order.orderDate || '',
      type: 'AR_CANONICAL_DEBTNEW',
      source: 'DebtNewService.listCustomers',
      salesOrderCode: order.salesOrderCode || '',
      refCode: order.refCode || order.salesOrderCode || '',
      debit: money(order.debit),
      credit: money(order.credit),
      debt: money(order.debtAmount)
    }))
  };
}

function mapDebtNewSummaryToMobile(result = {}, items = [], allCustomers = []) {
  const summary = result.summary || {};
  const totalDebt = summary.totalDebt != null
    ? positiveMoney(summary.totalDebt)
    : allCustomers.reduce((sum, row) => sum + money(row.debtAmount), 0);
  const pendingCollected = summary.pendingCollectedAmount ?? summary.pendingCollected ?? summary.pendingCollectionAmount;
  const availableDebt = summary.availableDebtAmount ?? summary.availableDebt ?? summary.availableToCollect;
  return {
    ...summary,
    totalDebt,
    totalDebit: money(summary.totalDebit),
    totalCredit: money(summary.totalCredit),
    pendingCollected: pendingCollected != null ? positiveMoney(pendingCollected) : allCustomers.reduce((sum, row) => sum + money(row.pendingCollectedAmount), 0),
    pendingCollectedAmount: pendingCollected != null ? positiveMoney(pendingCollected) : allCustomers.reduce((sum, row) => sum + money(row.pendingCollectedAmount), 0),
    availableDebt: availableDebt != null ? positiveMoney(availableDebt) : allCustomers.reduce((sum, row) => sum + money(row.availableDebtAmount), 0),
    availableDebtAmount: availableDebt != null ? positiveMoney(availableDebt) : allCustomers.reduce((sum, row) => sum + money(row.availableDebtAmount), 0),
    customerCount: money(summary.customerCount || allCustomers.length),
    orderCount: money(summary.orderCount || allCustomers.reduce((sum, row) => sum + money(row.orderCount), 0)),
    pageCustomerCount: items.length,
    source: 'arLedgers',
    readModelVersion: 'mobile-debtnew-v1'
  };
}

function mapDebtNewResultToMobileDebtResponse(result = {}, options = {}) {
  const query = options.query || {};
  const { page, limit, skip } = parseMobilePagination(query, { defaultLimit: 30, maxLimit: 100 });
  const allCustomers = (Array.isArray(result.customers) ? result.customers : []).map(mapDebtNewCustomerToMobile);
  const includePaid = String(query.includePaid || '0') === '1';
  const visibleCustomers = includePaid ? allCustomers : allCustomers.filter((row) => row.debtAmount > 0 || row.pendingCollectedAmount > 0);
  const items = visibleCustomers.slice(skip, skip + limit);
  const pagination = buildPagination({ page, limit, totalRows: visibleCustomers.length });
  pagination.total = pagination.totalRows;
  pagination.nextPage = pagination.hasMore ? page + 1 : null;
  pagination.totalPages = pagination.totalPages || Math.ceil((pagination.totalRows || 0) / limit);

  return {
    ok: true,
    success: true,
    source: 'mobile-debtnew-arledgers',
    ledgerCollection: 'arLedgers',
    readModelVersion: 'mobile-debtnew-v1',
    summary: mapDebtNewSummaryToMobile(result, items, visibleCustomers),
    items,
    pagination,
    diagnostics: {
      ...(result.diagnostics || {}),
      source: 'mobile-debtnew-arledgers',
      canonicalService: 'DebtNewService.listCustomers',
      legacyMobileDebtQueryRuntime: false,
      endpoint: '/api/mobile/debts'
    },
    sourceNote: result.sourceNote || null
  };
}

async function listMobileDebtsFromDebtNew({ query = {}, mobileUser = {}, user = {}, options = {} } = {}) {
  const scopedQuery = buildMobileDebtNewQuery({ query, mobileUser, user });
  const DebtNewService = require('../v2/debtNew.service');
  const result = await DebtNewService.listCustomers(scopedQuery, options);
  return mapDebtNewResultToMobileDebtResponse(result, { query, scopedQuery, mobileUser, user });
}

module.exports = {
  listMobileDebtsFromDebtNew,
  buildMobileDebtNewQuery,
  mapDebtNewResultToMobileDebtResponse,
  _internal: {
    text,
    money,
    debtValue,
    pendingValue,
    availableValue,
    salesStaffCode,
    salesStaffName,
    deliveryStaffCode,
    deliveryStaffName,
    hasAdminDebtScope,
    mapDebtNewOrderToMobile,
    mapDebtNewCustomerToMobile,
    mapDebtNewSummaryToMobile
  }
};
