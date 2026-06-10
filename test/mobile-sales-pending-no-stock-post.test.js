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

function assertNoInventoryPosting(block, label) {
  assert.doesNotMatch(block, /inventoryService\.postStockMovement\s*\(/, `${label} must not post stock for pending mobile sales orders`);
  assert.doesNotMatch(block, /inventoryService\.reverseStockMovement\s*\(/, `${label} must not reverse stock for pending mobile sales orders`);
}

test('legacy mobile sales create/edit/delete do not post or reverse stock while order is pending', () => {
  const source = read('src/routes/mobileRoutes.js');

  assertNoInventoryPosting(routeBlock(source, 'post', '/sales/orders'), 'POST /mobile/sales/orders');
  assertNoInventoryPosting(routeBlock(source, 'put', '/sales/orders/:id'), 'PUT /mobile/sales/orders/:id');
  assertNoInventoryPosting(routeBlock(source, 'delete', '/sales/orders/:id'), 'DELETE /mobile/sales/orders/:id');
});

test('modular mobile sales service does not reduce in-memory stock for pending orders', () => {
  const source = read('src/services/mobile/sales.service.js');
  const createStart = source.indexOf('async function createSalesOrder');
  assert.notEqual(createStart, -1, 'missing createSalesOrder service');
  const createBlock = source.slice(createStart, source.indexOf('\n  async function ', createStart + 1) === -1 ? source.length : source.indexOf('\n  async function ', createStart + 1));

  assert.doesNotMatch(createBlock, /reduceStock\s*\(/, 'createSalesOrder must not reduce stock for pending mobile sales orders');
});

test('legacy mobile service does not reduce JSON stock for pending orders', () => {
  const source = read('src/services/mobileService.js');
  const createStart = source.indexOf('async function createSalesOrder');
  assert.notEqual(createStart, -1, 'missing createSalesOrder legacy service');
  const createBlock = source.slice(createStart, source.indexOf('\n  async function ', createStart + 1) === -1 ? source.length : source.indexOf('\n  async function ', createStart + 1));

  assert.doesNotMatch(createBlock, /reduceStock\s*\(/, 'legacy createSalesOrder must not reduce stock for pending mobile sales orders');
});
