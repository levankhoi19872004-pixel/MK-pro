'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MasterOrder = require('../src/models/MasterOrder');
const reader = require('../src/services/delivery/deliveryTodayCanonicalOrderReader');
const CloseoutContextLoader = require('../src/services/accounting/closeout/CloseoutContextLoader');

const BUSINESS_MASTER_ID = 'MO1783758703356530';
const BUSINESS_MASTER_CODE = 'DT1783758703356530';
const VALID_OBJECT_ID = '6a50420e4f5d7fbf8b8142d2';

function chain(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  };
}

function findClause(filter, field) {
  return (filter.$or || []).find((clause) => Object.prototype.hasOwnProperty.call(clause, field));
}

function oldUnsafeFilter(keys = []) {
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { masterOrderCode: { $in: keys } },
      { _id: { $in: keys } }
    ]
  };
}

function castMasterFilter(filter) {
  const query = MasterOrder.find(filter);
  query.cast(MasterOrder);
}

function modelSet(orders, masters, counters = {}) {
  counters.orders = 0;
  counters.masters = 0;
  return {
    SalesOrder: {
      find() {
        counters.orders += 1;
        return chain(orders);
      }
    },
    MasterOrder: {
      find(filter) {
        counters.masters += 1;
        castMasterFilter(filter);
        return chain(masters);
      }
    }
  };
}

test('Phase256B-R1 business master IDs are not placed in _id lookup', () => {
  const { filter, directMasterKeys, directMasterObjectIds } = reader.buildMasterMetadataLookupFilter([
    { id: 'SO-1', code: 'B001', masterOrderId: BUSINESS_MASTER_ID, masterOrderCode: BUSINESS_MASTER_CODE }
  ]);

  assert.deepEqual(directMasterKeys, [BUSINESS_MASTER_ID, BUSINESS_MASTER_CODE]);
  assert.deepEqual(directMasterObjectIds, []);
  assert.deepEqual(findClause(filter, 'id').id.$in, [BUSINESS_MASTER_ID, BUSINESS_MASTER_CODE]);
  assert.deepEqual(findClause(filter, 'code').code.$in, [BUSINESS_MASTER_ID, BUSINESS_MASTER_CODE]);
  assert.deepEqual(findClause(filter, 'masterOrderCode').masterOrderCode.$in, [BUSINESS_MASTER_ID, BUSINESS_MASTER_CODE]);
  assert.equal(Boolean(findClause(filter, '_id')), false);
  assert.doesNotThrow(() => castMasterFilter(filter));
});

test('Phase256B-R1 valid Mongo ObjectId master key is allowed in _id lookup', () => {
  const { filter, directMasterKeys, directMasterObjectIds } = reader.buildMasterMetadataLookupFilter([
    { id: 'SO-1', code: 'B001', masterOrderId: VALID_OBJECT_ID }
  ]);

  assert.deepEqual(directMasterKeys, [VALID_OBJECT_ID]);
  assert.deepEqual(directMasterObjectIds, [VALID_OBJECT_ID]);
  assert.deepEqual(findClause(filter, '_id')._id.$in, [VALID_OBJECT_ID]);
  assert.doesNotThrow(() => castMasterFilter(filter));
});

test('Phase256B-R1 mixed business and ObjectId keys only put ObjectId keys in _id', () => {
  const { filter, directMasterKeys, directMasterObjectIds } = reader.buildMasterMetadataLookupFilter([
    { id: 'SO-1', code: 'B001', masterOrderId: BUSINESS_MASTER_ID },
    { id: 'SO-2', code: 'B002', masterOrderId: VALID_OBJECT_ID }
  ]);

  assert.deepEqual(directMasterKeys, [BUSINESS_MASTER_ID, VALID_OBJECT_ID]);
  assert.deepEqual(directMasterObjectIds, [VALID_OBJECT_ID]);
  assert.deepEqual(findClause(filter, 'id').id.$in, [BUSINESS_MASTER_ID, VALID_OBJECT_ID]);
  assert.deepEqual(findClause(filter, 'code').code.$in, [BUSINESS_MASTER_ID, VALID_OBJECT_ID]);
  assert.deepEqual(findClause(filter, 'masterOrderCode').masterOrderCode.$in, [BUSINESS_MASTER_ID, VALID_OBJECT_ID]);
  assert.deepEqual(findClause(filter, '_id')._id.$in, [VALID_OBJECT_ID]);
  assert.doesNotThrow(() => castMasterFilter(filter));
});

test('Phase256B-R1 reproduces old _id business key CastError and proves new filter casts', () => {
  assert.throws(
    () => castMasterFilter(oldUnsafeFilter([BUSINESS_MASTER_ID])),
    (err) => err.name === 'CastError' && err.path === '_id' && String(err.message).includes(BUSINESS_MASTER_ID)
  );

  const { filter } = reader.buildMasterMetadataLookupFilter([
    { id: 'SO-1', code: 'B001', masterOrderId: BUSINESS_MASTER_ID }
  ]);
  assert.doesNotThrow(() => castMasterFilter(filter));
});

test('Phase256B-R1 reader integration supports business master identity without CastError', async () => {
  const counters = {};
  const result = await reader.listSalesOrders({
    date: '2026-07-13',
    delivery: 'ghth',
    deliveryStaffCode: 'ghth',
    deliveryDateChangedByUser: '1'
  }, modelSet([
    {
      id: 'SO-MERGED',
      code: 'B-MERGED',
      masterOrderId: BUSINESS_MASTER_ID,
      masterOrderCode: BUSINESS_MASTER_CODE,
      deliveryDate: '2026-07-13',
      deliveryStaffCode: ''
    }
  ], [
    {
      id: BUSINESS_MASTER_ID,
      code: BUSINESS_MASTER_CODE,
      childOrderIds: ['SO-MERGED'],
      deliveryStaffCode: 'ghth',
      status: 'assigned'
    }
  ], counters));

  assert.deepEqual(result.orders.map((row) => row.orderCode), ['B-MERGED']);
  assert.equal(result.orders[0].deliveryStaffCode, 'ghth');
  assert.equal(result.orders[0].deliveryAssignmentVerified, true);
  assert.equal(result.orders[0].masterMetadataBindingSource, 'direct-order-link');
  assert.equal(result.diagnostics.queryCount, 2);
  assert.equal(counters.orders, 1);
  assert.equal(counters.masters, 1);
});

test('Phase256B-R1 keeps B0039130 isolation regression protected', async () => {
  const result = await reader.listSalesOrders({
    date: '2026-07-08',
    delivery: 'ghtp',
    deliveryStaffCode: 'ghtp',
    deliveryDateChangedByUser: '1'
  }, modelSet([
    {
      id: 'SO-MERGED',
      code: 'B-MERGED',
      deliveryDate: '2026-07-08',
      masterOrderId: 'MO1',
      masterOrderCode: 'DT1',
      deliveryStaffCode: 'ghtp'
    },
    {
      id: 'SO1783644686092554',
      code: 'B0039130',
      deliveryDate: '2026-07-08',
      mergeStatus: 'unmerged',
      masterOrderId: '',
      masterOrderCode: '',
      deliveryStaffCode: ''
    }
  ], [
    { id: 'MO1', code: 'DT1', childOrderIds: ['SO-MERGED'], deliveryStaffCode: 'ghtp', status: 'assigned' }
  ]));

  assert.deepEqual(result.orders.map((row) => row.orderCode), ['B-MERGED']);
  assert.equal(result.orders.some((row) => row.orderCode === 'B0039130'), false);
  assert.equal(result.diagnostics.masterMetadataUnboundCount, 1);
});

test('Phase256B-R1 closeout scope guard verifies business master identity without CastError', async () => {
  const result = await CloseoutContextLoader.assertCloseoutDeliveryScope(
    { deliveryStaffCode: 'ghth' },
    [{ id: 'SO-MERGED', code: 'B-MERGED', masterOrderId: BUSINESS_MASTER_ID, deliveryStaffCode: '' }],
    {
      models: {
        MasterOrder: {
          find(filter) {
            castMasterFilter(filter);
            return chain([{ id: BUSINESS_MASTER_ID, childOrderIds: ['SO-MERGED'], deliveryStaffCode: 'ghth', status: 'assigned' }]);
          }
        }
      }
    }
  );

  assert.equal(result.checked, true);
  assert.equal(result.checkedOrders[0].bindingSource, 'masterOrder.direct-order-link');
  assert.equal(result.checkedOrders[0].actualDeliveryStaffCode, 'ghth');
});

