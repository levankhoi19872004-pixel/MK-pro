'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DeliveryTodayNewService does not use masterOrderLegacy listDeliveryToday as primary reader', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/v2/deliveryTodayNew.service.js'), 'utf8');
  assert.doesNotMatch(source, /require\([^)]*masterOrderLegacy\.service/);
  assert.doesNotMatch(source, /\.listDeliveryToday\s*\(/);
  assert.match(source, /deliveryTodayCanonicalOrderReader/);
  assert.match(source, /loadCanonicalSalesOrders/);
});

test('Canonical reader documents masterOrders as metadata only', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/delivery/deliveryTodayCanonicalOrderReader.js'), 'utf8');
  assert.match(source, /metadata-only/);
  assert.match(source, /primarySource: 'orders'/);
});
