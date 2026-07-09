'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMobilePagination, buildPagination } = require('../src/services/mobile/mobilePagination.util');
const sourceBundle = require('./helpers/sourceBundle.util');

const ROOT = path.join(__dirname, '..');
const read = (file) => sourceBundle.readSource(path.join(ROOT, file));

const catalogSource = read('src/services/mobile/catalog.service.js');
const catalogRoutes = read('src/routes/mobile/catalog.routes.js');
const salesService = read('src/services/mobile/sales.service.js');
const debtService = read('src/services/mobile/debts.service.js');
const debtReadService = read('src/services/DebtReadService.js');
const apiSource = read('public/mobile/js/api.js');
const salesSource = read('public/mobile/js/sales.js');
const mobileHtml = read('public/mobile/sales.html');
const indexAuditSource = read('scripts/audit-mobile-query-plans.js');

test('mobile pagination clamps invalid input and reports hasMore', () => {
  assert.deepEqual(parseMobilePagination({ page: '-2', limit: '999' }, { defaultLimit: 40, maxLimit: 100 }), {
    page: 1,
    limit: 100,
    skip: 0
  });
  assert.deepEqual(buildPagination({ page: 2, limit: 30, totalRows: 75 }), {
    page: 2,
    limit: 30,
    totalRows: 75,
    totalPages: 3,
    hasMore: true
  });
});

test('customer and product APIs paginate at MongoDB before returning mobile rows', () => {
  assert.match(catalogSource, /Customer\.find\(filter\)[\s\S]*?\.skip\(skip\)[\s\S]*?\.limit\(limit\)/);
  assert.match(catalogSource, /Product\.find\(filter\)[\s\S]*?\.skip\(skip\)[\s\S]*?\.limit\(limit\)/);
  assert.match(catalogSource, /Customer\.countDocuments\(filter\)/);
  assert.match(catalogSource, /Product\.countDocuments\(filter\)/);
  assert.match(catalogSource, /const pagination = buildPagination/);
});

test('product group filter is applied in MongoDB and groups have a dedicated endpoint', () => {
  assert.match(catalogSource, /productGroupFilter\(rawGroup\)/);
  assert.match(catalogSource, /loadProductMetadataPage\(\{ filter, page, limit, skip \}\)/);
  assert.match(catalogRoutes, /router\.get\('\/product-groups'/);
  assert.match(catalogSource, /Product\.aggregate\(\[/);
  assert.match(catalogSource, /source:\s*'mobile-product-groups-distinct'/);
});

test('catalog cache stores metadata only while inventory and quota stay live', () => {
  assert.match(catalogSource, /mobileCatalogProductMetadataCache/);
  assert.match(catalogSource, /metadata\s*=\s*await loadProductMetadataPage/);
  assert.match(catalogSource, /let products = await enrichProductsWithInventory\(metadata\.rows\)/);
  assert.match(catalogSource, /stockCached:\s*false/);
  assert.doesNotMatch(catalogSource, /cacheSet\([^\n]+products/);
});

test('customer cards batch-load monthly sales and current debt without per-row queries', () => {
  assert.match(catalogSource, /Promise\.all\(\[[\s\S]*loadMonthlySalesByCustomer\(rawCustomers/);
  assert.match(catalogSource, /DebtReadService\.loadDebtBalancesForCustomers\(rawCustomers\)/);
  assert.doesNotMatch(catalogSource, /rawCustomers\.map\(async/);
});

test('mobile orders use server-side facet for page rows and exact totals', () => {
  assert.match(salesService, /async function listSalesOrders/);
  assert.match(salesService, /\$facet:\s*\{[\s\S]*rows:[\s\S]*totals:/);
  assert.match(salesService, /\$skip:\s*skip/);
  assert.match(salesService, /\$limit:\s*limit/);
  assert.match(salesService, /pagination:\s*buildPagination/);
  assert.match(salesService, /source:\s*'mobile-sales-paged'/);
});

test('mobile debts use DebtNew canonical adapter and keep independent summary plus pagination', () => {
  assert.match(debtService, /listMobileDebtsFromDebtNew/);
  assert.match(debtService, /mobileDebtNewAdapter\.service/);
  assert.doesNotMatch(debtService, /DebtReadService\.getMobileCustomerDebts/);
  assert.match(read('src/services/mobile/mobileDebtNewAdapter.service.js'), /summary:[\s\S]*pagination/);
  assert.match(read('src/services/mobile/mobileDebtNewAdapter.service.js'), /includePendingCollections/);
  assert.match(debtReadService, /loadDebtBalancesForCustomers/);
});


test('pending debt totals only include allocations inside the authenticated order scope', () => {
  const { summarizePending } = require('../src/services/mobile/mobileDebtQuery.service')._internal;
  const summary = summarizePending([{
    amount: 300,
    customerCode: 'C01',
    allocations: [
      { salesOrderCode: 'SO-OWN', allocatedAmount: 100 },
      { salesOrderCode: 'SO-OTHER', allocatedAmount: 200 }
    ]
  }], { codes: ['SO-OWN'] });
  assert.equal(summary.total, 100);
  assert.equal(summary.byOrder.get('SO-OWN'), 100);
  assert.equal(summary.byOrder.has('SO-OTHER'), false);
});

test('mobile API client has timeout, request cancellation and bounded telemetry', () => {
  assert.match(apiSource, /DEFAULT_TIMEOUT_MS/);
  assert.match(apiSource, /activeRequestControllers/);
  assert.match(apiSource, /cancelPrevious/);
  assert.match(apiSource, /AbortController/);
  assert.match(apiSource, /REQUEST_TIMEOUT/);
  assert.match(apiSource, /MAX_TELEMETRY_ROWS/);
  assert.match(apiSource, /mkpro:mobile-api-perf/);
  assert.match(apiSource, /delete requestOptions\.clientRequestId/);
});

test('API control options are not serialized as debt query parameters', () => {
  assert.match(apiSource, /requestOptionKeys\s*=\s*new Set\(\['requestKey', 'cancelPrevious', 'timeoutMs', 'signal', 'clientRequestId'\]\)/);
  assert.match(apiSource, /if \(requestOptionKeys\.has\(key\)\) return/);
});

test('startup lazy-loads only the customer page and pending local state', () => {
  const start = salesSource.indexOf('async function initSalesApp()');
  const end = salesSource.indexOf('\nasync function filterCustomers', start);
  assert.ok(start >= 0 && end > start);
  const block = salesSource.slice(start, end);
  assert.match(block, /loadPendingOfflineOrders\(\)/);
  assert.match(block, /loadCustomers\('', \{ reset: true \}\)/);
  assert.doesNotMatch(block, /loadDebts\(/);
  assert.doesNotMatch(block, /loadTodayOrders\(/);
  assert.doesNotMatch(block, /initProductAutocomplete\(/);
});

test('debt, order and product tools load only when their tabs are opened', () => {
  assert.match(salesSource, /if \(tabId === 'debtTab'\) loadDebts\(\)/);
  assert.match(salesSource, /if \(tabId === 'reportTab'\) loadTodayOrders\(\)/);
  assert.match(salesSource, /if \(tabId === 'orderTab' \|\| tabId === 'cartTab'\) ensureProductToolsInitialized\(\)/);
});

test('mobile lists expose incremental load controls without replacing existing actions', () => {
  assert.match(mobileHtml, /id="customerLoadMoreBtn"/);
  assert.match(mobileHtml, /id="debtLoadMoreBtn"/);
  assert.match(mobileHtml, /id="orderLoadMoreBtn"/);
  assert.match(salesSource, /customerLoadMoreBtn\?\.addEventListener/);
  assert.match(salesSource, /debtLoadMoreBtn\?\.addEventListener/);
  assert.match(salesSource, /orderLoadMoreBtn\?\.addEventListener/);
});

test('query plan audit is explicitly read-only and opt-in for database explain', () => {
  assert.match(indexAuditSource, /Read-only query plan audit/);
  assert.match(indexAuditSource, /MOBILE_QUERY_PLAN_AUDIT_DB !== '1'/);
  assert.match(indexAuditSource, /explain\('executionStats'\)/);
  assert.doesNotMatch(indexAuditSource, /createIndex|dropIndex|deleteMany|updateMany|insertMany/);
});
