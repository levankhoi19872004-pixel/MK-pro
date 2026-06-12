'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function routeBlock(source, method, route) {
  const needle = `router.${method}('${route}'`;
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `missing route ${needle}`);
  const next = source.indexOf('\nrouter.', start + needle.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function assertHasInventoryPosting(block, label) {
  assert.match(block, /InventoryPostingService\.postSaleOut\s*\(/, `${label} must post stock immediately through InventoryPostingService`);
  assert.match(block, /withMongoTransaction\s*\(/, `${label} must post stock inside Mongo transaction`);
  assert.doesNotMatch(block, /inventoryService\.postStockMovement\s*\(/, `${label} must not call inventoryService.postStockMovement directly`);
}

function assertHasInventoryReversal(block, label) {
  assert.match(block, /InventoryPostingService\.reverseMovement\s*\(/, `${label} must reverse stock through InventoryPostingService`);
  assert.match(block, /withMongoTransaction\s*\(/, `${label} must reverse stock inside Mongo transaction`);
  assert.doesNotMatch(block, /inventoryService\.reverseStockMovement\s*\(/, `${label} must not call inventoryService.reverseStockMovement directly`);
}

test('legacy mobile sales write routes are disabled with 410 to protect inventory contract', () => {
  const source = read('src/routes/mobileRoutes.js');

  for (const [method, route] of [['post', '/sales/orders'], ['put', '/sales/orders/:id'], ['delete', '/sales/orders/:id']]) {
    const block = routeBlock(source, method, route);
    assert.match(block, /legacyMobileSalesWriteGone/, `${method.toUpperCase()} ${route} must be intercepted by 410 guard`);
  }

  assert.match(source, /function legacyMobileSalesWriteGone\(req, res\)/);
  assert.match(source, /Mobile legacy đã ngừng ghi tồn/);
  assert.match(source, /\/api\/mobile modular route/);
});

test('modular mobile sales create writes order and stock atomically without snapshot stock mutation', () => {
  const source = read('src/services/mobile/sales.service.js');
  const createStart = source.indexOf('async function createSalesOrder');
  assert.notEqual(createStart, -1, 'missing createSalesOrder service');
  const createBlock = source.slice(createStart, source.indexOf('\n  async function ', createStart + 1) === -1 ? source.length : source.indexOf('\n  async function ', createStart + 1));

  assert.match(createBlock, /withMongoTransaction\s*\(async \(session\)/, 'createSalesOrder must receive Mongo session');
  assert.match(createBlock, /SalesOrder\.create\s*\(\[salesOrder\], \{ session \}\)/, 'createSalesOrder must persist SalesOrder through session');
  assert.match(createBlock, /InventoryPostingService\.postSaleOut\s*\([^,]+, \{ session \}\)/, 'createSalesOrder must post stock ledger through session');
  assert.doesNotMatch(createBlock, /reduceStock\s*\(/, 'createSalesOrder must not mutate snapshot stock');
  assert.doesNotMatch(createBlock, /repo\.saveOperationalData\s*\(data\)/, 'createSalesOrder must not replace snapshot collections');
});

test('legacy mobile service is not the exposed sales write path anymore', () => {
  const source = read('src/routes/mobileRoutes.js');
  const firstPost = routeBlock(source, 'post', '/sales/orders');
  const firstPut = routeBlock(source, 'put', '/sales/orders/:id');
  const firstDelete = routeBlock(source, 'delete', '/sales/orders/:id');

  assert.doesNotMatch(firstPost, /reduceStock\s*\(/);
  assert.doesNotMatch(firstPut, /reduceStock\s*\(/);
  assert.doesNotMatch(firstDelete, /reduceStock\s*\(/);
});
