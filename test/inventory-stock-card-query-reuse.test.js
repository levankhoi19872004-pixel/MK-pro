'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const path = require('node:path');

const SERVICE_PATH = path.resolve(__dirname, '../src/services/reports/InventoryReportService.js');

function createFixture(options = {}) {
  const products = options.products || [
    { _id: 'p1', id: 'p1', code: 'SP01', productCode: 'SP01', name: 'Sản phẩm 1', baseUnit: 'gói' },
    { _id: 'p2', id: 'p2', code: 'SP02', productCode: 'SP02', name: 'Sản phẩm 2', baseUnit: 'chai' }
  ];
  const transactions = (options.transactions || [
    { _id: 't1', id: 't1', date: '2020-01-01', createdAt: '2020-01-01T08:00:00.000Z', productCode: 'SP01', productName: 'Sản phẩm 1', type: 'OPENING', direction: 'IN', quantity: 100, refCode: 'OPEN-1' },
    { _id: 't2', id: 't2', date: '2020-01-03', createdAt: '2020-01-03T08:00:00.000Z', productCode: 'SP01', productName: 'Sản phẩm 1', type: 'IMPORT', direction: 'IN', quantity: 20, refCode: 'IMP-1' },
    { _id: 't3', id: 't3', date: '2020-01-05', createdAt: '2020-01-05T08:00:00.000Z', productCode: 'SP01', productName: 'Sản phẩm 1', type: 'SALE', direction: 'OUT', quantity: 30, refCode: 'SO-1' },
    { _id: 't4', id: 't4', date: '2020-01-07', createdAt: '2020-01-07T08:00:00.000Z', productCode: 'SP01', productName: 'Sản phẩm 1', type: 'RETURN', direction: 'IN', quantity: 5, refCode: 'RO-1' },
    { _id: 't5', id: 't5', date: '2019-12-30', createdAt: '2019-12-30T08:00:00.000Z', productCode: 'SP02', productName: 'Sản phẩm 2', type: 'OPENING', direction: 'IN', quantity: 50, refCode: 'OPEN-2' },
    { _id: 't6', id: 't6', date: '2020-01-08', createdAt: '2020-01-08T08:00:00.000Z', productCode: 'SP02', productName: 'Sản phẩm 2', type: 'SALE', direction: 'OUT', quantity: 10, refCode: 'SO-2' }
  ]).map((row) => ({ ...row, _reportBusinessDate: row.date }));
  const futureTransactions = (options.futureTransactions || [
    { _id: 't7', id: 't7', date: '2020-01-15', createdAt: '2020-01-15T08:00:00.000Z', productCode: 'SP01', productName: 'Sản phẩm 1', type: 'SALE', direction: 'OUT', quantity: 7, refCode: 'SO-FUTURE' }
  ]).map((row) => ({ ...row, _reportBusinessDate: row.date }));
  const currentStock = options.currentStock || [
    { productId: 'p1', productCode: 'SP01', productName: 'Sản phẩm 1', unit: 'gói', onHand: 88, reservedQty: 0, availableQty: 88 },
    { productId: 'p2', productCode: 'SP02', productName: 'Sản phẩm 2', unit: 'chai', onHand: 40, reservedQty: 0, availableQty: 40 }
  ];
  const delayMs = Number(options.delayMs || 0);
  const counters = { aggregateCalls: 0, productFindCalls: 0, inventorySummaryCalls: 0, aggregateRanges: [] };

  const pause = () => delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
  function aggregateRange(pipeline) {
    for (const stage of pipeline || []) {
      const range = stage?.$match?._reportBusinessDate;
      if (range) return { from: range.$gte, to: range.$lte };
    }
    return { from: '', to: '' };
  }

  const Product = {
    find() {
      counters.productFindCalls += 1;
      return {
        select() { return this; },
        async lean() {
          await pause();
          return products.map((row) => ({ ...row }));
        }
      };
    }
  };
  const StockTransaction = {
    aggregate(pipeline) {
      counters.aggregateCalls += 1;
      const range = aggregateRange(pipeline);
      counters.aggregateRanges.push(range);
      const rows = range.from === '0000-01-01' ? transactions : futureTransactions;
      return {
        allowDiskUse() { return this; },
        async exec() {
          await pause();
          return rows.map((row) => ({ ...row }));
        }
      };
    }
  };
  const inventoryStockService = {
    async getInventorySummary() {
      counters.inventorySummaryCalls += 1;
      await pause();
      return {
        stock: currentStock.map((row) => ({ ...row })),
        summary: { totalProducts: currentStock.length },
        negativeStockCount: 0,
        negativeStockRows: []
      };
    }
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === SERVICE_PATH) {
      if (request === '../../models/Product') return Product;
      if (request === '../../models/StockTransaction') return StockTransaction;
      if (request === '../inventoryStock.service') return inventoryStockService;
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[SERVICE_PATH];
    return { service: require(SERVICE_PATH), counters };
  } finally {
    Module._load = originalLoad;
  }
}

const BASE_QUERY = Object.freeze({ dateFrom: '2020-01-02', dateTo: '2020-01-10', page: '1', limit: '50' });

test('stock card reuses one request-scoped inventory context and preserves the golden response', async () => {
  const { service, counters } = createFixture();
  const result = await service.stockCardReport(BASE_QUERY);
  const json = JSON.stringify(result);

  assert.deepEqual(counters.aggregateRanges, [
    { from: '0000-01-01', to: '2020-01-10' },
    { from: '2020-01-10', to: require('../src/utils/date.util').todayVN() }
  ]);
  assert.equal(counters.aggregateCalls, 2, 'ledger must be read once until dateTo plus one future backcast range');
  assert.equal(counters.productFindCalls, 1, 'product catalog must be loaded once per request');
  assert.equal(counters.inventorySummaryCalls, 1, 'canonical inventories summary must remain one read');
  assert.equal(result.transactions.length, 4);
  assert.deepEqual(result.summary, {
    productCount: 2,
    transactionCount: 4,
    openingQty: 150,
    inQty: 25,
    outQty: 40,
    endingQty: 135,
    reconciliationMismatchCount: 0
  });
  assert.equal(Buffer.byteLength(json), 2614);
  assert.equal(crypto.createHash('sha256').update(json).digest('hex'), '883cb31db18e25316230563f4a77a2f110994ae43ebaba30b033ed3a88d4b634');
});

test('stock card returns a stable empty response without N+1 reads', async () => {
  const { service, counters } = createFixture({ products: [], transactions: [], futureTransactions: [], currentStock: [] });
  const result = await service.stockCardReport(BASE_QUERY);

  assert.deepEqual(result.transactions, []);
  assert.deepEqual(result.items, []);
  assert.equal(result.meta.total, 0);
  assert.equal(result.summary.transactionCount, 0);
  assert.equal(counters.aggregateCalls, 2);
  assert.equal(counters.productFindCalls, 1);
  assert.equal(counters.inventorySummaryCalls, 1);
});

test('stock card large dataset keeps fixed query count and applies search/pagination correctly', async () => {
  const productCount = 100;
  const transactionsPerProduct = 100;
  const products = [];
  const currentStock = [];
  const transactions = [];
  for (let p = 0; p < productCount; p += 1) {
    const code = `SP${String(p).padStart(3, '0')}`;
    products.push({ _id: `p${p}`, id: `p${p}`, code, productCode: code, name: `Sản phẩm ${p}`, baseUnit: 'cái' });
    currentStock.push({ productId: `p${p}`, productCode: code, productName: `Sản phẩm ${p}`, unit: 'cái', onHand: transactionsPerProduct, reservedQty: 0, availableQty: transactionsPerProduct });
    for (let n = 0; n < transactionsPerProduct; n += 1) {
      transactions.push({
        _id: `${code}-${n}`,
        id: `${code}-${n}`,
        date: '2020-01-05',
        createdAt: `2020-01-05T08:${String(n % 60).padStart(2, '0')}:00.000Z`,
        productCode: code,
        productName: `Sản phẩm ${p}`,
        type: 'IMPORT',
        direction: 'IN',
        quantity: 1,
        refCode: `IMP-${n}`
      });
    }
  }
  const { service, counters } = createFixture({ products, transactions, futureTransactions: [], currentStock });
  const result = await service.stockCardReport({ ...BASE_QUERY, q: 'SP050', page: '2', limit: '50' });

  assert.equal(result.meta.total, 100);
  assert.equal(result.meta.page, 2);
  assert.equal(result.meta.limit, 50);
  assert.equal(result.transactions.length, 50);
  assert.ok(result.transactions.every((row) => row.productCode === 'SP050'));
  assert.equal(counters.aggregateCalls, 2, 'query count must not grow with 10,000 transactions');
  assert.equal(counters.productFindCalls, 1, 'no product N+1 query');
  assert.equal(counters.inventorySummaryCalls, 1);
});

test('concurrent stock-card requests do not share global cache or multiply reads inside one request', async () => {
  const { service, counters } = createFixture({ delayMs: 5 });
  const responses = await Promise.all(Array.from({ length: 4 }, () => service.stockCardReport(BASE_QUERY)));

  assert.equal(counters.aggregateCalls, 8);
  assert.equal(counters.productFindCalls, 4);
  assert.equal(counters.inventorySummaryCalls, 4);
  assert.ok(responses.every((result) => JSON.stringify(result) === JSON.stringify(responses[0])));
});
