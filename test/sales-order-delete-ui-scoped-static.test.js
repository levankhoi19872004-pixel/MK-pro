'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('sales history delete uses scoped ajax request with identity fallback and reloads list', () => {
  const source = read('public/js/app/05-sales-orders.source/part-03.jsfrag');
  assert.match(source, /function salesOrderDeleteRefs\(order\)/);
  assert.match(source, /order\?\.id,[\s\S]*order\?\.code,[\s\S]*order\?\.externalOrderCode,[\s\S]*order\?\.sourceOrderCode/);
  assert.match(source, /'X-Requested-With':'XMLHttpRequest'/);
  assert.match(source, /credentials:'same-origin'/);
  assert.match(source, /sendSalesOrderDeleteRequest\(ref,reason\)/);
  assert.match(source, /await loadSalesOrders\(\{page:salesOrderCurrentPage\|\|1,append:false\}\)/);
});

test('sales history action delegation prevents row/checkbox propagation before delete', () => {
  const source = read('public/js/app/05-sales-orders.source/part-03.jsfrag');
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /if\(button\.dataset\.salesOrderAction==='delete'\)\{deleteSalesOrder\(index\);return;\}/);
});

test('backend exposes POST delete alias to same remove controller without changing policy', () => {
  const routes = read('src/routes/orderRoutes.js');
  assert.match(routes, /router\.post\('\/:id\/delete', writeOrders, orderController\.remove\)/);
  assert.match(routes, /router\.delete\('\/:id', writeOrders, orderController\.remove\)/);
});

test('order repository deletion resolves BO/external aliases and validates deletedCount', () => {
  const repo = read('src/repositories/orderRepository.js');
  const service = read('src/domain/lifecycle/SalesOrderDeletionService.js');
  assert.match(repo, /'externalOrderCode'/);
  assert.match(repo, /'sourceOrderCode'/);
  assert.match(repo, /async function removeResolved\(order = \{\}, fallbackRef = '', options = \{\}\)/);
  assert.match(service, /const removeResult = await orderRepository\.removeResolved\(order, idOrCode, \{ session \}\)/);
  assert.match(service, /ORDER_DELETE_IDENTITY_MISMATCH/);
});
