'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('product inventory normalization rewrites single MAIN rows and retries atomic OUT', () => {
  const source = read('src/services/inventoryService.js');

  assert.match(source, /numericCodeVariant/);
  assert.match(source, /snapshotQuantityOf/);
  assert.match(source, /isSingleMainRow/);
  assert.match(source, /InventoryLegacy\.updateOne\(filter, \{ \$set: patch \}/);
  assert.match(source, /await normalizeProductInventoryToMain\(\{ productCode, productId, session \}\);\n\s*updated = await InventoryLegacy\.findOneAndUpdate/);

  assert.doesNotMatch(source, /if \(!hasLegacyWarehouse && rows\.length === 1\) return rows\[0\]/);
});

test('inventory stock summary infers packing rate from product text and stock tab displays availableQty', () => {
  const stockService = read('src/services/inventoryStock.service.js');
  const ui = read('public/js/app/05-sales-orders.js');
  const commonUi = read('public/js/app/01-utils-print-tabs.js');

  assert.match(stockService, /inferPackingRateFromText/);
  assert.match(stockService, /packingRateOf\(product, row\)/);
  assert.match(stockService, /product\.name/);
  assert.match(stockService, /row\.productName/);

  assert.match(commonUi, /inferPackingRateFromTextClient/);
  assert.match(ui, /displayQtyTL\(r\.availableQty \?\? r\.quantity,r\)/);
});
