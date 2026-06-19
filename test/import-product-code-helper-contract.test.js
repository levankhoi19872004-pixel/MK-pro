'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Product = require('../src/models/Product');
const inventoryStockService = require('../src/services/inventoryStock.service');
const {
  preloadProductsByCode
} = require('../src/services/import/core/importPersistence.util');
const {
  getStockMapByProductCode
} = require('../src/services/import/core/importRow.util');

test('import helpers resolve product codes through the shared row-value contract', async () => {
  const originalProductFind = Product.find;
  const originalGetAvailableStocks = inventoryStockService.getAvailableStocks;
  const received = { productQuery: null, stockCodes: null };

  Product.find = (query) => {
    received.productQuery = query;
    return {
      async lean() {
        return [{
          _id: '64f000000000000000000001',
          code: '62674330',
          productCode: '62674330',
          name: 'Sản phẩm kiểm thử'
        }];
      }
    };
  };

  inventoryStockService.getAvailableStocks = async (codes) => {
    received.stockCodes = codes;
    return { '62674330': 125 };
  };

  try {
    const sourceRows = [{ 'Mã hàng': '62674330' }];

    const productMap = await preloadProductsByCode(sourceRows);
    assert.equal(productMap.get('62674330').name, 'Sản phẩm kiểm thử');
    assert.deepEqual(received.productQuery.$or[0].code.$in, ['62674330']);

    const stockMap = await getStockMapByProductCode(sourceRows);
    assert.deepEqual(received.stockCodes, ['62674330']);
    assert.equal(stockMap.get('62674330'), 125);
  } finally {
    Product.find = originalProductFind;
    inventoryStockService.getAvailableStocks = originalGetAvailableStocks;
  }
});
