'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase36B delivery orders uses canonical master link before legacy fallback', () => {
  const part01 = read('src/engines/delivery.legacy.engine.source/part-01.jsfrag');
  const part02 = read('src/engines/delivery.legacy.engine.source/part-02.jsfrag');
  assert.match(part01, /function canonicalMasterAssignmentMongoClause\(\)/);
  assert.match(part01, /function legacyMasterAssignmentMongoClause\(\)/);
  assert.doesNotMatch(part01, /\$nin:\s*\[null,\s*''\]/);
  assert.match(part02, /scopedSalesOrderLookup\(masterAssignmentMongoClause\(\), \{ fast: true \}\)/);
  assert.match(part02, /scopedSalesOrderLookup\(masterAssignmentMongoClause\(\{ legacy: true \}\), \{ fast: true \}\)/);
});

test('Phase36B delivery returns resolves SO code by direct indexed lookup with projection and lean', () => {
  const part01 = read('src/engines/delivery.legacy.engine.source/part-01.jsfrag');
  const part02 = read('src/engines/delivery.legacy.engine.source/part-02.jsfrag');
  assert.match(part01, /function directOrderLookupCandidates\(value\)/);
  assert.match(part01, /push\(\{ id: key \}\)/);
  assert.match(part02, /async resolveSalesOrderByKnownCode\(key, options = \{\}\)/);
  assert.match(part02, /findOne\(filter\)/);
  assert.match(part02, /select\(DELIVERY_ORDER_SELECT\)/);
  assert.match(part02, /getCanonicalOrderByKey\(key, options = \{\}\) \{\s*const order = await this\.resolveSalesOrderByKnownCode/s);
});

test('Phase36B confirm-accounting uses direct SalesOrder id query and short duplicate-submit guard', () => {
  const repo = read('src/repositories/orderRepository.js');
  const service = read('src/services/master-order/deliveryAccountingCommand.impl.js');
  assert.match(repo, /async function findManyByIds\(ids = \[\], options = \{\}\)/);
  assert.match(repo, /\{ id: \{ \$in: values \} \}/);
  assert.match(service, /CONFIRM_ACCOUNTING_GUARD_TTL_MS/);
  assert.match(service, /confirmAccountingInFlight/);
  assert.match(service, /findSalesOrdersByIdsBatched\(missingSelectedSalesOrderIds/);
  assert.match(service, /ACCOUNTING_SALES_ORDER_PROJECTION/);
});

test('Phase36B dashboard home has short ttl-only summary cache without freshness query fan-out by default', () => {
  const cache = read('src/services/dashboard/DashboardCacheService.js');
  const deliveryQuery = read('src/services/dashboard/DeliveryDashboardQuery.js');
  assert.match(cache, /\? 45000/);
  assert.match(cache, /HOME_DASHBOARD_CACHE_STRICT_FRESHNESS/);
  assert.match(cache, /if \(!STRICT_FRESHNESS\) return 'ttl-only'/);
  assert.match(deliveryQuery, /return \{ id: \{ \$in: salesOrderIds \} \}/);
});

test('Phase36B promotions programs avoids duplicate frontend fetch and narrows rule projections', () => {
  const service = read('src/services/promotionService.js');
  const frontend = read('public/js/app/admin/08e-promotion-programs.js');
  assert.match(service, /PROMOTION_PROGRAM_LIST_PROJECTION/);
  assert.match(service, /PROMOTION_PRODUCT_RULE_PROJECTION/);
  assert.match(service, /PromotionProductRule\.find\(filter\)\.select\(PROMOTION_PRODUCT_RULE_PROJECTION\)/);
  assert.match(service, /PromotionGroupItem\.find\(filter\)\.select\(PROMOTION_GROUP_ITEM_PROJECTION\)/);
  assert.match(frontend, /programListRequests = new Map\(\)/);
  assert.match(frontend, /programListRequests\.has\(requestKey\)/);
  assert.match(frontend, /setTimeout\(\(\)=>loadPromotionProgramsByType\(activeType\),250\)/);
});

test('Phase36B delivery accounting buttons are locked while submit is running', () => {
  const part01 = read('public/js/delivery/delivery-web-view.source/part-01.jsfrag');
  const part03 = read('public/js/delivery/delivery-web-view.source/part-03.jsfrag');
  assert.match(part01, /accountingSubmitting: false/);
  assert.match(part01, /function setAccountingSubmitting\(value\)/);
  assert.match(part01, /async function withAccountingSubmitLock\(work\)/);
  assert.match(part03, /return withAccountingSubmitLock\(async function \(\) \{/);
});

