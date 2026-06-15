'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const inventoryService = require('../src/services/inventoryService');
const InventoryLegacy = require('../src/models/InventoryLegacy');
const StockTransaction = require('../src/models/StockTransaction');

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

function queryResult(rows) {
  const chain = {
    select() { return chain; },
    lean() { return chain; },
    session() { return chain; },
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }
  };
  return chain;
}

function matchesIn(value, condition) {
  if (!condition || !condition.$in) return String(value || '') === String(condition || '');
  return condition.$in.some((candidate) => String(candidate) === String(value));
}

function createStore() {
  const inventory = new Map([
    ['SP1', {
      _id: 'inv-sp1', id: 'IV_SP1', productId: 'SP1', productCode: 'SP1', productName: 'Sản phẩm 1',
      warehouseId: 'MAIN', warehouseCode: 'MAIN', warehouseName: 'Kho chính',
      qty: 100, quantity: 100, onHand: 100, reservedQty: 0, availableQty: 100
    }]
  ]);
  const transactions = [];
  const stats = { inventoryBulkCalls: 0, transactionInsertCalls: 0 };

  return {
    inventory,
    transactions,
    stats,
    findInventory(filter = {}) {
      if (filter.productCode && filter.warehouseCode) {
        const codes = filter.productCode.$in || [filter.productCode];
        return Array.from(inventory.values()).filter((row) => codes.includes(row.productCode) && row.warehouseCode === filter.warehouseCode);
      }
      const clauses = filter.$or || [];
      return Array.from(inventory.values()).filter((row) => clauses.some((clause) => {
        return Object.entries(clause).some(([field, condition]) => matchesIn(row[field], condition));
      }));
    },
    async bulkInventory(operations = []) {
      stats.inventoryBulkCalls += 1;
      let matchedCount = 0;
      for (const op of operations) {
        if (op.updateOne) {
          const { filter, update, upsert } = op.updateOne;
          let row = filter._id
            ? Array.from(inventory.values()).find((item) => String(item._id) === String(filter._id))
            : inventory.get(filter.productCode);
          if (!row && upsert) {
            row = { _id: `inv-${filter.productCode}`, productCode: filter.productCode, warehouseCode: filter.warehouseCode };
            inventory.set(filter.productCode, row);
          }
          if (!row) continue;
          if (filter.availableQty && Number(row.availableQty || 0) < Number(filter.availableQty.$gte || 0)) continue;
          matchedCount += 1;
          Object.assign(row, update.$set || {});
          for (const [field, delta] of Object.entries(update.$inc || {})) row[field] = Number(row[field] || 0) + Number(delta || 0);
          inventory.set(row.productCode, row);
        }
        if (op.deleteMany) {
          const ids = op.deleteMany.filter?._id?.$in || [];
          for (const [code, row] of inventory.entries()) {
            if (ids.some((id) => String(id) === String(row._id))) inventory.delete(code);
          }
        }
      }
      return { matchedCount };
    }
  };
}

test('bulk sales import posts one transaction per order-product and decrements inventory once per product', async () => {
  const store = createStore();
  const restoreInventoryFind = patch(InventoryLegacy, {
    find: (filter) => queryResult(store.findInventory(filter)),
    bulkWrite: (ops) => store.bulkInventory(ops)
  });
  const restoreTxFind = patch(StockTransaction, {
    find: (filter) => queryResult(store.transactions.filter((row) => (filter.idempotencyKey?.$in || []).includes(row.idempotencyKey))),
    insertMany: async (docs) => {
      store.stats.transactionInsertCalls += 1;
      store.transactions.push(...docs.map((row) => ({ ...row })));
      return docs.map((row) => ({ ...row }));
    }
  });

  try {
    const orders = [
      { id: 'SO1', code: 'SO1', orderDate: '2026-06-15', items: [{ productCode: 'SP1', productName: 'Sản phẩm 1', quantity: 10 }] },
      { id: 'SO2', code: 'SO2', orderDate: '2026-06-15', items: [{ productCode: 'SP1', productName: 'Sản phẩm 1', quantity: 5 }] }
    ];

    const first = await inventoryService.postStockMovementBulkSalesOut(orders, { session: {} });
    assert.equal(first.length, 2);
    assert.equal(store.transactions.length, 2);
    assert.equal(store.transactions[0].balanceQty, 90);
    assert.equal(store.transactions[1].balanceQty, 85);
    assert.equal(store.inventory.get('SP1').availableQty, 85);
    assert.equal(store.inventory.get('SP1').quantity, 85);
    assert.equal(store.stats.transactionInsertCalls, 1);
    assert.equal(store.stats.inventoryBulkCalls, 2); // một lần normalize, một lần trừ tồn aggregate

    const second = await inventoryService.postStockMovementBulkSalesOut(orders, { session: {} });
    assert.equal(second.length, 2);
    assert.equal(second.every((row) => row.skipped === true), true);
    assert.equal(store.transactions.length, 2);
    assert.equal(store.inventory.get('SP1').availableQty, 85);
    assert.equal(store.stats.transactionInsertCalls, 1);
    assert.equal(store.stats.inventoryBulkCalls, 2);
  } finally {
    restoreInventoryFind();
    restoreTxFind();
  }
});

test('bulk sales import rejects aggregate quantity above available stock before any stock transaction is inserted', async () => {
  const store = createStore();
  store.inventory.get('SP1').availableQty = 12;
  store.inventory.get('SP1').quantity = 12;
  store.inventory.get('SP1').qty = 12;
  store.inventory.get('SP1').onHand = 12;

  const restoreInventoryFind = patch(InventoryLegacy, {
    find: (filter) => queryResult(store.findInventory(filter)),
    bulkWrite: (ops) => store.bulkInventory(ops)
  });
  const restoreTxFind = patch(StockTransaction, {
    find: () => queryResult([]),
    insertMany: async (docs) => {
      store.transactions.push(...docs);
      return docs;
    }
  });

  try {
    const orders = [
      { id: 'SO1', code: 'SO1', items: [{ productCode: 'SP1', quantity: 10 }] },
      { id: 'SO2', code: 'SO2', items: [{ productCode: 'SP1', quantity: 5 }] }
    ];
    await assert.rejects(
      () => inventoryService.postStockMovementBulkSalesOut(orders, { session: {} }),
      (error) => error && error.code === 'INSUFFICIENT_STOCK' && error.requiredQty === 15
    );
    assert.equal(store.transactions.length, 0);
    assert.equal(store.inventory.get('SP1').availableQty, 12);
  } finally {
    restoreInventoryFind();
    restoreTxFind();
  }
});
