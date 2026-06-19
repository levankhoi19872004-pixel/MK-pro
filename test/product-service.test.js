'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const productRepository = require('../src/repositories/productRepository');
const productService = require('../src/services/productService');
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

test('ProductService.createProduct validates required fields before writing', async () => {
  let createCalled = false;
  const restore = patch(productRepository, {
    findDuplicateCode: async () => null,
    findDuplicateBarcode: async () => null,
    create: async () => { createCalled = true; }
  });

  try {
    const result = await productService.createProduct({ name: 'Dầu gội' });
    assert.equal(result.status, 400);
    assert.match(result.error, /Thiếu mã sản phẩm/);
    assert.equal(createCalled, false);
  } finally {
    restore();
  }
});

test('ProductService.createProduct normalizes packing and rejects duplicate code', async () => {
  const restore = patch(productRepository, {
    findDuplicateCode: async (code) => (code === 'P001' ? { _id: 'mongo-id' } : null),
    findDuplicateBarcode: async () => null,
    create: async () => { throw new Error('create must not be called for duplicate code'); }
  });

  try {
    const result = await productService.createProduct({
      code: ' P001 ',
      name: 'Sản phẩm test',
      conversionRate: 12,
      costPrice: 1000,
      salePrice: 1500
    });
    assert.equal(result.status, 409);
    assert.match(result.error, /Mã sản phẩm đã tồn tại/);
  } finally {
    restore();
  }
});

test('ProductService.listProducts maps stock display fields for frontend', async () => {
  const restore = patch(productRepository, {
    findAll: async () => [{ code: 'P002', name: 'Kem đánh răng', conversionRate: 12 }]
  });
  const restoreInventory = patch(inventoryStockService, {
    getAvailableStocks: async () => ({ P002: 25 })
  });

  try {
    const result = await productService.listProducts({ allowAll: '1' });
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].id, 'P002');
    assert.equal(result.products[0].stockQuantity, 25);
    assert.ok(result.products[0].stockDisplay);
  } finally {
    restoreInventory();
    restore();
  }
});
