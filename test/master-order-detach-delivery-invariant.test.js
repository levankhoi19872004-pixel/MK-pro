'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildDetachedSalesOrderMongoUpdate,
  hasDeliveryOperationalData,
  canonicalMasterChildReferencePatch
} = require('../src/utils/masterOrderAssignment.util');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('detaching a child order clears the complete master/delivery assignment chain', () => {
  const update = buildDetachedSalesOrderMongoUpdate('2026-06-13T00:00:00.000Z');

  assert.deepEqual(update.$set, {
    mergeStatus: 'unmerged',
    status: 'pending',
    lifecycleStatus: 'pending',
    deliveryStatus: 'pending',
    arStatus: 'pending',
    accountingStatus: 'pending',
    accountingConfirmed: false,
    updatedAt: '2026-06-13T00:00:00.000Z'
  });

  for (const field of [
    'masterOrderId',
    'masterOrderCode',
    'masterOrderNo',
    'deliveryMasterId',
    'deliveryMasterCode',
    'deliveryStaffId',
    'deliveryStaffCode',
    'deliveryStaffName',
    'deliveryCode',
    'deliveryName',
    'shipperCode',
    'shipperName',
    'nvghCode',
    'nvghName',
    'driverCode',
    'driverName',
    'deliveryDate',
    'routeName',
    'deliveryRoute'
  ]) {
    assert.equal(Object.hasOwn(update.$unset, field), true, `${field} must be unset`);
  }
});

test('master order keeps childOrderIds as the only child-reference source', () => {
  const patch = canonicalMasterChildReferencePatch([
    { id: 'SO100', code: 'B001' },
    { id: 'SO101', code: 'B002' }
  ]);

  assert.deepEqual(patch.childOrderIds, ['SO100', 'SO101']);
  for (const field of ['children', 'childOrders', 'orderIds', 'salesOrderIds', 'salesOrders', 'orderCodes', 'salesOrderCodes']) {
    assert.deepEqual(patch[field], [], `${field} must be cleared`);
  }
});

test('orders with delivery/accounting activity cannot be detached silently', () => {
  assert.equal(hasDeliveryOperationalData({ deliveryStatus: 'delivered' }), true);
  assert.equal(hasDeliveryOperationalData({ accountingConfirmed: true }), true);
  assert.equal(hasDeliveryOperationalData({ cashCollected: 1000 }), true);
  assert.equal(hasDeliveryOperationalData({ returnItems: [{ returnQty: 1 }] }), true);
  assert.equal(hasDeliveryOperationalData({ deliveryStatus: 'pending', cashCollected: 0 }), false);
});

test('update/cancel/delete master-order flows use the same detach invariant and return draft sync', () => {
  const masterSource = read('src/services/master-order/masterOrderLegacy.service.js');
  const returnSource = read('src/services/returnOrderLegacy.service.js');
  const deliveryEngineSource = read('src/engines/delivery.legacy.engine.js');
  const repairSource = read('scripts/repair-detached-delivery-assignments.js');

  assert.match(masterSource, /update:\s*buildDetachedSalesOrderMongoUpdate\(now\)/);
  assert.match(masterSource, /expectedMasterOrderId:\s*current\.id/);
  assert.match(masterSource, /expectedMasterOrderCode:\s*current\.code/);
  assert.match(masterSource, /đã phát sinh giao hàng\/thu tiền\/trả hàng hoặc xác nhận kế toán/);

  assert.match(returnSource, /expectedMasterOrderId/);
  assert.match(returnSource, /deliveryStaffCode:\s*''/);
  assert.match(returnSource, /deliveryDate:\s*''/);
  assert.match(returnSource, /staffCode:\s*''/);

  assert.match(deliveryEngineSource, /DELIVERY_MASTER_LINK_GUARD_START/);
  assert.match(deliveryEngineSource, /masterAssignmentMongoClause\(\)/);
  assert.match(deliveryEngineSource, /masterOrderId:\s*\{\s*\$exists:\s*true,\s*\$nin:\s*\[null, ''\]/);

  assert.match(repairSource, /const write = process\.argv\.includes\('--write'\)/);
  assert.match(repairSource, /still_member_of_active_master_order/);
  assert.match(repairSource, /delivery_or_accounting_activity_exists/);
});
