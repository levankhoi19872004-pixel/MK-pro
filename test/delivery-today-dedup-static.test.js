'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'src/engines/delivery.legacy.engine.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'public/js/delivery/delivery-core.js'), 'utf8');

test('DeliveryEngine dedupes duplicate salesOrders by business order code before summary', () => {
  assert.match(engine, /function canonicalDeliveryOrderKey\(order = \{\}\)/);
  assert.match(engine, /return `code:\$\{compact\(businessCode\)\}`/);
  assert.match(engine, /function dedupeDeliveryOrders\(rows = \[\]\)/);
  assert.match(engine, /return dedupeDeliveryOrders\(orders\);/);
  assert.match(engine, /const orders = dedupeDeliveryOrders\(await this\.findOrders\(query\)\);/);
  assert.match(engine, /rows = dedupeDeliveryOrders\(applyDeliveryStatusFilter\(rows, query\)\);/);
});

test('DeliveryCore dedupes API rows defensively before rendering', () => {
  assert.match(core, /function canonicalBusinessOrderKey\(order\)/);
  assert.match(core, /function dedupeOrders\(rows\)/);
  assert.match(core, /var rows = dedupeOrders\(json\.orders \|\| json\.rows \|\| json\.items \|\| \[\]\);/);
  assert.match(core, /this\.state\.orders = dedupeOrders\(rows\.map\(normalizeOrder\)\);/);
});
