'use strict';

const canonicalOrderReader = require('./deliveryTodayCanonicalOrderReader');

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_ORDERS = 5000;

function text(value = '') {
  return String(value ?? '').trim();
}

function orderIdentity(order = {}) {
  return text(order.id || order._id || order.code || order.orderCode || order.salesOrderCode).toLowerCase();
}

async function listOrdersPage(query = {}, models = {}, options = {}) {
  return canonicalOrderReader.listSalesOrders(query, models, options);
}

async function listAllOrders(query = {}, models = {}, options = {}) {
  const pageSize = Math.max(1, Math.min(
    DEFAULT_PAGE_SIZE,
    Number(options.pageSize || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE
  ));
  const maxOrders = Math.max(pageSize, Math.min(
    DEFAULT_MAX_ORDERS,
    Number(options.maxOrders || DEFAULT_MAX_ORDERS) || DEFAULT_MAX_ORDERS
  ));
  const collected = [];
  const seen = new Set();
  const pageDiagnostics = [];
  let cursor = '';
  let page = 1;
  let pageCount = 0;
  let lastHasMore = false;

  while (collected.length < maxOrders) {
    pageCount += 1;
    if (pageCount > Math.ceil(maxOrders / pageSize) + 2) {
      const error = new Error('Canonical delivery financial scope pagination exceeded safe bound');
      error.code = 'DELIVERY_FINANCIAL_SCOPE_PAGINATION_BOUND_EXCEEDED';
      throw error;
    }

    const pageQuery = { ...query, limit: pageSize, page: cursor ? 1 : page };
    if (cursor) pageQuery.cursor = cursor;
    else delete pageQuery.cursor;

    const result = await listOrdersPage(pageQuery, models, options);
    const rows = Array.isArray(result.orders) ? result.orders : [];
    for (const row of rows) {
      const identity = orderIdentity(row);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      collected.push(row);
      if (collected.length >= maxOrders) break;
    }
    pageDiagnostics.push(result.diagnostics || {});

    const pagination = result.pagination || {};
    lastHasMore = pagination.hasMore === true;
    if (!lastHasMore) break;

    const nextCursor = text(pagination.nextCursor);
    if (nextCursor && nextCursor !== cursor) {
      cursor = nextCursor;
      continue;
    }
    if (rows.length < pageSize) break;
    cursor = '';
    page += 1;
  }

  if (collected.length >= maxOrders && lastHasMore) {
    const error = new Error(`Canonical delivery financial scope exceeds safety limit ${maxOrders}; narrow the date/staff scope`);
    error.code = 'DELIVERY_FINANCIAL_SCOPE_LIMIT_EXCEEDED';
    error.statusCode = 400;
    throw error;
  }

  const lastDiagnostics = pageDiagnostics[pageDiagnostics.length - 1] || {};
  return {
    orders: collected,
    diagnostics: {
      ...lastDiagnostics,
      financialScopeReader: 'CanonicalDeliveryFinancialScopeReader',
      primarySource: 'orders',
      orderSource: 'orders',
      masterOrdersRole: 'metadata-only',
      pageCount,
      totalOrdersLoaded: collected.length,
      pageSize,
      maxOrders
    }
  };
}

module.exports = {
  listOrdersPage,
  listAllOrders,
  orderIdentity,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MAX_ORDERS
};
