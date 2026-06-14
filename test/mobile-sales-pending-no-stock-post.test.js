'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

test('legacy mobile sales write implementation is physically removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/routes/mobileRoutes.js')), false);
  const index = read('src/routes/index.js');
  assert.match(index, /retiredRoute\('mobile-legacy'/);
  assert.doesNotMatch(index, /ENABLE_LEGACY_MOBILE_ROUTES/);
});

test('modular mobile sales create writes order and stock atomically without snapshot stock mutation', () => {
  const source = read('src/services/mobile/sales.service.js');
  const createStart = source.indexOf('async function createSalesOrder');
  assert.notEqual(createStart, -1, 'missing createSalesOrder service');
  const next = source.indexOf('\n  async function ', createStart + 1);
  const createBlock = source.slice(createStart, next === -1 ? source.length : next);
  assert.match(createBlock, /withMongoTransaction\s*\(async \(session\)/);
  assert.match(createBlock, /canonicalSalesOrder = canonicalizeOperationalStaff\(salesOrder\)/);
  assert.match(createBlock, /SalesOrder\.create\s*\(\[canonicalSalesOrder\], \{ session \}\)/);
  assert.match(createBlock, /InventoryPostingService\.postSaleOut\s*\([^,]+, \{ session \}\)/);
  assert.doesNotMatch(createBlock, /reduceStock\s*\(/);
  assert.doesNotMatch(createBlock, /repo\.saveOperationalData\s*\(data\)/);
});

test('modular sales routes are the only exposed mobile sales command path', () => {
  const routes = read('src/routes/mobile/sales.routes.js');
  assert.match(routes, /router\.post\('\/orders'/);
  assert.match(routes, /router\.put\('\/orders\/:id'/);
  assert.match(routes, /router\.delete\('\/orders\/:id'/);
  assert.match(routes, /requireMobileRole\(\['sales'\]\)/);
});
