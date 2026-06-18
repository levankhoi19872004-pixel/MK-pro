'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  PICKING_ZONES,
  normalizePickingZone,
  pickingZoneFrom,
  legacyPrintGroupCode
} = require('../src/utils/pickingZone.util');
const { buildMasterPicking } = require('../src/domain/print/builders/MasterPickingBuilder');
const { renderPrintHtml } = require('../services/printService');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

function buildDocument() {
  const master = {
    id: 'MO-ABC',
    code: 'MO-ABC',
    deliveryDate: '2026-06-17',
    childOrderIds: ['SO-ABC']
  };
  const child = {
    id: 'SO-ABC',
    code: 'SO-ABC',
    masterOrderCode: 'MO-ABC',
    items: [
      { productCode: 'PC-2', productName: 'Zeta PC', quantity: 2, conversionRateAtOrder: 1, pickingZoneAtOrder: 'PC', catalogSalePriceAtOrder: 20 },
      { productCode: 'HC-2', productName: 'Beta HC', quantity: 2, conversionRateAtOrder: 1, pickingZoneAtOrder: 'HC', catalogSalePriceAtOrder: 20 },
      { productCode: 'PC-1', productName: 'Alpha PC', quantity: 1, conversionRateAtOrder: 1, pickingZoneAtOrder: 'PC', catalogSalePriceAtOrder: 10 },
      { productCode: 'HC-1', productName: 'Alpha HC', quantity: 1, conversionRateAtOrder: 1, pickingZoneAtOrder: 'HC', catalogSalePriceAtOrder: 10 }
    ]
  };

  return buildMasterPicking([master], [child], {
    childMasterMap: new Map([['SO-ABC', 'MO-ABC']]),
    productMap: new Map()
  });
}

test('legacy warehouse labels are normalized to picking zones only', () => {
  assert.equal(normalizePickingZone('KHO HC'), PICKING_ZONES.HC);
  assert.equal(normalizePickingZone('KHO_PC'), PICKING_ZONES.PC);
  assert.equal(pickingZoneFrom({ defaultWarehouse: 'KHO PC' }), PICKING_ZONES.PC);
  assert.equal(pickingZoneFrom({ warehouseCode: 'MAIN' }, { pickingZone: 'PC' }), PICKING_ZONES.PC);
  assert.equal(pickingZoneFrom({ warehouseCode: 'MAIN' }), PICKING_ZONES.UNASSIGNED);
  assert.equal(legacyPrintGroupCode(PICKING_ZONES.HC), 'KHO_HC');
  assert.equal(legacyPrintGroupCode(PICKING_ZONES.PC), 'KHO_PC');
});

test('master order groups HC before PC and sorts product names A to Z inside each group', () => {
  const document = buildDocument();

  assert.deepEqual(
    document.items.map((item) => `${item.pickingZone}:${item.productName}`),
    ['HC:Alpha HC', 'HC:Beta HC', 'PC:Alpha PC', 'PC:Zeta PC']
  );
  assert.equal(document.itemSort, 'PRODUCT_NAME_ASC');
  assert.equal(document.printContract.metadata.pickingZonePolicy, 'HC_PC_PRINT_ONLY_INVENTORY_MAIN');
});

test('master picking renders exactly one HC page and one PC page in A-Z order', () => {
  const html = renderPrintHtml('WAREHOUSE_PICKING', buildDocument());

  assert.equal((html.match(/warehouse-picking-page/g) || []).length, 2);
  assert.match(html, /PHIẾU BỐC HÀNG ĐƠN TỔNG - HC/);
  assert.match(html, /PHIẾU BỐC HÀNG ĐƠN TỔNG - PC/);

  const hcPageStart = html.indexOf('PHIẾU BỐC HÀNG ĐƠN TỔNG - HC');
  const pcPageStart = html.indexOf('PHIẾU BỐC HÀNG ĐƠN TỔNG - PC');
  assert.ok(hcPageStart >= 0 && pcPageStart > hcPageStart, 'HC must be printed before PC');

  const hcPage = html.slice(hcPageStart, pcPageStart);
  const pcPage = html.slice(pcPageStart);
  assert.ok(hcPage.indexOf('Alpha HC') < hcPage.indexOf('Beta HC'), 'HC products must be A-Z');
  assert.ok(pcPage.indexOf('Alpha PC') < pcPage.indexOf('Zeta PC'), 'PC products must be A-Z');
});

test('picking zone is isolated from physical inventory warehouse MAIN', () => {
  const constants = read('src/constants/business.constants.js');
  const inventoryService = read('src/services/inventoryService.js');
  const inventoryStockService = read('src/services/inventoryStock.service.js');
  const productModel = read('src/models/Product.js');

  assert.match(constants, /STOCK_WAREHOUSE_CODE\s*=\s*['"]MAIN['"]/);
  assert.match(inventoryService, /function stockWarehouseCode\(\)\s*\{\s*return STOCK_WAREHOUSE_CODE \|\| ['"]MAIN['"]/);
  assert.match(inventoryStockService, /function stockWarehouseCode\(\)\s*\{[\s\S]*STOCK_WAREHOUSE_CODE \|\| ['"]MAIN['"]/);
  assert.doesNotMatch(inventoryService, /stockWarehouseCode\s*\([^)]*pickingZone/);
  assert.doesNotMatch(inventoryService, /warehouseCode\s*:\s*[^,\n]*pickingZone/);
  assert.doesNotMatch(inventoryStockService, /warehouseCode\s*:\s*[^,\n]*pickingZone/);
  assert.match(productModel, /Khu bốc hàng chỉ dùng để phân chia phiếu in đơn tổng HC\/PC/);
});


test('new import documents pin the physical warehouse to MAIN while item picking zones remain print metadata', () => {
  const importService = read('src/services/importOrderService.js');
  const excelImportService = read('src/services/excelImportService.js');

  assert.match(importService, /warehouseCode:\s*STOCK_WAREHOUSE_CODE/);
  assert.match(importService, /pickingZone:\s*normalizePickingZone/);
  assert.match(excelImportService, /warehouseCode:\s*STOCK_WAREHOUSE_CODE/);
  assert.match(excelImportService, /pickingZoneAtOrder/);
});

test('product UI and write service use pickingZone instead of writing a default inventory warehouse', () => {
  const html = read('public/index.html');
  const productUi = read('public/js/app/02-products.js');
  const productService = read('src/services/productService.js');
  const productModel = read('src/models/Product.js');

  assert.match(html, /name="pickingZone"/);
  assert.match(html, /không ảnh hưởng tồn kho MAIN/);
  assert.doesNotMatch(html, /name="warehouseCode"/);
  assert.match(productUi, /payload\.pickingZone/);
  assert.doesNotMatch(productUi, /payload\.warehouseCode\s*=/);
  assert.match(productService, /pickingZone:\s*normalizePickingZone/);
  assert.match(productModel, /pickingZone:\s*\{/);
});

test('picking-zone migration is dry-run by default and requires explicit --write', () => {
  const migration = read('scripts/migrate-product-picking-zone.js');
  const pkg = JSON.parse(read('package.json'));

  assert.match(migration, /process\.argv\.includes\('--write'\)/);
  assert.equal(pkg.scripts['migrate:picking-zone:dry'], 'node scripts/migrate-product-picking-zone.js');
  assert.equal(pkg.scripts['migrate:picking-zone'], 'node scripts/migrate-product-picking-zone.js --write');
});
