'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const orderRepository = require('../src/repositories/orderRepository');
const productRepository = require('../src/repositories/productRepository');
const returnOrderService = require('../src/services/returnOrderService');
const InventoryPostingService = require('../src/domain/posting/InventoryPostingService');
const tx = require('../src/utils/transaction.util');

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

function freshOrderService() {
  delete require.cache[require.resolve('../src/services/orderLegacy.service')];
  return require('../src/services/orderLegacy.service');
}

function currentOrder() {
  return {
    id: 'SO1782120525456660',
    code: 'SO1782120525456660',
    orderDate: '2026-06-22',
    date: '2026-06-22',
    deliveryDate: '2026-06-22',
    status: 'pending',
    lifecycleStatus: 'pending',
    mergeStatus: 'unmerged',
    stockPosted: true,
    customerCode: 'C001',
    salesStaffCode: 'NV01',
    salesStaffName: 'NV 01',
    items: [
      { productCode: 'SP1', productName: 'SP 1', quantity: 10, salePrice: 100, price: 100, amount: 1000 },
      { productCode: 'SP2', productName: 'SP 2', quantity: 5, salePrice: 200, price: 200, amount: 1000 }
    ],
    totalAmount: 2000,
    paidAmount: 0,
    debtAmount: 2000
  };
}

test('updateOrder does not touch inventory when posted order items have no stock quantity delta', async () => {
  const calls = { upserts: 0, deltas: [] };
  const restoreRepo = patch(orderRepository, {
    findByIdOrCode: async () => currentOrder(),
    upsert: async (order) => { calls.upserts += 1; return order; }
  });
  const restoreProducts = patch(productRepository, {
    findByCodes: async () => [
      { id: 'SP1', code: 'SP1', name: 'SP 1', salePrice: 100, conversionRate: 1 },
      { id: 'SP2', code: 'SP2', name: 'SP 2', salePrice: 200, conversionRate: 1 }
    ]
  });
  const restoreReturn = patch(returnOrderService, { syncReturnDraftWithSalesOrder: async () => ({ skipped: 'not_found' }) });
  const restoreInventory = patch(InventoryPostingService, {
    postSaleEditDelta: async (_order, items, direction) => { calls.deltas.push({ items, direction }); return []; },
    postSaleOut: async () => { throw new Error('postSaleOut should not run for no-delta edit'); }
  });
  const restoreTx = patch(tx, { withMongoTransaction: async (fn) => fn({}) });

  try {
    const service = freshOrderService();
    const result = await service.updateOrder('SO1782120525456660', {
      items: [
        { productCode: 'SP1', quantity: 10, salePrice: 100, price: 100, amount: 1000 },
        { productCode: 'SP2', quantity: 5, salePrice: 200, price: 200, amount: 1000 }
      ],
      paidAmount: 500,
      saleMode: 'DIRECT_PRICE'
    });
    assert.equal(result.salesOrder.id, 'SO1782120525456660');
    assert.equal(calls.upserts, 1);
    assert.deepEqual(calls.deltas, []);
  } finally {
    restoreRepo();
    restoreProducts();
    restoreReturn();
    restoreInventory();
    restoreTx();
  }
});

test('updateOrder posts only net inventory edit delta for changed quantities', async () => {
  const calls = { deltas: [] };
  const restoreRepo = patch(orderRepository, {
    findByIdOrCode: async () => currentOrder(),
    upsert: async (order) => order
  });
  const restoreProducts = patch(productRepository, {
    findByCodes: async () => [
      { id: 'SP1', code: 'SP1', name: 'SP 1', salePrice: 100, conversionRate: 1 },
      { id: 'SP2', code: 'SP2', name: 'SP 2', salePrice: 200, conversionRate: 1 }
    ]
  });
  const restoreReturn = patch(returnOrderService, { syncReturnDraftWithSalesOrder: async () => ({ skipped: 'not_found' }) });
  const restoreInventory = patch(InventoryPostingService, {
    postSaleEditDelta: async (_order, items, direction) => { calls.deltas.push({ items, direction }); return []; },
    postSaleOut: async () => { throw new Error('postSaleOut should not run for posted edit delta'); }
  });
  const restoreTx = patch(tx, { withMongoTransaction: async (fn) => fn({}) });

  try {
    const service = freshOrderService();
    await service.updateOrder('SO1782120525456660', {
      items: [
        { productCode: 'SP1', quantity: 7, salePrice: 100, price: 100, amount: 700 },
        { productCode: 'SP2', quantity: 8, salePrice: 200, price: 200, amount: 1600 }
      ],
      saleMode: 'DIRECT_PRICE'
    });
    assert.equal(calls.deltas.length, 2);
    assert.equal(calls.deltas[0].direction, 'IN');
    assert.equal(calls.deltas[0].items[0].productCode, 'SP1');
    assert.equal(calls.deltas[0].items[0].quantity, 3);
    assert.equal(calls.deltas[1].direction, 'OUT');
    assert.equal(calls.deltas[1].items[0].productCode, 'SP2');
    assert.equal(calls.deltas[1].items[0].quantity, 3);
  } finally {
    restoreRepo();
    restoreProducts();
    restoreReturn();
    restoreInventory();
    restoreTx();
  }
});
