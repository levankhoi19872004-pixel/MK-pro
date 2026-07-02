'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const searchRepository = require('../src/repositories/searchRepository');
const searchService = require('../src/services/searchService');
const Product = require('../src/models/Product');
const inventoryStockService = require('../src/services/inventoryStock.service');
const internalSaleAllocationService = require('../src/services/internalSaleAllocation.service');
const { createMobileCatalogService } = require('../src/services/mobile/catalog.service');

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

function productRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const code = `SP${String(n).padStart(3, '0')}`;
    return {
      id: code,
      code,
      productCode: code,
      sku: code,
      name: `Sản phẩm ${n}`,
      productName: `Sản phẩm ${n}`,
      salePrice: 1000 + n,
      conversionRate: 12,
      isActive: true
    };
  });
}

function leanFind(rows, calls = []) {
  return (filter) => {
    const call = { filter, limit: null, skip: null };
    calls.push(call);
    const chain = {
      select() { return chain; },
      sort() { return chain; },
      skip(value) { call.skip = value; return chain; },
      limit(value) { call.limit = value; return chain; },
      lean: async () => rows.slice(0, call.limit || rows.length)
    };
    return chain;
  };
}

test('unified product search defaults to in-stock-only and returns max 20 rows', async () => {
  const rows = productRows(30);
  const restore = patch(searchRepository, {
    findProducts: async (query) => {
      assert.equal(query.limit, 20);
      assert.equal(query.candidateLimit, 100);
      return rows;
    },
    findInventoriesForProducts: async (products) => products.map((product, index) => ({
      productCode: product.code,
      availableQty: index % 3 === 0 ? 0 : (index % 3 === 1 ? -5 : 10)
    }))
  });

  try {
    const result = await searchService.searchProducts({ q: 'SP' });
    assert.ok(result.length <= 20);
    assert.ok(result.length > 0);
    assert.ok(result.every((row) => Number(row.availableQty) > 0));
    assert.ok(!result.some((row) => ['SP001', 'SP002'].includes(row.code)), 'zero/negative stock rows must be removed');
  } finally {
    restore();
  }
});

test('unified product search clamps excessive limit to 50 and never searches empty keyword', async () => {
  const rows = productRows(80);
  let findCalled = false;
  const restore = patch(searchRepository, {
    findProducts: async (query) => {
      findCalled = true;
      assert.equal(query.limit, 50);
      assert.equal(query.candidateLimit, 250);
      return rows;
    },
    findInventoriesForProducts: async (products) => products.map((product) => ({ productCode: product.code, availableQty: 10 }))
  });

  try {
    const empty = await searchService.searchProducts({ q: '' });
    assert.deepEqual(empty, []);
    assert.equal(findCalled, false);

    const result = await searchService.searchProducts({ q: 'SP', limit: 999 });
    assert.equal(result.length, 50);
    assert.ok(result.every((row) => Number(row.availableQty) > 0));
  } finally {
    restore();
  }
});

test('mobile catalog product search hides zero stock, rejects empty keyword, and clamps limit to 50', async () => {
  const rows = productRows(60);
  const findCalls = [];
  const restoreProduct = patch(Product, {
    find: leanFind(rows, findCalls),
    countDocuments: async () => rows.length
  });
  const restoreStock = patch(inventoryStockService, {
    getAvailableStocks: async (codes) => Object.fromEntries((codes || []).map((code, index) => [inventoryStockService.normalizeProductCode(code), index % 2 === 0 ? 15 : 0])),
    normalizeProductCode: (value = '') => String(value || '').trim().toUpperCase(),
    stockWarehouseCode: () => 'MAIN'
  });
  const restoreQuota = patch(internalSaleAllocationService, {
    isQuotaEnabled: () => false
  });

  const service = createMobileCatalogService({});

  try {
    const empty = await service.products({ query: { q: '' } });
    assert.equal(empty.body.items.length, 0);
    assert.equal(findCalls.length, 0, 'empty mobile product search must not query the product catalog');

    const result = await service.products({ query: { q: 'SP', limit: 999 } });
    assert.equal(result.body.items.length, 30);
    assert.ok(result.body.items.length <= 50);
    assert.ok(result.body.items.every((row) => Number(row.availableQty) > 0));
    assert.equal(findCalls[0].limit, 250, 'backend may overfetch bounded candidates before applying inventory filter');
  } finally {
    restoreProduct();
    restoreStock();
    restoreQuota();
  }
});
