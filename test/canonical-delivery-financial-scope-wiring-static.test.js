'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { readSource } = require('./helpers/sourceBundle.util');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Delivery Today and Fund share one canonical orders-first financial scope boundary', () => {
  const deliveryToday = read('src/services/v2/deliveryTodayNew.service.js');
  const fundSource = readSource('src/services/fundService.js');
  const adapter = read('src/services/delivery/CanonicalDeliveryFinancialScopeAdapter.js');
  const scopeReader = read('src/services/delivery/CanonicalDeliveryFinancialScopeReader.js');

  assert.match(deliveryToday, /CanonicalDeliveryFinancialScopeReader\.listOrdersPage\(/);
  assert.match(fundSource, /CanonicalDeliveryFinancialScopeAdapter/);
  assert.match(adapter, /CanonicalDeliveryFinancialScopeReader\.listAllOrders\(/);
  assert.match(scopeReader, /canonicalOrderReader\.listSalesOrders\(/);

  assert.doesNotMatch(fundSource, /require\(['"]\.\/master-order\/masterOrderDelivery\.service['"]\)/);
  assert.doesNotMatch(adapter, /masterOrderDelivery|deliveryOrdersCompact|masterOrderRepository/);
  assert.match(scopeReader, /masterOrdersRole:\s*'metadata-only'/);
  assert.match(scopeReader, /primarySource:\s*'orders'/);

  const flows = JSON.parse(read('config/canonical-flows.json'));
  assert.ok(flows.deliveryTodayNewOrders.services.includes('src/services/delivery/CanonicalDeliveryFinancialScopeReader.js'));
  assert.ok(flows.fundLedger.services.includes('src/services/delivery/CanonicalDeliveryFinancialScopeAdapter.js'));
  assert.ok(flows.fundLedger.services.includes('src/services/delivery/CanonicalDeliveryFinancialScopeReader.js'));
  assert.match(flows.fundLedger.sourceContract, /orders\/salesOrders[\s\S]*masterOrders = metadata-only/);
});
