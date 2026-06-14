'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('fundService lazily resolves the delivery-only master order service', () => {
  const source = read('src/services/fundService.js');

  assert.doesNotMatch(
    source,
    /const\s+masterOrderService\s*=\s*require\(['"]\.\/masterOrderService['"]\)/,
    'fundService must not import the aggregate masterOrderService facade at module load time'
  );

  assert.match(
    source,
    /function\s+getMasterOrderDeliveryService\s*\(\)\s*\{[\s\S]*require\(['"]\.\/master-order\/masterOrderDelivery\.service['"]\)/,
    'fundService must lazily require masterOrderDelivery.service'
  );

  assert.match(
    source,
    /getMasterOrderDeliveryService\(\)\.listDeliveryToday\s*\(/,
    'delivery cash submission draft must call listDeliveryToday through the lazy delivery service'
  );
});

test('masterOrderDelivery service exposes listDeliveryToday through the query boundary', () => {
  const facade = read('src/services/master-order/masterOrderDelivery.service.js');
  const deliveryQuery = read('src/services/master-order/deliveryTodayQuery.service.js');

  assert.match(facade, /const deliveryQuery = require\('\.\/deliveryTodayQuery\.service'\)/);
  assert.match(facade, /module\.exports = \{ \.\.\.query, \.\.\.command, \.\.\.deliveryQuery, \.\.\.deliveryCommand \}/);
  assert.match(deliveryQuery, /listDeliveryToday:\s*\(\.\.\.args\) => legacy\.listDeliveryToday\(\.\.\.args\)/);
});
