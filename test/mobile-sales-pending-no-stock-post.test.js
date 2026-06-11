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

test('legacy mobile sales create/edit/delete post or reverse stock through InventoryPostingService transaction boundary', () => {
  const source = read('src/routes/mobileRoutes.js');

  assertHasInventoryPosting(routeBlock(source, 'post', '/sales/orders'), 'POST /mobile/sales/orders');
  assertHasInventoryPosting(routeBlock(source, 'put', '/sales/orders/:id'), 'PUT /mobile/sales/orders/:id');
  assertHasInventoryReversal(routeBlock(source, 'put', '/sales/orders/:id'), 'PUT /mobile/sales/orders/:id');
  assertHasInventoryReversal(routeBlock(source, 'delete', '/sales/orders/:id'), 'DELETE /mobile/sales/orders/:id');
});

test('modular mobile sales service reduces in-memory stock immediately', () => {
  const source = read('src/services/mobile/sales.service.js');
  const createStart = source.indexOf('async function createSalesOrder');
  assert.notEqual(createStart, -1, 'missing createSalesOrder service');
  const createBlock = source.slice(createStart, source.indexOf('\n  async function ', createStart + 1) === -1 ? source.length : source.indexOf('\n  async function ', createStart + 1));

  assert.match(createBlock, /reduceStock\s*\(/, 'createSalesOrder must reduce stock immediately');
});

test('legacy mobile service reduces JSON stock immediately', () => {
  const source = read('src/services/mobileService.js');
  const createStart = source.indexOf('async function createSalesOrder');
  assert.notEqual(createStart, -1, 'missing createSalesOrder legacy service');
  const createBlock = source.slice(createStart, source.indexOf('\n  async function ', createStart + 1) === -1 ? source.length : source.indexOf('\n  async function ', createStart + 1));

  assert.match(createBlock, /reduceStock\s*\(/, 'legacy createSalesOrder must reduce stock immediately');
});
