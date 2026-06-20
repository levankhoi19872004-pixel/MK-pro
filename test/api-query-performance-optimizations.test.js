'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const REPORT_SERVICE_PATH = path.resolve(__dirname, '../src/services/reports/InventoryReportService.js');
const { todayVN } = require('../src/utils/date.util');

function loadReportServiceFixture() {
  const businessDate = todayVN();
  const products = [{
    _id: 'p1', id: 'p1', code: 'SP01', productCode: 'SP01', sku: 'sp01',
    name: 'Sản phẩm 1', baseUnit: 'gói', conversionRate: 24
  }];
  const transactions = [{
    _id: 't1', id: 't1', date: businessDate, _reportBusinessDate: businessDate,
    createdAt: `${businessDate}T08:00:00.000Z`, productId: 'p1', productCode: 'SP01',
    productName: 'Sản phẩm 1', type: 'IMPORT', direction: 'IN', quantity: 5,
    refCode: 'IMP-1', note: 'Nhập thử', payload: { mustNotBeProjected: true }
  }];
  const counters = { productFind: 0, inventorySummary: 0, pipelines: [], preloadedRows: null };

  const Product = {
    find() {
      counters.productFind += 1;
      return {
        select() { return this; },
        async lean() { return products.map((row) => ({ ...row })); }
      };
    }
  };
  const StockTransaction = {
    aggregate(pipeline) {
      counters.pipelines.push(pipeline);
      return {
        allowDiskUse() { return this; },
        async exec() { return transactions.map((row) => ({ ...row })); }
      };
    }
  };
  const inventoryStockService = {
    async getInventorySummary(_query, options = {}) {
      counters.inventorySummary += 1;
      counters.preloadedRows = await options.preloadedProductsPromise;
      return {
        stock: [{ productId: 'p1', productCode: 'SP01', productName: 'Sản phẩm 1', onHand: 5, availableQty: 5, reservedQty: 0 }],
        summary: { totalRows: 1, totalQuantity: 5 },
        negativeStockCount: 0,
        negativeStockRows: []
      };
    }
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === REPORT_SERVICE_PATH) {
      if (request === '../../models/Product') return Product;
      if (request === '../../models/StockTransaction') return StockTransaction;
      if (request === '../inventoryStock.service') return inventoryStockService;
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[REPORT_SERVICE_PATH];
    return { service: require(REPORT_SERVICE_PATH), counters };
  } finally {
    Module._load = originalLoad;
  }
}

test('inventory movement reuses the product read, projects ledger fields, and skips unnecessary sort', async () => {
  const { service, counters } = loadReportServiceFixture();
  const result = await service.inventoryMovementReport({
    dateFrom: todayVN(), dateTo: todayVN(), page: 1, limit: 50
  });

  assert.equal(counters.productFind, 1, 'Product catalog must be read once per request');
  assert.equal(counters.inventorySummary, 1);
  assert.deepEqual(counters.preloadedRows.map((row) => row.code), ['SP01']);
  assert.equal(counters.pipelines.length, 1);
  assert.equal(counters.pipelines[0].some((stage) => stage.$sort), false, 'movement aggregation does not require row order');
  const projection = counters.pipelines[0].find((stage) => stage.$project)?.$project;
  assert.equal(projection.productCode, 1);
  assert.equal(projection.quantity, 1);
  assert.equal(projection.payload, undefined);
  assert.equal(result.stock[0].productCode, 'SP01');
  assert.equal(result.stock[0].endingQty, 5);
});

test('stock card pushes an exact product identity into Mongo and preserves ordered output', async () => {
  const { service, counters } = loadReportServiceFixture();
  const result = await service.stockCardReport({
    dateFrom: todayVN(), dateTo: todayVN(), q: 'sp01', page: 1, limit: 50
  });

  assert.equal(counters.productFind, 1);
  assert.equal(counters.pipelines.length, 1);
  const firstStage = counters.pipelines[0][0];
  assert.ok(firstStage.$match?.$or, 'exact product filter must be the first pipeline stage');
  const values = firstStage.$match.$or.flatMap((clause) => Object.values(clause)[0].$in || []);
  assert.ok(values.includes('SP01'));
  assert.ok(values.includes('sp01'));
  assert.equal(counters.pipelines[0].some((stage) => stage.$sort), true, 'stock card keeps deterministic ledger order');
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].refCode, 'IMP-1');
});

test('inventory summary accepts request-scoped product rows and applies a narrow inventory projection', async () => {
  const Product = require('../src/models/Product');
  const Inventory = require('../src/models/InventoryLegacy');
  const inventoryStockService = require('../src/services/inventoryStock.service');
  const originalProductFind = Product.find;
  const originalInventoryFind = Inventory.find;
  let productFindCalls = 0;
  let selected = '';

  Product.find = () => {
    productFindCalls += 1;
    throw new Error('Product.find must not run when preloadedProductsPromise is provided');
  };
  Inventory.find = () => {
    const chain = {
      select(value) { selected = value; return chain; },
      sort() { return chain; },
      session() { return chain; },
      async lean() {
        return [{ productId: 'p1', productCode: 'SP01', onHand: 10, reservedQty: 2, availableQty: 8 }];
      }
    };
    return chain;
  };

  try {
    inventoryStockService.invalidateInventorySummaryCache();
    const result = await inventoryStockService.getInventorySummary({}, {
      forceRefresh: true,
      preloadedProductsPromise: Promise.resolve([{
        _id: 'p1', id: 'p1', code: 'SP01', productCode: 'SP01', name: 'Sản phẩm 1', conversionRate: 24
      }])
    });
    assert.equal(productFindCalls, 0);
    assert.match(selected, /productCode/);
    assert.match(selected, /availableQty/);
    assert.doesNotMatch(selected, /auditTrail|payload|history/);
    assert.equal(result.stock[0].onHand, 10);
    assert.equal(result.stock[0].availableQty, 8);
  } finally {
    Product.find = originalProductFind;
    Inventory.find = originalInventoryFind;
    inventoryStockService.invalidateInventorySummaryCache();
  }
});
