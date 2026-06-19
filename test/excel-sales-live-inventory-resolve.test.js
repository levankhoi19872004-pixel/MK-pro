'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const productRepository = require('../src/repositories/productRepository');
const inventoryStockService = require('../src/services/inventoryStock.service');
const ExcelInteractionService = require('../src/services/excel/ExcelInteractionService');

test('Excel sales paste resolves current inventory instead of treating every product as out of stock', async () => {
  const originalFindByCodes = productRepository.findByCodes;
  const originalGetAvailableStocks = inventoryStockService.getAvailableStocks;

  productRepository.findByCodes = async (codes) => {
    assert.deepEqual(codes, ['62674330', 'MISSING']);
    return [{
      _id: '64f000000000000000000001',
      code: '62674330',
      sku: '62674330',
      productCode: '62674330',
      barcode: '8930000000001',
      name: 'Sản phẩm kiểm thử',
      unit: 'Thùng',
      baseUnit: 'Cái',
      conversionRate: 12,
      salePrice: 18000,
      costPrice: 15000,
      isActive: true
    }];
  };

  inventoryStockService.getAvailableStocks = async (codes) => {
    assert.deepEqual(codes, ['62674330']);
    return { '62674330': 999999 };
  };

  try {
    const result = await ExcelInteractionService.resolveProducts(['62674330', 'MISSING']);

    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].code, '62674330');
    assert.equal(result.products[0].availableQty, 999999);
    assert.equal(result.products[0].availableStock, 999999);
    assert.equal(result.products[0].stockQuantity, 999999);
    assert.equal(result.products[0].openSaleQty, 999999);
    assert.equal(result.products[0].quantity, 999999);
    assert.equal(result.products[0].stockCase, 83333);
    assert.equal(result.products[0].stockLoose, 3);
    assert.equal(result.products[0].stockDisplay, '83333/3');
    assert.equal(result.products[0].isOutOfStock, false);
    assert.equal(result.products[0].inventorySource, 'inventories');
    assert.equal(result.products[0].barcode, '8930000000001');
    assert.deepEqual(result.missingCodes, ['MISSING']);
  } finally {
    productRepository.findByCodes = originalFindByCodes;
    inventoryStockService.getAvailableStocks = originalGetAvailableStocks;
  }
});

test('Excel product resolver keeps real zero stock as out of stock', async () => {
  const originalFindByCodes = productRepository.findByCodes;
  const originalGetAvailableStocks = inventoryStockService.getAvailableStocks;

  productRepository.findByCodes = async () => [{
    code: 'ZERO01',
    productCode: 'ZERO01',
    name: 'Sản phẩm hết tồn',
    conversionRate: 24,
    isActive: true
  }];
  inventoryStockService.getAvailableStocks = async () => ({ ZERO01: 0 });

  try {
    const result = await ExcelInteractionService.resolveProducts(['zero01']);
    assert.equal(result.products[0].availableQty, 0);
    assert.equal(result.products[0].stockDisplay, '0/0');
    assert.equal(result.products[0].isOutOfStock, true);
    assert.deepEqual(result.missingCodes, []);
  } finally {
    productRepository.findByCodes = originalFindByCodes;
    inventoryStockService.getAvailableStocks = originalGetAvailableStocks;
  }
});
