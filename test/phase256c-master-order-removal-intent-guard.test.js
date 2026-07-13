'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const masterOrderService = require('../src/services/masterOrderService');
const masterOrderRepository = require('../src/repositories/masterOrderRepository');
const orderRepository = require('../src/repositories/orderRepository');
const userRepository = require('../src/repositories/userRepository');
const MongoStore = require('../src/models');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => Object.assign(target, originals);
}

function makeChild(id, code = id) {
  return {
    id,
    code,
    mergeStatus: 'merged',
    status: 'assigned',
    lifecycleStatus: 'assigned',
    deliveryStatus: 'pending',
    masterOrderId: 'MO256C',
    masterOrderCode: 'DT256C',
    deliveryStaffCode: 'GH01',
    deliveryDate: '2026-07-13',
    items: []
  };
}

function installReadOnlyMasterOrderFixture(children, writes) {
  const restores = [];
  const master = {
    id: 'MO256C',
    code: 'DT256C',
    status: 'assigned',
    childOrderIds: children.map((row) => row.id),
    orderIds: children.map((row) => row.id),
    salesOrderIds: children.map((row) => row.id),
    orderCodes: children.map((row) => row.code),
    salesOrderCodes: children.map((row) => row.code),
    deliveryStaffCode: 'GH01',
    deliveryDate: '2026-07-13'
  };

  restores.push(patch(masterOrderRepository, {
    findByIdOrCode: async () => ({ ...master }),
    upsert: async () => {
      writes.count += 1;
      return master;
    }
  }));
  restores.push(patch(orderRepository, {
    findManyByIdentity: async (keys = []) => children.filter((row) => keys.includes(row.id) || keys.includes(row.code))
  }));
  restores.push(patch(userRepository, {
    findBusinessStaffByCode: async () => ({ id: 'U-GH01', code: 'GH01', name: 'NV giao' })
  }));
  restores.push(patch(MongoStore.salesOrders, {
    bulkWrite: async () => {
      writes.count += 1;
      return { modifiedCount: 0 };
    }
  }));
  restores.push(patch(MongoStore.returnOrders, {
    updateMany: async () => {
      writes.count += 1;
      return { modifiedCount: 0 };
    }
  }));
  return () => {
    while (restores.length) restores.pop()();
  };
}

test('updateMasterOrder rejects destructive shrink when removedChildOrderIds is missing', async () => {
  const children = [makeChild('SO1', 'B0039412'), makeChild('SO2', 'B0039414'), makeChild('SO3', 'B0039413'), makeChild('SO4', 'B0039415'), makeChild('SO5', 'B0099999')];
  const writes = { count: 0 };
  const restore = installReadOnlyMasterOrderFixture(children, writes);

  try {
    const result = await masterOrderService.updateMasterOrder('MO256C', {
      childOrderIds: ['SO5'],
      expectedChildOrderIds: ['SO1', 'SO2', 'SO3', 'SO4', 'SO5'],
      deliveryStaffCode: 'GH01',
      deliveryDate: '2026-07-13'
    });

    assert.equal(result.status, 409);
    assert.equal(result.code, 'MASTER_ORDER_CHILD_REMOVAL_INTENT_MISMATCH');
    assert.deepEqual(result.unexpectedRemovedChildOrderIds, ['B0039412', 'B0039414', 'B0039413', 'B0039415']);
    assert.equal(writes.count, 0);
  } finally {
    restore();
  }
});

test('updateMasterOrder rejects stale expectedChildOrderIds before any writer runs', async () => {
  const children = [makeChild('SO1', 'B0039412'), makeChild('SO2', 'B0039414'), makeChild('SO3', 'B0039413'), makeChild('SO4', 'B0039415')];
  const writes = { count: 0 };
  const restore = installReadOnlyMasterOrderFixture(children, writes);

  try {
    const result = await masterOrderService.updateMasterOrder('MO256C', {
      childOrderIds: ['SO1', 'SO2', 'SO3'],
      expectedChildOrderIds: ['SO1', 'SO2', 'SO3'],
      removedChildOrderIds: [],
      deliveryStaffCode: 'GH01',
      deliveryDate: '2026-07-13'
    });

    assert.equal(result.status, 409);
    assert.equal(result.code, 'MASTER_ORDER_EDIT_STALE_CHILD_SET');
    assert.deepEqual(result.missingCurrentChildOrderIds, ['B0039415']);
    assert.equal(writes.count, 0);
  } finally {
    restore();
  }
});
