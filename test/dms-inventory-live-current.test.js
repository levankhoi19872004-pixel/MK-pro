'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dmsService = require('../src/services/dmsInventoryReconciliation.service');
const inventoryStockService = require('../src/services/inventoryStock.service');
const Product = require('../src/models/Product');

function read(relativePath) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', relativePath));
}

test('buildComparisonRows reads the current available quantity from inventories', async () => {
  const originalGetInventorySummary = inventoryStockService.getInventorySummary;
  const originalProductFind = Product.find;
  let receivedOptions = null;

  inventoryStockService.getInventorySummary = async (_query, options) => {
    receivedOptions = options;
    return {
      stock: [{
        productCode: '64330134',
        productName: 'SUNLIGHT NRC Thiên Nhiên',
        availableQty: 848,
        conversionRate: 15,
        updatedAt: '2026-06-18T08:03:54.000Z'
      }]
    };
  };

  Product.find = () => ({
    select() { return this; },
    async lean() {
      return [{
        id: 'P64330134',
        code: '64330134',
        name: 'SUNLIGHT NRC Thiên Nhiên',
        conversionRate: 15,
        isActive: true
      }];
    }
  });

  try {
    const rows = await dmsService.buildComparisonRows([{
      productCode: '64330134',
      productName: 'SUNLIGHT NRC Thiên Nhiên',
      dmsConversionRate: 15,
      dmsCaseLoose: '147/13',
      dmsBaseQty: 2218,
      formulaValid: true
    }], { forceInventoryRefresh: true });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].internalBaseQty, 848);
    assert.equal(rows[0].differenceQty, -1370);
    assert.equal(rows[0].comparisonType, 'dms_greater');
    assert.equal(rows[0].internalUpdatedAt, '2026-06-18T08:03:54.000Z');
    assert.equal(receivedOptions.forceRefresh, true);
  } finally {
    inventoryStockService.getInventorySummary = originalGetInventorySummary;
    Product.find = originalProductFind;
  }
});

test('DMS source rows are rebuilt without reusing committed internalBaseQty', () => {
  const dmsItems = dmsService.dmsItemsFromSnapshotRows([
    {
      productCode: '64330134',
      dmsProductName: 'SUNLIGHT NRC Thiên Nhiên',
      dmsConversionRate: 15,
      dmsCaseLoose: '147/13',
      dmsBaseQty: 2218,
      internalBaseQty: 98,
      sourcePresentInDms: true,
      formulaValid: true
    },
    {
      productCode: 'INTERNAL_ONLY',
      dmsBaseQty: 0,
      internalBaseQty: 20,
      sourcePresentInDms: false
    }
  ]);

  assert.deepEqual(dmsItems, [{
    productCode: '64330134',
    productName: 'SUNLIGHT NRC Thiên Nhiên',
    dmsConversionRate: 15,
    dmsCaseLoose: '147/13',
    dmsBaseQty: 2218,
    formulaValid: true,
    warning: ''
  }]);
  assert.equal(Object.hasOwn(dmsItems[0], 'internalBaseQty'), false);
});

test('filtering is applied after live comparison type is recalculated', () => {
  const rows = dmsService.filterAndSortComparisonRows([
    { productCode: 'B', productName: 'B', comparisonType: 'dms_greater', dmsExcessQty: 20, internalExcessQty: 0 },
    { productCode: 'A', productName: 'Ánh', comparisonType: 'dms_greater', dmsExcessQty: 50, internalExcessQty: 0 },
    { productCode: 'C', productName: 'C', comparisonType: 'matched', dmsExcessQty: 0, internalExcessQty: 0 }
  ], { type: 'dms_greater', search: 'anh' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].productCode, 'A');
});

test('latest API recomputes against inventories instead of returning stale committed stock', () => {
  const source = read('src/services/dmsInventoryReconciliation.service.js');
  const start = source.indexOf('async function getLatest');
  const end = source.indexOf('async function getHistory', start);
  const block = source.slice(start, end);

  const snapshotReadAt = block.indexOf('DmsInventorySnapshot.find({ importId })');
  const liveRecomputeAt = block.indexOf('buildComparisonRows(dmsItems, { forceInventoryRefresh: forceRefresh === true })');
  const liveSummaryAt = block.indexOf('const liveSummary = buildSummary(liveRows)');
  const filterAt = block.indexOf('filterAndSortComparisonRows(liveRows, { type, search })');

  assert.ok(snapshotReadAt >= 0);
  assert.ok(liveRecomputeAt > snapshotReadAt);
  assert.ok(liveSummaryAt > liveRecomputeAt);
  assert.ok(filterAt > liveSummaryAt);
  assert.match(block, /summary:\s*liveSummary/);
  assert.match(block, /inventorySource:\s*'inventories'/);
  assert.match(block, /comparisonMode:\s*'live_inventory_vs_dms_snapshot'/);
  assert.match(block, /forceInventoryRefresh:\s*forceRefresh === true/);
});

test('admin UI labels current inventory source and busts the old frontend cache', () => {
  const indexHtml = read('public/index.html');
  const adminJs = read('public/js/app/10-dms-inventory.js');
  const css = read('public/css/80-dms-inventory.css');

  assert.match(indexHtml, /Tồn thực tế hiện tại/);
  assert.match(indexHtml, /10-dms-inventory\.js\?v=phase71-dms-live-inventory-v1/);
  assert.match(adminJs, /Tồn thực tế đọc trực tiếp từ inventories/);
  assert.match(adminJs, /internalUpdatedAt/);
  assert.match(adminJs, /params\.set\('refresh','1'\)/);
  assert.match(css, /\.dms-inventory-table td small\{display:block/);
});
