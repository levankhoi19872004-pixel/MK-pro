'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function functionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `missing async function ${name}`);
  const next = source.indexOf('\nasync function ', start + 1);
  const nextPlain = source.indexOf('\nfunction ', start + 1);
  const candidates = [next, nextPlain].filter((idx) => idx !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test('SalesLifecycleService exposes sales lifecycle contract', () => {
  const source = read('src/domain/lifecycle/SalesLifecycleService.js');

  assert.match(source, /async function createOrder\(body = \{\}, options = \{\}\)/);
  assert.match(source, /async function updateOrder\(idOrCode, body = \{\}, options = \{\}\)/);
  assert.match(source, /async function cancelOrder\(idOrCode, body = \{\}, options = \{\}\)/);
  assert.match(source, /async function confirmDelivery\(orderOrId = \{\}, body = \{\}, options = \{\}\)/);
  assert.match(source, /InventoryPostingService\.postSaleOut\(order, options\)/);
  assert.match(source, /InventoryPostingService\.reverseMovement\(order, \{/);
  assert.match(source, /ArPostingService\.reverseSale\(order, options\)/);
});

test('SalesLifecycleService cancelOrder does not double reverse current orderService behavior', () => {
  const source = read('src/domain/lifecycle/SalesLifecycleService.js');
  const cancelBlock = functionBlock(source, 'cancelOrder');

  assert.match(cancelBlock, /getOrderService\(\)\.cancelOrder\(idOrCode, body, options\)/);
  assert.doesNotMatch(cancelBlock, /InventoryPostingService\.reverseMovement\(/);
  assert.doesNotMatch(cancelBlock, /ArPostingService\.reverseSale\(/);
});

test('SalesLifecycleService keeps legacy confirmDelivery compatibility while supporting object patch mode', () => {
  const source = read('src/domain/lifecycle/SalesLifecycleService.js');
  const confirmBlock = functionBlock(source, 'confirmDelivery');

  assert.match(confirmBlock, /getMasterOrderService\(\)\.updateDeliveryTodayOrder\(orderOrId,/);
  assert.match(confirmBlock, /deliveryStatus: body\.deliveryStatus \|\| orderOrId\.deliveryStatus \|\| 'delivered'/);
  assert.match(confirmBlock, /status: body\.status \|\| orderOrId\.status \|\| 'delivered'/);
});
