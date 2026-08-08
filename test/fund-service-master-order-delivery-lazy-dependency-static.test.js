'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

test('fundService lazily resolves the canonical delivery financial scope adapter', () => {
  const source = read('src/services/fundService.js');

  assert.doesNotMatch(
    source,
    /const\s+masterOrderService\s*=\s*require\(['"]\.\/masterOrderService['"]\)/,
    'fundService must not import the aggregate masterOrderService facade at module load time'
  );

  assert.match(
    source,
    /function\s+getCanonicalDeliveryFinancialScopeAdapter\s*\(\)\s*\{[\s\S]*require\(['"]\.\/delivery\/CanonicalDeliveryFinancialScopeAdapter['"]\)/,
    'fundService must lazily require the canonical delivery financial scope adapter'
  );

  assert.doesNotMatch(
    source,
    /require\(['"]\.\/master-order\/masterOrderDelivery\.service['"]\)/,
    'fundService must not derive fund scope from the masterOrders-first compact reader'
  );

  assert.match(
    source,
    /DeliveryPaymentStateReadService/,
    'delivery cash submission draft should resolve canonical payment state before building fund totals'
  );
});

test('masterOrderDelivery service exposes listDeliveryToday through the query boundary', () => {
  const facade = read('src/services/master-order/masterOrderDelivery.service.js');
  const deliveryQuery = read('src/services/master-order/deliveryTodayQuery.service.js');

  assert.match(facade, /const deliveryQuery = require\('\.\/deliveryTodayQuery\.service'\)/);
  assert.match(facade, /module\.exports = \{ \.\.\.query, \.\.\.command, \.\.\.deliveryQuery, \.\.\.deliveryCommand \}/);
  assert.match(deliveryQuery, /require\('\.\/deliveryTodayList\.impl'\)/);
  assert.match(deliveryQuery, /require\('\.\/deliveryOrdersCompact\.impl'\)/);
  assert.doesNotMatch(deliveryQuery, /masterOrderLegacy\.service/);
});
