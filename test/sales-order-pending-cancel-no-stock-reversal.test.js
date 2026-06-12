'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const orderRepository = require('../src/repositories/orderRepository');
const returnOrderRepository = require('../src/repositories/returnOrderRepository');
const inventoryService = require('../src/services/inventoryService');
const postingEngine = require('../src/engines/posting.engine');
const orderService = require('../src/services/orderService');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

function fakeSession() {
  return {
    async withTransaction(work) { return work(); },
    async endSession() {}
  };
}

function baseOrder(overrides = {}) {
  return {
    id: 'SO-PENDING-1',
    code: 'SO-PENDING-1',
    customerCode: 'C001',
    items: [{ productCode: 'P001', quantity: 2, price: 10000, amount: 20000 }],
    totalAmount: 20000,
    paidAmount: 0,
    debtAmount: 20000,
    status: 'pending',
    deliveryStatus: 'pending',
    accountingStatus: 'pending',
    stockPosted: false,
    arPosted: false,
    accountingConfirmed: false,
    ...overrides
  };
}

async function withPatchedCancel(order, assertions) {
  let savedOrder = { ...order };
  let reverseStockCalls = 0;
  let reverseArCalls = 0;

  const restoreMongoose = patch(mongoose, { startSession: async () => fakeSession() });
  const restoreOrderRepo = patch(orderRepository, {
    findByIdOrCode: async () => savedOrder,
    patchByIdentity: async (idOrCode, patchDoc, options = {}) => {
      assert.ok(options.session, 'cancel patch must receive transaction session');
      savedOrder = { ...savedOrder, ...patchDoc };
      return savedOrder;
    }
  });
  const restoreReturnOrderRepo = patch(returnOrderRepository, {
    findAll: async () => [],
    findByIdOrCode: async () => null,
    upsert: async (row) => row
  });
  const restoreInventoryService = patch(inventoryService, {
    reverseStockMovement: async () => { reverseStockCalls += 1; return []; }
  });
  const restorePostingEngine = patch(postingEngine, {
    reverseSalesOrderAR: async () => { reverseArCalls += 1; return null; },
    postSalesOrderAR: async () => null
  });

  try {
    const result = await orderService.cancelOrder(order.code, { reason: 'test cancel' });
    await assertions({ result, savedOrder, reverseStockCalls, reverseArCalls });
  } finally {
    restorePostingEngine();
    restoreInventoryService();
    restoreReturnOrderRepo();
    restoreOrderRepo();
    restoreMongoose();
  }
}

test('cancel pending sales order does not reverse stock or AR that were never posted', async () => {
  await withPatchedCancel(baseOrder(), async ({ result, reverseStockCalls, reverseArCalls }) => {
    assert.equal(result.salesOrder.status, 'cancelled');
    assert.equal(reverseStockCalls, 0, 'pending order must not reverse stock');
    assert.equal(reverseArCalls, 0, 'pending order must not reverse AR');
  });
});

test('cancel stock-posted sales order reverses stock only when AR was not posted', async () => {
  await withPatchedCancel(baseOrder({ stockPosted: true }), async ({ result, reverseStockCalls, reverseArCalls }) => {
    assert.equal(result.salesOrder.status, 'cancelled');
    assert.equal(reverseStockCalls, 1, 'stock-posted order must reverse stock');
    assert.equal(reverseArCalls, 0, 'stock-posted-only order must not reverse AR before accounting confirmation');
  });
});


test('cancel AR-posted sales order reverses both stock and AR', async () => {
  await withPatchedCancel(baseOrder({ stockPosted: true, accountingConfirmed: true, accountingStatus: 'confirmed' }), async ({ result, reverseStockCalls, reverseArCalls }) => {
    assert.equal(result.salesOrder.status, 'cancelled');
    assert.equal(reverseStockCalls, 1, 'AR-posted order must reverse stock');
    assert.equal(reverseArCalls, 1, 'AR-posted order must reverse AR through posting engine');
  });
});
