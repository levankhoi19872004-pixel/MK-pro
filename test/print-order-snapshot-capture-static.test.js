'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

const REQUIRED_SNAPSHOT_FIELDS = [
  'catalogSalePriceAtOrder',
  'conversionRateAtOrder',
  'pickingZoneAtOrder',
  'warehouseCodeAtOrder',
  'productSnapshot'
];

test('web sales order capture keeps print-critical product snapshot fields', () => {
  const source = read('src/services/orderLegacy.service.js');
  for (const field of REQUIRED_SNAPSHOT_FIELDS) assert.match(source, new RegExp(field));
  assert.match(source, /appliedPromotionRows/);
  assert.match(source, /finalPrice/);
});

test('mobile sales order capture keeps print-critical product snapshot fields', () => {
  const context = read('src/mobile/mobileContext.js');
  const modular = read('src/services/mobile/sales.service.js');
  const legacy = read('src/services/mobileService.js');

  for (const field of REQUIRED_SNAPSHOT_FIELDS) assert.match(context, new RegExp(field));
  assert.match(modular, /appliedPromotionRows:\s*promotionRows/);
  assert.match(legacy, /catalogSalePriceAtOrder:\s*salePrice/);
  assert.match(legacy, /finalPrice:\s*salePrice/);
});

test('Excel DMS import captures historical price, pack and picking-zone snapshots', () => {
  const source = read('src/services/excelImportService.js');
  for (const field of REQUIRED_SNAPSHOT_FIELDS) assert.match(source, new RegExp(field));
  assert.match(source, /const conversionRateAtOrder = getPackingFromRow\(row, product\)/);
  assert.match(source, /const productCatalogSalePrice = toNumber/);
  assert.match(source, /const catalogSalePriceAtOrder = productCatalogSalePrice > 0/);
  assert.match(source, /catalogSalePriceSource/);
  assert.match(source, /preTaxPriceAtOrder:\s*listPriceBeforeVat/);
  assert.match(source, /vatAmountAtOrder/);
  assert.match(source, /finalPriceAtOrder:\s*salePrice/);
  assert.match(source, /lineAmountAtOrder:\s*lineAmount/);
});
