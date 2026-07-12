'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const inventoryStockPath = path.join(ROOT, 'src/services/inventoryStock.service.js');
const inventoryServicePart = fs.readFileSync(path.join(ROOT, 'src/services/inventoryService.source/part-02.jsfrag'), 'utf8');

const fixtureRows = [
  { productCode: 'P001', warehouseCode: 'MAIN', onHand: 100, availableQty: 100 },
  { productCode: 'P001', warehouseCode: 'HC', onHand: 50, availableQty: 50 },
  { productCode: 'P001', warehouseCode: 'PC', onHand: 20, availableQty: 20 },
  { productCode: 'P001', onHand: 10, availableQty: 10 }
];
const productRows = [{ id: 'P001', code: 'P001', name: 'Product P001', conversionRate: 1 }];

function matchesValue(value, condition) {
  if (condition && typeof condition === 'object' && '$in' in condition) return condition.$in.map(String).includes(String(value));
  return String(value) === String(condition);
}

function matchesFilter(row, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some((part) => matchesFilter(row, part));
    if (key === '$and') return condition.every((part) => matchesFilter(row, part));
    return matchesValue(row[key], condition);
  });
}

function queryOf(rows) {
  const query = {
    select() { return query; },
    sort() { return query; },
    session() { return query; },
    lean() { return Promise.resolve(rows); }
  };
  return query;
}

async function loadInventoryStockService(capturedFilters = []) {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../models/InventoryLegacy') {
      return {
        find(filter = {}) {
          capturedFilters.push(filter);
          return queryOf(fixtureRows.filter((row) => matchesFilter(row, filter)));
        }
      };
    }
    if (request === '../models/Product') return { find() { return queryOf(productRows); } };
    if (request === '../utils/date.util') return { nowIso: () => '2026-07-12T00:00:00.000Z' };
    if (request === '../utils/common.util') return { toNumber: (value) => Number(value || 0) || 0 };
    if (request === '../constants/business.constants') return { STOCK_WAREHOUSE_CODE: 'MAIN', STOCK_WAREHOUSE_NAME: 'Kho chính' };
    if (request === '../domain/inventory/mainInventoryReadPolicy') {
      return {
        mainWarehouseCode: () => 'MAIN',
        mainInventoryFilter: (filter = {}) => ({ ...filter, warehouseCode: 'MAIN' })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(inventoryStockPath)];
    return require(inventoryStockPath);
  } finally {
    Module._load = originalLoad;
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const signatureEnd = source.indexOf(') {', start);
  const open = source.indexOf('{', signatureEnd);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Cannot extract ${name}`);
}

test('canonical availability and summary count only MAIN=100 from a 100/50/20/10 fixture', async () => {
  const captured = [];
  const service = await loadInventoryStockService(captured);
  const available = await service.getAvailableStocks(['P001']);
  const summary = await service.getInventorySummary({}, { forceRefresh: true });

  assert.equal(available.P001, 100);
  assert.equal(summary.stock.length, 1);
  assert.equal(summary.stock[0].onHand, 100);
  assert.equal(summary.stock[0].availableQty, 100);
  assert.equal(summary.stock[0].warehouseCode, 'MAIN');
  assert.ok(captured.length >= 2);
  captured.forEach((filter) => assert.equal(filter.warehouseCode, 'MAIN'));
});

test('sales-order stock validation uses the same MAIN-only availability result', async () => {
  const service = await loadInventoryStockService([]);
  const enough = await service.checkAvailableForItems([{ productCode: 'P001', quantity: 100 }]);
  const shortage = await service.checkAvailableForItems([{ productCode: 'P001', quantity: 101 }]);
  assert.equal(enough.enough, true);
  assert.equal(shortage.enough, false);
  assert.equal(shortage.shortages[0].availableQty, 100);
  assert.equal(shortage.shortages[0].shortageQty, 1);
});

test('legacy getCurrentStock operational read applies MAIN predicate and does not merge HC/PC/missing rows', async () => {
  let capturedFilter = null;
  const sandbox = {
    mainInventoryFilter: (filter = {}) => ({ ...filter, warehouseCode: 'MAIN' }),
    InventoryLegacy: {
      find(filter) {
        capturedFilter = filter;
        return queryOf(fixtureRows.filter((row) => matchesFilter(row, filter)));
      }
    },
    toNumber: (value) => Number(value || 0) || 0,
    stockWarehouseCode: () => 'MAIN',
    stockWarehouseName: () => 'Kho chính',
    Map,
    Array,
    String
  };
  vm.runInNewContext(`${extractFunction(inventoryServicePart, 'getCurrentStock')}\nresult = getCurrentStock({ productCode: 'P001' });`, sandbox);
  const result = await sandbox.result;
  assert.equal(capturedFilter.warehouseCode, 'MAIN');
  assert.equal(result.length, 1);
  assert.equal(result[0].onHand, 100);
});

test('reconciliation and reporting projection inventory pipelines start with exact MAIN match', () => {
  const reconciliation = fs.readFileSync(path.join(ROOT, 'src/domain/reconciliation/ReconciliationService.js'), 'utf8');
  const projection = fs.readFileSync(path.join(ROOT, 'src/services/analytics/ProjectionService.js'), 'utf8');
  assert.match(reconciliation, /InventoryLegacy\.aggregate\(\[\s*\{ \$match: mainInventoryFilter\(\) \}/);
  assert.match(projection, /Inventory\.aggregate\(\[\s*\{ \$match: mainInventoryFilter\(tenantMatch\(tenantId\)\) \}/);
  assert.doesNotMatch(projection, /\$ifNull: \['\$warehouseCode', 'MAIN'\]/);
});

test('active product, mobile and inventory report paths share inventoryStockService', () => {
  const product = fs.readFileSync(path.join(ROOT, 'src/services/productService.js'), 'utf8');
  const mobile = fs.readFileSync(path.join(ROOT, 'src/services/mobile/catalog.service.js'), 'utf8');
  const report = fs.readFileSync(path.join(ROOT, 'src/services/reports/InventoryReportService.js'), 'utf8');
  assert.match(product, /inventoryStockService\.getAvailableStocks\(codes\)/);
  assert.match(mobile, /inventoryStockService\.getAvailableStocks\(codes\)/);
  assert.match(report, /inventoryStockService\.getInventorySummary\(/);
});

test('MAIN policy never treats blank or legacy warehouse as MAIN', () => {
  const policy = require('../src/domain/inventory/mainInventoryReadPolicy');
  assert.deepEqual(policy.mainInventoryFilter({ productCode: 'P001' }), { productCode: 'P001', warehouseCode: 'MAIN' });
  assert.equal(policy.isMainWarehouseRow({ warehouseCode: 'MAIN' }), true);
  assert.equal(policy.isMainWarehouseRow({ warehouseCode: '' }), false);
  assert.equal(policy.isMainWarehouseRow({}), false);
  assert.equal(policy.isMainWarehouseRow({ warehouseCode: 'HC' }), false);
});
