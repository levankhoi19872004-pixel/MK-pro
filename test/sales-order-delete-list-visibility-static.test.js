'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src/services/orderService.js'), 'utf8');

test('sales order search/list must exclude soft-deleted orders by deleted flags, not only status', () => {
  assert.match(source, /function applyActiveSalesOrderFilter\(filter = \{\}\)/);
  assert.match(source, /filter\.status = \{ \$nin: INACTIVE_ORDER_STATUS_VALUES \}/);
  assert.match(source, /filter\.lifecycleStatus = \{ \$nin: INACTIVE_ORDER_STATUS_VALUES \}/);
  assert.match(source, /filter\.deliveryStatus = \{ \$nin: INACTIVE_ORDER_STATUS_VALUES \}/);
  assert.match(source, /filter\.deleted = \{ \$nin: TRUTHY_DELETE_VALUES \}/);
  assert.match(source, /filter\.isDeleted = \{ \$nin: TRUTHY_DELETE_VALUES \}/);
  assert.match(source, /filter\.deletedAt = \{ \$in: \[null, ''\] \}/);
});

test('sales order search projection and mapping must preserve deletion flags for final visibility guard', () => {
  assert.match(source, /deleted: 1/);
  assert.match(source, /isDeleted: 1/);
  assert.match(source, /deletedAt: 1/);
  assert.match(source, /deleted: Boolean\(order\.deleted\)/);
  assert.match(source, /isDeleted: Boolean\(order\.isDeleted\)/);
  assert.match(source, /deletedAt: order\.deletedAt \|\| ''/);
  assert.match(source, /orderStatusUtil\.isOrderVisibleInHistory\(order, \{ includeCancelled \}\)/);
});
