'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('feature flag defaults to legacy and DB-native path is explicit', () => {
  const source = read('src/services/delivery/deliveryTodayCanonicalOrderReader.js');
  assert.match(source, /PERF_DELIVERY_CANONICAL_FILTER_V1/);
  assert.match(source, /if \(!enabled\)[\s\S]*listSalesOrdersLegacy/);
  assert.match(source, /readerMode: 'db-native'/);
  assert.match(source, /readerMode: 'legacy-fallback'/);
});

test('canonical date key is declared and desired compound indexes are registered', () => {
  const model = read('src/models/SalesOrder.js');
  const indexes = read('src/services/mongoIndexService.js');
  assert.match(model, /deliveryDateKey:\s*String/);
  for (const name of [
    'idx_orders_delivery_date_key_staff_created',
    'idx_orders_delivery_date_key_sales_created',
    'idx_orders_delivery_date_key_customer_created',
    'idx_master_orders_delivery_staff_updated'
  ]) {
    assert.match(indexes, new RegExp(name));
  }
});

test('optimized latest-state pipelines have grouping but no global hard limit', () => {
  const source = read('src/services/delivery/DeliveryFinancialLatestStateBatchReader.js');
  assert.match(source, /\$group/);
  assert.match(source, /\$replaceRoot/);
  assert.doesNotMatch(source, /\$limit/);
  assert.doesNotMatch(source, /limit\(5000\)/);
});

test('HTTP response exposes pagination without changing rows payload', () => {
  const route = read('src/routes/newOperationsRoutes.js');
  assert.match(route, /rows:\s*result\.rows/);
  assert.match(route, /orders:\s*result\.orders/);
  assert.match(route, /pagination:\s*result\.pagination\s*\|\|\s*null/);
});
