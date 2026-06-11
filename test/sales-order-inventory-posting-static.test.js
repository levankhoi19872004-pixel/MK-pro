'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('sales order inventory posting goes through InventoryPostingService boundary', () => {
  const orderService = read('src/services/orderService.js');
  const lifecycle = read('src/domain/lifecycle/SalesLifecycleService.js');

  assert.match(orderService, /InventoryPostingService\.postSaleOut\(order, options\)/);
  assert.doesNotMatch(orderService, /postStockMovement\(order, \{\s*type:\s*['"]SALE['"]/s);

  assert.match(lifecycle, /async function createOrder\(body = \{\}, options = \{\}\)/);
  assert.match(lifecycle, /InventoryPostingService\.postSaleOut\(order, options\)/);
});

test('sales cancellation lifecycle does not double reverse stock or AR', () => {
  const lifecycle = read('src/domain/lifecycle/SalesLifecycleService.js');
  const cancelStart = lifecycle.indexOf('async function cancelOrder(');
  const reverseStart = lifecycle.indexOf('async function reverseCancelledOrderIfNeeded(');
  assert.notEqual(cancelStart, -1, 'cancelOrder() must exist');
  assert.notEqual(reverseStart, -1, 'reverseCancelledOrderIfNeeded() must exist');

  const cancelBlock = lifecycle.slice(cancelStart, reverseStart);
  assert.match(cancelBlock, /getOrderService\(\)\.cancelOrder\(idOrCode, body, options\)/);
  assert.doesNotMatch(cancelBlock, /InventoryPostingService\.reverseMovement\(/);
  assert.doesNotMatch(cancelBlock, /ArPostingService\.reverseSale\(/);
});
