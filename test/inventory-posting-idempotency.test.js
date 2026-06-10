'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const inventoryService = require('../src/services/inventoryService');
const InventorySnapshot = require('../src/models/Inventory');
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
  const transactions = initialSnapshots.map((row) => ({
    id: `OPENING_${row.productCode}`,
    idempotencyKey: `OPENING|${row.productCode}`,
    sourceType: 'OPENING',
    productCode: row.productCode,
    productId: row.productId || row.productCode,
    quantity: Number(row.quantity ?? row.qty ?? row.onHand ?? row.availableQty ?? 0),
    qty: Number(row.quantity ?? row.qty ?? row.onHand ?? row.availableQty ?? 0),
    type: 'OPENING',
    direction: 'IN'
  }));

  return {
    snapshots,
    transactions,
    findSnapshot: async (filter = {}) => snapshots.get(filter.productCode) || null,
    findTx: async (filter = {}) => {
      if (filter.idempotencyKey) return transactions.find((row) => row.idempotencyKey === filter.idempotencyKey) || null;
      return transactions.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) || null;
    },
    findTxRows: (filter = {}) => transactions.filter((row) => matchStockFindFilter(row, filter)),
    updateSnapshot: async (filter = {}, update = {}) => {
      const productCode = filter.productCode;
      if (!productCode) return { acknowledged: true, modifiedCount: 0, upsertedCount: 0 };
      const current = snapshots.get(productCode) || createSnapshot({ productCode });
      Object.assign(current, update.$set || {});
      snapshots.set(productCode, current);
      return { acknowledged: true, modifiedCount: 1, upsertedCount: 0 };
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
    }
  };
}


function txFindChain(rows) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    lean: async () => rows
  };
  return chain;
}

function matchStockFindFilter(row, filter = {}) {
  if (filter.idempotencyKey) return row.idempotencyKey === filter.idempotencyKey;
  if (Array.isArray(filter.$or) && filter.$or.length) {
    return filter.$or.some((cond) => Object.entries(cond).every(([key, value]) => row[key] === value));
  }
  return Object.entries(filter).every(([key, value]) => {
    if (key === 'status') return true;
    return row[key] === value;
  });
}

async function withPatchedInventoryStore(initialSnapshots, fn) {
  const store = createInMemoryInventoryStore(initialSnapshots);
  const restoreProductFindOne = patch(Product, { findOne: async () => null });
  const restoreStockFindOne = patch(StockTransaction, { findOne: async (filter) => store.findTx(filter) });
  const restoreStockFind = patch(StockTransaction, { find: (filter) => txFindChain(store.findTxRows(filter)) });
  const restoreStockCreate = patch(StockTransaction, { create: async (docs) => store.createTx(docs) });
  const restoreSnapshotFindOne = patch(InventorySnapshot, { findOne: async (filter) => store.findSnapshot(filter) });
  const restoreSnapshotUpdateOne = patch(InventorySnapshot, { updateOne: (filter, update) => ({ session: async () => store.updateSnapshot(filter, update), then: (resolve) => resolve(store.updateSnapshot(filter, update)) }) });
  const restoreAvailability = patch(inventoryStockService, {
    getAvailableStock: async (productCode) => ({ productCode, availableQty: store.transactions.reduce((sum, row) => row.productCode === productCode ? sum + Number(row.quantity || 0) : sum, 0) || store.snapshots.get(productCode)?.availableQty || 0 })
  });

  try {
    await fn(store);
  } finally {
    restoreProductFindOne();
    restoreStockFindOne();
    restoreStockFind();
    restoreStockCreate();
    restoreSnapshotFindOne();
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

    const first = await inventoryService.postStockMovement(doc, movement);
    const second = await inventoryService.postStockMovement(doc, movement);

    assert.equal(store.transactions.filter((row) => row.type !== 'OPENING').length, 1);
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

    await inventoryService.postStockMovement(doc, { type: 'SALE', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_001' });

    assert.equal(store.transactions.filter((row) => row.type !== 'OPENING').length, 2);
    assert.equal(new Set(store.transactions.filter((row) => row.type !== 'OPENING').map((row) => row.idempotencyKey)).size, 2);
    assert.equal(store.snapshots.get('OMO001').quantity, 90);
    assert.equal(store.snapshots.get('PS001').quantity, 45);
  });
});

test('return order adds stock exactly once', async () => {
  await withPatchedInventoryStore([{ productCode: 'OMO001', quantity: 10, availableQty: 10 }], async (store) => {
    const doc = { id: 'RO_TEST_001', code: 'RO_TEST_001', date: '2026-06-10', items: [{ productCode: 'OMO001', returnQuantity: 3 }] };
    const movement = { type: 'RETURN', direction: 'IN', refType: 'RETURN_ORDER', refId: 'RO_TEST_001', refCode: 'RO_TEST_001' };

    await inventoryService.postStockMovement(doc, movement);
    await inventoryService.postStockMovement(doc, movement);

    assert.equal(store.transactions.filter((row) => row.type !== 'OPENING').length, 1);
    const returnTx = store.transactions.find((row) => row.type === 'RETURN');
    assert.equal(returnTx.direction, 'IN');
    assert.equal(returnTx.inQty, 3);
    assert.equal(store.snapshots.get('OMO001').quantity, 13);
  });
});

test('cancel order reverses stock and duplicate cancel does not add stock twice', async () => {
  await withPatchedInventoryStore([{ productCode: 'OMO001', quantity: 100, availableQty: 100 }], async (store) => {
    const doc = saleOrder('SO_TEST_002', [{ productCode: 'OMO001', quantity: 10 }]);

    await inventoryService.postStockMovement(doc, { type: 'SALE', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_002' });
    await inventoryService.reverseStockMovement(doc, { type: 'SALE', reverseType: 'SALE_CANCEL', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_002' });
    await inventoryService.reverseStockMovement(doc, { type: 'SALE', reverseType: 'SALE_CANCEL', direction: 'OUT', refType: 'SALE_ORDER', refId: 'SO_TEST_002' });

    assert.equal(store.transactions.filter((row) => row.type !== 'OPENING').length, 2);
    assert.equal(store.transactions.filter((row) => row.type === 'SALE_CANCEL').length, 1);
    assert.equal(store.transactions.reduce((sum, row) => sum + row.quantity, 0), 100);
    assert.equal(store.snapshots.get('OMO001').quantity, 100);
  });
});
