'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const source = require('./helpers/sourceBundle.util').readSource('src/services/mobile/sales.service.js');

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
  ['status', 'lifecycleStatus', 'deliveryStatus', 'deleted', 'isDeleted', 'deletedAt', 'deleteMode', 'deleteReason'].forEach((field) => {
    assert.match(source, new RegExp(`${field}: 1`));
  });
  assert.match(source, /deleted: Boolean\(order\.deleted\)/);
  assert.match(source, /isDeleted: Boolean\(order\.isDeleted\)/);
  assert.match(source, /deletedAt: order\.deletedAt \|\| ''/);
  assert.match(source, /orderStatusUtil\.isOrderVisibleInHistory\(order\)/);
});

test('mobile delete button is wired to modular DELETE API', () => {
  const frontSource = require('./helpers/sourceBundle.util').readSource('public/mobile/js/sales.js');
  const apiSource = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'public/mobile/js/api.js'));
  const routeSource = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'src/routes/mobile/sales.routes.js'));
  const serviceSource = source;

  assert.match(frontSource, /data-delete-order/);
  assert.match(frontSource, /deleteTodayOrder\(deleteButton\.dataset\.deleteOrder, deleteButton\.dataset\.orderCode\)/);
  assert.match(apiSource, /deleteSalesOrder\(id\) \{/);
  assert.match(apiSource, /method: 'DELETE'/);
  assert.match(routeSource, /router\.delete\('\/orders\/:id'/);
  assert.match(serviceSource, /SalesOrderDeletionService\.deleteSalesOrder/);
});
