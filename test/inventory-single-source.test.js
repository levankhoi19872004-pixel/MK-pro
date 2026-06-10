'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const Product = require('../src/models/Product');
const InventorySnapshot = require('../src/models/Inventory');
const InventoryLegacy = require('../src/models/InventoryLegacy');
const productRepository = require('../src/repositories/productRepository');
const inventoryStockService = require('../src/services/inventoryStock.service');
const productService = require('../src/services/productService');
const { createMobileService } = require('../src/services/mobileService');

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

function leanChain(rows) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => rows
  };
  return chain;
}

test('inventoryStockService reads inventorySnapshots, not legacy inventories, when calculating stock', async () => {
  const restoreProductFind = patch(Product, {
    find: () => leanChain([{ code: 'P001', productCode: 'P001', sku: 'P001' }])
  });
  const restoreSnapshotFind = patch(InventorySnapshot, {
    find: () => leanChain([{ productCode: 'P001', availableQty: 25, quantity: 25, qty: 25 }])
  });
  const restoreLegacyFind = patch(InventoryLegacy, {
    find: () => { throw new Error('InventoryLegacy must not be used for display stock'); }
  });

  try {
    const stocks = await inventoryStockService.getAvailableStocks(['P001']);
    assert.equal(stocks.P001, 25);
  } finally {
    restoreProductFind();
    restoreSnapshotFind();
    restoreLegacyFind();
  }
});

test('productService displays stock from inventorySnapshots even when legacy inventories would be zero', async () => {
  const restoreRepo = patch(productRepository, {
    findAll: async () => [{ code: 'P001', name: 'Sản phẩm tồn snapshot', conversionRate: 12 }]
  });
  const restoreStock = patch(inventoryStockService, {
    getAvailableStocks: async () => ({ P001: 25 })
  });
  const restoreLegacyFind = patch(InventoryLegacy, {
    find: () => leanChain([{ productCode: 'P001', availableQty: 0, quantity: 0, qty: 0 }])
  });

  try {
    const result = await productService.listProducts({ allowAll: '1' });
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].availableQty, 25);
    assert.equal(result.products[0].stockQuantity, 25);
  } finally {
    restoreRepo();
    restoreStock();
    restoreLegacyFind();
  }
});

test('mobile catalog displays stock from inventorySnapshots single source', async () => {
  const restoreProductFind = patch(Product, {
    find: () => leanChain([{ code: 'P001', name: 'Sản phẩm app', conversionRate: 12, salePrice: 1000, isActive: true }])
  });
  const restoreStock = patch(inventoryStockService, {
    getAvailableStock: async () => ({ productCode: 'P001', availableQty: 25 })
  });
  const restoreLegacyFind = patch(InventoryLegacy, {
    find: () => leanChain([{ productCode: 'P001', availableQty: 0 }])
  });

  const svc = createMobileService({
    ROLE_LABELS: {},
    VALID_ROLES: ['sales', 'delivery', 'admin'],
    ACCESS_TOKEN_EXPIRES_IN: '1h',
    normalizeText: (v) => String(v || '').trim().toLowerCase(),
    toNumber: (v) => Number(v || 0),
    verifyPasswordSync: () => true,
    staffMongoToClient: (v) => v,
    customerMongoToClient: (v) => v,
    productMongoToClient: (v) => ({ id: v.code, code: v.code, name: v.name, ...v }),
    stripMongoFields: (v) => v,
    buildJwtPayload: (v) => v,
    encodeMobileToken: () => 'token',
    encodeMobileRefreshToken: () => 'refresh',
    decodeMobileRefreshToken: () => null,
    getPrimaryDataSnapshot: async () => ({}),
    persistPrimaryDataSnapshot: async () => {},
    saveOperationalData: async () => {},
    refreshOrderDocumentCacheFromMongo: async () => {},
    writeMobileLog: () => {},
    findCustomer: () => null,
    findProduct: () => null,
    getProductAvailableQty: () => 0,
    formatCaseLooseQty: (qty, rate) => `${Math.floor(Number(qty || 0) / Math.max(1, Number(rate || 1)))}/${Number(qty || 0) % Math.max(1, Number(rate || 1))}`,
    buildProductLineMeta: () => ({}),
    reduceStock: () => {},
    makeId: () => 'id',
    buildSalesCode: () => 'SO',
    buildCashCode: () => 'CASH',
    updateSalesOrderWithRepost: async () => ({}),
    buildMobileProduct: (v) => v,
    MongoStore: { roles: { find: () => leanChain([]) }, staffs: { findOne: () => ({ lean: async () => null }) } }
  });

  try {
    const result = await svc.products({ query: { q: 'P001' } });
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].availableQty, 25);
    assert.equal(result.body.items[0].stockQuantity, 25);
  } finally {
    restoreProductFind();
    restoreStock();
    restoreLegacyFind();
  }
});
