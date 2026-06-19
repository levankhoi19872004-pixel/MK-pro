'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const inventoryService = require('../src/services/inventoryService');
const InventoryLegacy = require('../src/models/InventoryLegacy');
const Product = require('../src/models/Product');
const StockTransaction = require('../src/models/StockTransaction');
const inventoryStockService = require('../src/services/inventoryStock.service');

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

function createSnapshot(row) {
  return {
    id: row.id || `IV_${row.productCode}`,
    productId: row.productId || row.productCode,
    productCode: row.productCode,
    productName: row.productName || '',
    warehouseId: row.warehouseId || 'MAIN',
    warehouseCode: row.warehouseCode || 'MAIN',
    warehouseName: row.warehouseName || 'Kho chính',
    qty: Number(row.qty ?? row.quantity ?? row.onHand ?? row.availableQty ?? 0),
    quantity: Number(row.quantity ?? row.qty ?? row.onHand ?? row.availableQty ?? 0),
    onHand: Number(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty ?? 0),
    reservedQty: Number(row.reservedQty || 0),
    availableQty: Number(row.availableQty ?? row.quantity ?? row.qty ?? row.onHand ?? 0),
    save: async function save() { return this; }
  };
}

function createInMemoryInventoryStore(initialSnapshots = []) {
  const snapshots = new Map(initialSnapshots.map((row) => [row.productCode, createSnapshot(row)]));
  const transactions = [];

  return {
    snapshots,
    transactions,
    findSnapshot: async (filter = {}) => snapshots.get(filter.productCode) || null,
    findInventory: (filter = {}) => {
      const clauses = Array.isArray(filter.$or) ? filter.$or : [filter];
      const rows = Array.from(snapshots.values()).filter((row) => clauses.some((clause = {}) => {
        return Object.entries(clause).some(([field, value]) => {
          if (value === undefined || value === null || value === '') return false;
          return String(row[field] || '').toUpperCase() === String(value || '').toUpperCase();
        });
      }));
      const chain = {
        session: () => chain,
        lean: async () => rows.map((row) => ({ ...row }))
      };
      return chain;
    },
    deleteInventory: async (filter = {}) => {
      const clauses = Array.isArray(filter.$or) ? filter.$or : [filter];
      const keys = Array.from(snapshots.entries())
        .filter(([, row]) => clauses.some((clause = {}) => Object.entries(clause).some(([field, value]) => {
          if (value === undefined || value === null || value === '') return false;
          return String(row[field] || '').toUpperCase() === String(value || '').toUpperCase();
        })))
        .map(([key]) => key);
      for (const key of keys) snapshots.delete(key);
      return { deletedCount: keys.length };
    },
    createInventory: async (docs) => {
      return docs.map((doc) => {
        const code = String(doc.productCode || doc.productId || '').toUpperCase();
        const row = createSnapshot({ ...doc, productCode: code });
        snapshots.set(code, row);
        return row;
      });
    },
    findTx: async (filter = {}) => {
      if (filter.idempotencyKey) return transactions.find((row) => row.idempotencyKey === filter.idempotencyKey) || null;
      return transactions.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) || null;
    },
    createTx: async (docs) => {
      const created = docs.map((doc) => {
        if (transactions.some((row) => row.idempotencyKey === doc.idempotencyKey)) {
          const err = new Error('E11000 duplicate key error collection: stockTransactions index: uniq_stock_tx_idempotency_key');
          err.code = 11000;
          throw err;
        }
        const row = { ...doc };
        transactions.push(row);
        return row;
      });
      return created;
    },
    rewriteInventory: async (filter = {}, update = {}) => {
      const set = update.$set || {};
      const target = Array.from(snapshots.values()).find((row) => {
        if (filter._id && row._id) return String(row._id) === String(filter._id);
        return String(row.productCode || '').toUpperCase() === String(filter.productCode || '').toUpperCase()
          && String(row.warehouseCode || 'MAIN') === String(filter.warehouseCode || 'MAIN');
      });
      if (target) Object.assign(target, set);
      return { acknowledged: true, matchedCount: target ? 1 : 0, modifiedCount: target ? 1 : 0 };
    },
    applyDelta: async (filter = {}, update = {}, options = {}) => {
      const code = filter.productCode;
      let snapshot = snapshots.get(code) || null;
      const inc = update.$inc || {};
      if (!snapshot) {
        if (!options.upsert) return null;
        snapshot = createSnapshot({
          productCode: code,
          productId: update.$set?.productId || code,
          productName: update.$set?.productName || '',
          warehouseCode: filter.warehouseCode || 'MAIN',
          quantity: 0,
          availableQty: 0
        });
        snapshots.set(code, snapshot);
      }
      if (filter.availableQty && Number(snapshot.availableQty || 0) < Number(filter.availableQty.$gte || 0)) {
        return null;
      }
      for (const field of ['qty', 'quantity', 'onHand', 'availableQty']) {
        snapshot[field] = Number(snapshot[field] || 0) + Number(inc[field] || 0);
      }
      Object.assign(snapshot, update.$set || {});
      return snapshot;
    }
  };
}

async function withPatchedInventoryStore(initialSnapshots, fn) {
  const store = createInMemoryInventoryStore(initialSnapshots);
  const restoreProductFindOne = patch(Product, { findOne: async () => null });
  const restoreStockFindOne = patch(StockTransaction, { findOne: async (filter) => store.findTx(filter) });
  const restoreStockCreate = patch(StockTransaction, { create: async (docs) => store.createTx(docs) });
  const restoreSnapshotFindOne = patch(InventoryLegacy, { findOne: async (filter) => store.findSnapshot(filter) });
  const restoreSnapshotFind = patch(InventoryLegacy, { find: (filter) => store.findInventory(filter) });
  const restoreSnapshotDelete = patch(InventoryLegacy, { deleteMany: async (filter) => store.deleteInventory(filter) });
  const restoreSnapshotCreate = patch(InventoryLegacy, { create: async (docs) => store.createInventory(Array.isArray(docs) ? docs : [docs]) });
  const restoreSnapshotFindOneAndUpdate = patch(InventoryLegacy, { findOneAndUpdate: async (filter, update, options) => store.applyDelta(filter, update, options) });
  const restoreSnapshotUpdateOne = patch(InventoryLegacy, { updateOne: async (filter, update) => store.rewriteInventory(filter, update) });
  const restoreAvailability = patch(inventoryStockService, {
    getAvailableStock: async (productCode) => ({ productCode, availableQty: store.snapshots.get(productCode)?.availableQty ?? 0 })
  });

  try {
    await fn(store);
  } finally {
    restoreProductFindOne();
    restoreStockFindOne();
    restoreStockCreate();
    restoreSnapshotFindOne();
    restoreSnapshotFind();
    restoreSnapshotDelete();
    restoreSnapshotCreate();
    restoreSnapshotFindOneAndUpdate();
    restoreSnapshotUpdateOne();
    restoreAvailability();
  }
}

function saleOrder(id, items) {
  return { id, code: id, date: '2026-06-10', items };
}

test('same sourceType + sourceId + productCode does not subtract stock twice', async () => {
  await withPatchedInventoryStore([{ productCode: 'OMO001', quantity: 100, availableQty: 100 }], async (store) => {
    const doc = saleOrder('SO_TEST_001', [{ productCode: 'OMO001', quantity: 10 }]);
    const movement = { type: 'SALE', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_001', refCode: 'SO_TEST_001' };

    const first = await inventoryService.postStockMovement(doc, movement, { allowUnsafeNoSession: true });
    const second = await inventoryService.postStockMovement(doc, movement, { allowUnsafeNoSession: true });

    assert.equal(store.transactions.length, 1);
    assert.equal(store.snapshots.get('OMO001').quantity, 90);
    assert.equal(first[0].idempotencyKey, second[0].idempotencyKey);
    assert.equal(second[0].skipped, true);
    assert.equal(second[0].reason, 'DUPLICATE_STOCK_MOVEMENT');
  });
});

test('same order with multiple productCode values creates one movement per product', async () => {
  await withPatchedInventoryStore([
    { productCode: 'OMO001', quantity: 100, availableQty: 100 },
    { productCode: 'PS001', quantity: 50, availableQty: 50 }
  ], async (store) => {
    const doc = saleOrder('SO_TEST_001', [
      { productCode: 'OMO001', quantity: 10 },
      { productCode: 'PS001', quantity: 5 }
    ]);

    await inventoryService.postStockMovement(doc, { type: 'SALE', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_001' }, { allowUnsafeNoSession: true });

    assert.equal(store.transactions.length, 2);
    assert.equal(new Set(store.transactions.map((row) => row.idempotencyKey)).size, 2);
    assert.equal(store.snapshots.get('OMO001').quantity, 90);
    assert.equal(store.snapshots.get('PS001').quantity, 45);
  });
});

test('return order adds stock exactly once', async () => {
  await withPatchedInventoryStore([{ productCode: 'OMO001', quantity: 10, availableQty: 10 }], async (store) => {
    const doc = { id: 'RO_TEST_001', code: 'RO_TEST_001', date: '2026-06-10', items: [{ productCode: 'OMO001', returnQuantity: 3 }] };
    const movement = { type: 'RETURN', direction: 'IN', refType: 'RETURN_ORDER', refId: 'RO_TEST_001', refCode: 'RO_TEST_001' };

    await inventoryService.postStockMovement(doc, movement, { allowUnsafeNoSession: true });
    await inventoryService.postStockMovement(doc, movement, { allowUnsafeNoSession: true });

    assert.equal(store.transactions.length, 1);
    assert.equal(store.transactions[0].direction, 'IN');
    assert.equal(store.transactions[0].inQty, 3);
    assert.equal(store.snapshots.get('OMO001').quantity, 13);
  });
});

test('cancel order reverses stock and duplicate cancel does not add stock twice', async () => {
  await withPatchedInventoryStore([{ productCode: 'OMO001', quantity: 100, availableQty: 100 }], async (store) => {
    const doc = saleOrder('SO_TEST_002', [{ productCode: 'OMO001', quantity: 10 }]);

    await inventoryService.postStockMovement(doc, { type: 'SALE', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_002' }, { allowUnsafeNoSession: true });
    await inventoryService.reverseStockMovement(doc, { type: 'SALE', reverseType: 'SALE_CANCEL', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_002' });
    await inventoryService.reverseStockMovement(doc, { type: 'SALE', reverseType: 'SALE_CANCEL', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_002' });

    assert.equal(store.transactions.length, 2);
    assert.equal(store.transactions.filter((row) => row.type === 'SALE_CANCEL').length, 1);
    assert.equal(store.transactions.reduce((sum, row) => sum + row.quantity, 0), 0);
    assert.equal(store.snapshots.get('OMO001').quantity, 100);
  });
});
