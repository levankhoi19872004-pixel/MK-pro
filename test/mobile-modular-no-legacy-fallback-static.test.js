'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('mobile modular routes require ctx and do not fallback to legacy under /api/mobile', () => {
  const mobileIndex = read('src/routes/mobile/index.js');
  const routeIndex = read('src/routes/index.js');

  assert.match(mobileIndex, /MOBILE_MODULAR_ROUTE_ONLY_START/);
  assert.match(mobileIndex, /Mobile routes require ctx\. Legacy fallback disabled/);

  assert.doesNotMatch(mobileIndex, /require\(['"]\.\.\/mobileRoutes['"]\)/);
  assert.doesNotMatch(mobileIndex, /router\.use\(legacyMobileRoutes\)/);

  assert.match(routeIndex, /createMobileContext/);
  assert.match(routeIndex, /mobileModule\.registerMobileRoutes\(app,\s*mobileCtx\)/);
  assert.match(routeIndex, /retiredRoute\('mobile-legacy'/);

  assert.doesNotMatch(routeIndex, /registerMobileRoutes\(app\);/);
});

test('mobile child routes do not repeat modular prefixes', () => {
  const sales = read('src/routes/mobile/sales.routes.js');
  const delivery = read('src/routes/mobile/delivery.routes.js');
  const catalog = read('src/controllers/mobile/catalog.controller.js');

  assert.doesNotMatch(sales, /['"]\/sales\/orders/);
  assert.match(sales, /router\.post\(['"]\/orders['"]/);
  assert.match(sales, /router\.get\(['"]\/orders\/:id['"]/);

  assert.doesNotMatch(delivery, /['"]\/delivery\/orders/);
  assert.doesNotMatch(delivery, /['"]\/delivery\/payment/);
  assert.match(delivery, /router\.get\(['"]\/orders['"]/);
  assert.match(delivery, /router\.post\(['"]\/payment['"]/);

  assert.match(catalog, /createMobileCatalogService/);
  assert.doesNotMatch(catalog, /createMobileService/);
});
