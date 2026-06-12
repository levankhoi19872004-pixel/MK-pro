'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const inventoryService = require('../src/services/inventoryService');
const InventoryPostingService = require('../src/domain/posting/InventoryPostingService');
const InventoryLegacy = require('../src/models/InventoryLegacy');
const Product = require('../src/models/Product');
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

function createAtomicStore(initial = []) {
  const snapshots = new Map();
  for (const sourceRow of initial) {
    const code = String(sourceRow.productCode).toUpperCase();
    const qty = Number(sourceRow.quantity ?? sourceRow.qty ?? sourceRow.availableQty ?? 0);
    const onHand = Number(sourceRow.onHand ?? sourceRow.quantity ?? sourceRow.qty ?? sourceRow.availableQty ?? 0);
    const availableQty = Number(sourceRow.availableQty ?? sourceRow.quantity ?? sourceRow.qty ?? sourceRow.onHand ?? 0);
    const reservedQty = Number(sourceRow.reservedQty || 0);
    const row = snapshots.get(code) || {
      productCode: code,
      productId: sourceRow.productId || code,
      productName: sourceRow.productName || '',
      warehouseCode: sourceRow.warehouseCode || 'MAIN',
      warehouseId: sourceRow.warehouseId || sourceRow.warehouseCode || 'MAIN',
      qty: 0,
      quantity: 0,
      onHand: 0,
      availableQty: 0,
      reservedQty: 0
    };
    row.qty += qty;
    row.quantity += qty;
    row.onHand += onHand;
    row.availableQty += availableQty;
    row.reservedQty += reservedQty;
    snapshots.set(code, row);
  }
  const transactions = [];

  return {
    snapshots,
    transactions,
    async findTx(filter = {}) {
      return transactions.find((row) => row.idempotencyKey === filter.idempotencyKey) || null;
    },
    findInventory(filter = {}) {
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
    async deleteInventory(filter = {}) {
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
    async createInventory(docs) {
      return docs.map((doc) => {
        const code = String(doc.productCode || doc.productId || '').toUpperCase();
        const row = { ...doc, productCode: code };
        snapshots.set(code, row);
        return row;
      });
    },
    async createTx(docs) {
      return docs.map((doc) => {
        if (transactions.some((row) => row.idempotencyKey === doc.idempotencyKey)) {
          const err = new Error('E11000 duplicate key');
          err.code = 11000;
          throw err;
        }
        const row = { ...doc };
        transactions.push(row);
        return row;
      });
    },
    async rewriteInventory(filter = {}, update = {}) {
      const set = update.$set || {};
      const target = Array.from(snapshots.values()).find((row) => {
        if (filter._id && row._id) return String(row._id) === String(filter._id);
        return String(row.productCode || '').toUpperCase() === String(filter.productCode || '').toUpperCase()
          && String(row.warehouseCode || 'MAIN') === String(filter.warehouseCode || 'MAIN');
      });
      if (target) Object.assign(target, set);
      return { acknowledged: true, matchedCount: target ? 1 : 0, modifiedCount: target ? 1 : 0 };
    },
    async atomicUpdate(filter = {}, update = {}, options = {}) {
      const code = String(filter.productCode || '').toUpperCase();
      let row = snapshots.get(code) || null;
      if (!row) {
        if (!options.upsert) return null;
        row = {
          productCode: code,
          productId: update.$set?.productId || code,
          productName: update.$set?.productName || '',
          warehouseCode: filter.warehouseCode || 'MAIN',
          warehouseId: filter.warehouseCode || 'MAIN',
          qty: 0,
          quantity: 0,
          onHand: 0,
          availableQty: 0,
          reservedQty: 0
        };
        snapshots.set(code, row);
      }
      if (filter.availableQty && Number(row.availableQty || 0) < Number(filter.availableQty.$gte || 0)) {
        return null;
      }
      for (const field of ['qty', 'quantity', 'onHand', 'availableQty']) {
        row[field] = Number(row[field] || 0) + Number(update.$inc?.[field] || 0);
      }
      Object.assign(row, update.$set || {});
      return row;
    }
  };
}

async function withAtomicStore(initial, fn) {
  const store = createAtomicStore(initial);
  const restoreProduct = patch(Product, { findOne: async () => null });
  const restoreTxFind = patch(StockTransaction, { findOne: async (filter) => store.findTx(filter) });
  const restoreTxCreate = patch(StockTransaction, { create: async (docs) => store.createTx(docs) });
  const restoreInventoryFind = patch(InventoryLegacy, { find: (filter) => store.findInventory(filter) });
  const restoreInventoryDelete = patch(InventoryLegacy, { deleteMany: async (filter) => store.deleteInventory(filter) });
  const restoreInventoryCreate = patch(InventoryLegacy, { create: async (docs) => store.createInventory(Array.isArray(docs) ? docs : [docs]) });
  const restoreInventoryUpdate = patch(InventoryLegacy, { findOneAndUpdate: async (filter, update, options) => store.atomicUpdate(filter, update, options) });
  const restoreInventoryRewrite = patch(InventoryLegacy, { updateOne: async (filter, update) => store.rewriteInventory(filter, update) });

  try {
    await fn(store);
  } finally {
    restoreProduct();
    restoreTxFind();
    restoreTxCreate();
    restoreInventoryFind();
    restoreInventoryDelete();
    restoreInventoryCreate();
    restoreInventoryUpdate();
    restoreInventoryRewrite();
  }
}

test('postStockMovement groups duplicate product lines before posting stock', async () => {
  await withAtomicStore([{ productCode: 'OMO001', quantity: 20, availableQty: 20 }], async (store) => {
    const order = {
      id: 'SO_ATOMIC_001',
      code: 'SO_ATOMIC_001',
      date: '2026-06-11',
      items: [
        { productCode: 'omo001', quantity: 5 },
        { productCode: 'OMO001', quantity: 7 }
      ]
    };

    const posted = await inventoryService.postStockMovement(
      order,
      { type: 'SALE', direction: 'OUT', refType: 'SALES_ORDER', refId: order.id, refCode: order.code },
      { session: { id: 'mock-session' } }
    );

    assert.equal(posted.length, 1);
    assert.equal(store.transactions.length, 1);
    assert.equal(store.transactions[0].productCode, 'OMO001');
    assert.equal(store.transactions[0].quantity, -12);
    assert.equal(store.snapshots.get('OMO001').availableQty, 8);
  });
});

test('atomic OUT posting requires session unless explicitly allowed for tests/migration', async () => {
  await assert.rejects(
    () => inventoryService.postStockMovement(
      { id: 'SO_NO_SESSION', items: [{ productCode: 'OMO001', quantity: 1 }] },
      { type: 'SALE', direction: 'OUT', refType: 'SALES_ORDER', refId: 'SO_NO_SESSION' }
    ),
    (err) => err && err.code === 'INVENTORY_SESSION_REQUIRED'
  );

  await assert.rejects(
    () => InventoryPostingService.postSaleOut({ id: 'SO_NO_SESSION', items: [{ productCode: 'OMO001', quantity: 1 }] }),
    (err) => err && err.code === 'INVENTORY_SESSION_REQUIRED'
  );
});

test('postStockMovement normalizes legacy product inventory to MAIN before atomic posting', async () => {
  await withAtomicStore([
    { productCode: 'OMO001', warehouseCode: 'KHO_HC', quantity: 10, availableQty: 10 },
    { productCode: 'OMO001', warehouseCode: 'KHO_PC', quantity: 5, availableQty: 5 }
  ], async (store) => {
    const posted = await inventoryService.postStockMovement(
      { id: 'SO_NORMALIZE_001', code: 'SO_NORMALIZE_001', items: [{ productCode: 'OMO001', quantity: 4 }] },
      { type: 'SALE', direction: 'OUT', refType: 'SALES_ORDER', refId: 'SO_NORMALIZE_001', refCode: 'SO_NORMALIZE_001' },
      { session: { id: 'mock-session' } }
    );

    assert.equal(posted.length, 1);
    assert.equal(store.snapshots.size, 1);
    assert.equal(store.snapshots.get('OMO001').warehouseCode, 'MAIN');
    assert.equal(store.snapshots.get('OMO001').availableQty, 11);
  });
});

test('atomic OUT posting blocks oversell by conditional inventory update', async () => {
  await withAtomicStore([{ productCode: 'OMO001', quantity: 10, availableQty: 10 }], async (store) => {
    const session = { id: 'mock-session' };
    await inventoryService.postStockMovement(
      { id: 'SO_ATOMIC_A', code: 'SO_ATOMIC_A', items: [{ productCode: 'OMO001', quantity: 8 }] },
      { type: 'SALE', direction: 'OUT', refType: 'SALES_ORDER', refId: 'SO_ATOMIC_A', refCode: 'SO_ATOMIC_A' },
      { session }
    );

    await assert.rejects(
      () => inventoryService.postStockMovement(
        { id: 'SO_ATOMIC_B', code: 'SO_ATOMIC_B', items: [{ productCode: 'OMO001', quantity: 5 }] },
        { type: 'SALE', direction: 'OUT', refType: 'SALES_ORDER', refId: 'SO_ATOMIC_B', refCode: 'SO_ATOMIC_B' },
        { session }
      ),
      (err) => err && err.code === 'INSUFFICIENT_STOCK'
    );

    assert.equal(store.snapshots.get('OMO001').availableQty, 2);
    assert.ok(store.snapshots.get('OMO001').availableQty >= 0);
  });
});
