'use strict';

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const test = require('node:test');

const masterOrderService = require('../src/services/masterOrderService');
const masterOrderRepository = require('../src/repositories/masterOrderRepository');
const orderRepository = require('../src/repositories/orderRepository');
const userRepository = require('../src/repositories/userRepository');
const returnOrderService = require('../src/services/returnOrderService');
const MongoStore = require('../src/models');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => Object.assign(target, originals);
}

function matchesFilter(row, filter = {}) {
  const conditions = Array.isArray(filter.$or) ? filter.$or : [];
  return conditions.some((condition) => Object.entries(condition).some(([key, value]) => value && row[key] === value));
}

function applyMongoUpdate(row, update = {}) {
  Object.assign(row, update.$set || {});
  Object.keys(update.$unset || {}).forEach((key) => delete row[key]);
}

test('updateMasterOrder removes child assignment from SalesOrder and return draft in one transaction', async () => {
  const orders = [
    {
      id: 'SO100', code: 'B001', mergeStatus: 'merged', status: 'assigned', lifecycleStatus: 'assigned', deliveryStatus: 'pending',
      masterOrderId: 'MO100', masterOrderCode: 'DT100', deliveryStaffId: 'U-GH01', deliveryStaffCode: 'GH01', deliveryStaffName: 'NV giao',
      deliveryDate: '2026-06-13', routeName: 'TP', deliveryRoute: 'TP', totalAmount: 100000, items: []
    },
    {
      id: 'SO101', code: 'B002', mergeStatus: 'merged', status: 'assigned', lifecycleStatus: 'assigned', deliveryStatus: 'pending',
      masterOrderId: 'MO100', masterOrderCode: 'DT100', deliveryStaffId: 'U-GH01', deliveryStaffCode: 'GH01', deliveryStaffName: 'NV giao',
      deliveryDate: '2026-06-13', routeName: 'TP', deliveryRoute: 'TP', totalAmount: 200000, items: []
    }
  ];
  let master = {
    id: 'MO100', code: 'DT100', status: 'assigned', childOrderIds: ['SO100', 'SO101'],
    children: [{ id: 'SO100' }], orderIds: ['SO100', 'SO101'], salesOrderIds: ['SO100', 'SO101'],
    orderCodes: ['B001', 'B002'], salesOrderCodes: ['B001', 'B002'],
    deliveryStaffId: 'U-GH01', deliveryStaffCode: 'GH01', deliveryStaffName: 'NV giao', deliveryDate: '2026-06-13', routeName: 'TP'
  };
  const detachCalls = [];
  let salesBulkWriteCount = 0;
  const restores = [];

  restores.push(patch(mongoose, {
    startSession: async () => ({
      async withTransaction(fn) { return fn(); },
      async endSession() {}
    })
  }));
  restores.push(patch(masterOrderRepository, {
    findByIdOrCode: async () => ({ ...master }),
    upsert: async (row) => { master = { ...row }; return row; }
  }));
  restores.push(patch(orderRepository, {
    findManyByIdentity: async (keys = []) => orders.filter((row) => keys.some((key) => [row.id, row.code].includes(key)))
  }));
  restores.push(patch(userRepository, {
    findBusinessStaffByCode: async () => ({ id: 'U-GH01', code: 'GH01', name: 'NV giao' })
  }));
  restores.push(patch(returnOrderService, {
    detachMasterOrderFromReturnDrafts: async (children, options) => {
      detachCalls.push({ children, options });
      return [];
    }
  }));
  restores.push(patch(MongoStore.salesOrders, {
    bulkWrite: async (operations = []) => {
      salesBulkWriteCount += 1;
      for (const operation of operations) {
        const row = orders.find((item) => matchesFilter(item, operation.updateOne.filter));
        if (row) applyMongoUpdate(row, operation.updateOne.update);
      }
      return { modifiedCount: operations.length };
    }
  }));
  restores.push(patch(MongoStore.returnOrders, {
    updateMany: async () => ({ modifiedCount: 0 })
  }));

  try {
    const result = await masterOrderService.updateMasterOrder('MO100', {
      childOrderIds: ['SO101'],
      expectedChildOrderIds: ['SO100', 'SO101'],
      removedChildOrderIds: ['SO100'],
      deliveryStaffCode: 'GH01',
      deliveryDate: '2026-06-13',
      routeName: 'TP'
    });

    assert.equal(result.error, undefined);
    assert.deepEqual(master.childOrderIds, ['SO101']);
    for (const field of ['children', 'childOrders', 'orderIds', 'salesOrderIds', 'salesOrders', 'orderCodes', 'salesOrderCodes']) {
      assert.deepEqual(master[field], [], `${field} must not retain removed child references`);
    }

    const removed = orders.find((row) => row.id === 'SO100');
    assert.equal(removed.mergeStatus, 'unmerged');
    assert.equal(removed.status, 'pending');
    assert.equal(removed.lifecycleStatus, 'pending');
    assert.equal(removed.deliveryStatus, 'pending');
    assert.equal(removed.masterOrderId, undefined);
    assert.equal(removed.masterOrderCode, undefined);
    assert.equal(removed.deliveryStaffCode, undefined);
    assert.equal(removed.deliveryStaffName, undefined);
    assert.equal(removed.deliveryDate, undefined);
    assert.equal(removed.routeName, undefined);
    assert.equal(removed.deliveryRoute, undefined);

    const kept = orders.find((row) => row.id === 'SO101');
    assert.equal(kept.masterOrderId, 'MO100');
    assert.equal(kept.deliveryStaffCode, 'GH01');

    assert.equal(detachCalls.length, 1);
    assert.deepEqual(detachCalls[0].children.map((row) => row.id), ['SO100']);
    assert.equal(detachCalls[0].options.expectedMasterOrderId, 'MO100');
    assert.equal(detachCalls[0].options.expectedMasterOrderCode, 'DT100');
    assert.equal(salesBulkWriteCount, 2, 'one bulk for retained children and one bulk for removed children');
  } finally {
    while (restores.length) restores.pop()();
  }
});

test('updateMasterOrder refuses to detach a child after delivery money has been touched', async () => {
  const child = {
    id: 'SO200', code: 'B200', mergeStatus: 'merged', status: 'assigned', deliveryStatus: 'pending',
    masterOrderId: 'MO200', masterOrderCode: 'DT200', deliveryStaffCode: 'GH01', deliveryDate: '2026-06-13',
    cashCollected: 1000, items: []
  };
  const keep = {
    id: 'SO201', code: 'B201', mergeStatus: 'merged', status: 'assigned', deliveryStatus: 'pending',
    masterOrderId: 'MO200', masterOrderCode: 'DT200', deliveryStaffCode: 'GH01', deliveryDate: '2026-06-13', items: []
  };
  const restores = [];
  let writes = 0;

  restores.push(patch(masterOrderRepository, {
    findByIdOrCode: async () => ({ id: 'MO200', code: 'DT200', status: 'assigned', childOrderIds: ['SO200', 'SO201'], deliveryStaffCode: 'GH01', deliveryDate: '2026-06-13' }),
    upsert: async () => { writes += 1; }
  }));
  restores.push(patch(orderRepository, {
    findManyByIdentity: async (keys = []) => [child, keep].filter((row) => keys.includes(row.id) || keys.includes(row.code))
  }));
  restores.push(patch(userRepository, {
    findBusinessStaffByCode: async () => ({ id: 'U-GH01', code: 'GH01', name: 'NV giao' })
  }));
  restores.push(patch(MongoStore.salesOrders, {
    bulkWrite: async () => { writes += 1; }
  }));

  try {
    const result = await masterOrderService.updateMasterOrder('MO200', {
      childOrderIds: ['SO201'],
      expectedChildOrderIds: ['SO200', 'SO201'],
      removedChildOrderIds: ['SO200'],
      deliveryStaffCode: 'GH01',
      deliveryDate: '2026-06-13'
    });

    assert.equal(result.status, 409);
    assert.match(result.error, /đã phát sinh giao hàng\/thu tiền\/trả hàng hoặc xác nhận kế toán/);
    assert.equal(writes, 0);
  } finally {
    while (restores.length) restores.pop()();
  }
});
