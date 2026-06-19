'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('mobile sales service must delegate sales order deletion to SalesOrderDeletionService', () => {
  const file = path.join(ROOT, 'src/services/mobile/sales.service.js');
  const source = require('./helpers/sourceBundle.util').readSource(file);

  assert.match(source, /SalesOrderDeletionService\.deleteSalesOrder/);
  assert.doesNotMatch(source, /SalesOrder\.deleteOne\(/);
  assert.doesNotMatch(source, /SalesOrder\.findOneAndUpdate\([^)]*status:\s*['"]void['"]/s);
});

test('normal sales order deletion flow must not use tombstone or soft-void copy', () => {
  const files = [
    'src/domain/lifecycle/salesOrderDeletion.policy.js',
    'src/domain/lifecycle/SalesOrderDeletionService.js',
    'src/controllers/orderController.js',
    'src/services/mobile/sales.service.js'
  ];

  for (const rel of files) {
    const source = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, rel));
    assert.doesNotMatch(source, /tombstone/i, `${rel} must not reference tombstone`);
    assert.doesNotMatch(source, /SOFT_VOID_WITH_REVERSAL/, `${rel} must not soft-void normal delete`);
    assert.doesNotMatch(source, /HARD_DELETE_WITH_TOMBSTONE/, `${rel} must not hard-delete with tombstone`);
  }
});
