'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }

test('legacy delivery/mobile namespaces are explicit retired guards, not second write flows', () => {
  const routes = read('src/routes/index.js');
  assert.match(routes, /retiredRoute\('legacy-web-delivery-today-alias'/);
  assert.match(routes, /retiredRoute\('mobile-legacy'/);
  assert.doesNotMatch(routes, /app\.use\('\/api\/mobile-legacy',\s*mobileModule/);
});

test('master-return write flow is classified before it can be used as canonical return stock-in path', () => {
  const retired = read('config/retired-flows.json');
  assert.match(retired, /master-return-orders-write-flow/);
  assert.match(retired, /returnStockInAccounting/);
  const canonical = read('config/canonical-flows.json');
  assert.match(canonical, /"returnStockInAccounting"/);
  assert.match(canonical, /"returnOrders"/);
});


test('master-return write/receive routes are blocked by retiredRoute and cannot post stock as a second flow', () => {
  const routes = read('src/routes/masterReturnOrderRoutes.js');
  assert.match(routes, /retiredMasterReturnWrite/);
  assert.match(routes, /retiredMasterReturnStockIn/);
  assert.match(routes, /router\.post\('\/',\s*manageMasterReturns,\s*retiredMasterReturnWrite\)/);
  assert.match(routes, /router\.post\('\/:id\/receive',\s*manageMasterReturns,\s*retiredMasterReturnStockIn\)/);
  assert.doesNotMatch(routes, /router\.post\('\/:id\/receive',\s*manageMasterReturns,\s*masterReturnOrderController\.receive\)/);
});
