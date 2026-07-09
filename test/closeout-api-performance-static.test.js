'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('delivery closeout uses stable order ids before selectedOrderCodes fallback', () => {
  const route = read('src/routes/newOperationsRoutes.js');
  const service = read('src/services/accounting/AccountingCloseoutService.js');
  assert.match(route, /const stableOrderIds = \[/);
  assert.match(route, /const orderIds = stableOrderIds\.length \? stableOrderIds : fallbackOrderCodes;/);
  assert.match(service, /const stableIds = unique\(\[/);
  assert.match(service, /if \(stableIds\.length\) return stableIds;/);
});

test('order repository does not force mixed SO ids into a wide identity OR query', () => {
  const repo = read('src/repositories/orderRepository.js');
  assert.match(repo, /const salesOrderIds = values\.filter/);
  assert.match(repo, /collectionRepository\.findAll\(ORDER_KEY, \{ id: \{ \$in: salesOrderIds \} \}/);
  assert.match(repo, /fallbackValues/);
});

test('closeout related managed indexes cover fallback lookup and returnOrders fallback', () => {
  const indexes = read('src/services/mongoIndexService.js');
  assert.match(indexes, /idx_orders_order_code/);
  assert.match(indexes, /idx_orders_sales_order_id/);
  assert.match(indexes, /idx_orders_sales_order_code/);
  assert.match(indexes, /idx_orders_closeout_scope_status/);
  assert.match(indexes, /idx_return_orders_closeout_delivery_date_staff_status/);
  assert.match(indexes, /idx_return_orders_source_return_status/);
  assert.match(indexes, /idx_order_payment_allocations_source_id/);
  assert.match(indexes, /idx_order_payment_allocations_source_code/);
});

test('closeout response exposes performance diagnostics for slow request triage', () => {
  const service = read('src/services/accounting/AccountingCloseoutService.js');
  const route = read('src/routes/newOperationsRoutes.js');
  assert.match(service, /markPerformance\('loadOrders'/);
  assert.match(service, /markPerformance\('loadReturnOrders'/);
  assert.match(service, /markPerformance\('transactionAndPosting'/);
  assert.match(route, /performance: result\.performance/);
});
