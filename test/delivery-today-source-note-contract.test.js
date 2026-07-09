'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Delivery Today canonical flow declares orders as primary and masterOrders metadata-only', () => {
  const flows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config/canonical-flows.json'), 'utf8'));
  const flow = flows.deliveryTodayNewOrders;
  assert.ok(flow);
  assert.ok(flow.ssotCollections.includes('orders/salesOrders(primary)'));
  assert.ok(flow.ssotCollections.includes('masterOrders(metadata-only)'));
  assert.match(flow.sourceContract, /masterOrders = metadata-only/);
});

test('Delivery Today frontend source note uses API runtime source instead of hardcoding orders OK', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /sourceMeta/);
  assert.match(source, /sourceBreakdown/);
  assert.match(source, /Chi tiết nguồn runtime/);
  assert.doesNotMatch(source, /Nguồn:\s*orders\s*·\s*Service:\s*DeliveryTodayNewService\.listOrders\s*·\s*OK/);
});
