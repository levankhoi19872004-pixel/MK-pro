'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src/services/mobile/sales.service.js'), 'utf8');

test('mobile sales list must exclude soft-deleted orders by deletion flags', () => {
  assert.match(source, /function activeSalesOrderMongoFilter\(\) \{/);
  assert.match(source, /INACTIVE_MOBILE_ORDER_STATUS_VALUES/);
  assert.match(source, /status: \{ \$nin: INACTIVE_MOBILE_ORDER_STATUS_VALUES \}/);
  assert.match(source, /lifecycleStatus: \{ \$nin: INACTIVE_MOBILE_ORDER_STATUS_VALUES \}/);
  assert.match(source, /deliveryStatus: \{ \$nin: INACTIVE_MOBILE_ORDER_STATUS_VALUES \}/);
  assert.match(source, /deleted: \{ \$nin: TRUTHY_MOBILE_DELETE_VALUES \}/);
  assert.match(source, /isDeleted: \{ \$nin: TRUTHY_MOBILE_DELETE_VALUES \}/);
  assert.match(source, /deletedAt: \{ \$in: \[null, ''\] \}/);
});

test('mobile sales projection keeps delete flags and applies final visibility guard', () => {
  assert.match(source, /orderStatusUtil = require\('\.\.\/\.\.\/utils\/orderStatus\.util'\)/);
  assert.match(source, /status lifecycleStatus deliveryStatus[\s\S]*deleted isDeleted deletedAt deleteMode deleteReason/);
  assert.match(source, /deleted: Boolean\(order\.deleted\)/);
  assert.match(source, /isDeleted: Boolean\(order\.isDeleted\)/);
  assert.match(source, /deletedAt: order\.deletedAt \|\| ''/);
  assert.match(source, /orderStatusUtil\.isOrderVisibleInHistory\(order\)/);
});

test('mobile delete button is wired to modular DELETE API', () => {
  const frontSource = fs.readFileSync(path.join(ROOT, 'public/mobile/js/sales.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(ROOT, 'public/mobile/js/api.js'), 'utf8');
  const routeSource = fs.readFileSync(path.join(ROOT, 'src/routes/mobile/sales.routes.js'), 'utf8');
  const serviceSource = source;

  assert.match(frontSource, /data-delete-order/);
  assert.match(frontSource, /deleteTodayOrder\(deleteButton\.dataset\.deleteOrder, deleteButton\.dataset\.orderCode\)/);
  assert.match(apiSource, /deleteSalesOrder\(id\) \{/);
  assert.match(apiSource, /method: 'DELETE'/);
  assert.match(routeSource, /router\.delete\('\/orders\/:id'/);
  assert.match(serviceSource, /SalesOrderDeletionService\.deleteSalesOrder/);
});
