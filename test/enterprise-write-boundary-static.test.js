'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('new purchase and warehouse writes use canonical posting services', () => {
  const root = path.resolve(__dirname, '..');
  const purchase = fs.readFileSync(path.join(root, 'src/services/purchase/PurchaseService.js'), 'utf8');
  const warehouse = fs.readFileSync(path.join(root, 'src/services/warehouse/WarehouseService.js'), 'utf8');
  assert.match(purchase, /InventoryPostingService\.postPurchaseIn/);
  assert.match(purchase, /FundPostingService\.postCashOut/);
  assert.match(warehouse, /InventoryPostingService\.postAdjustment/);
  assert.doesNotMatch(purchase, /StockTransaction\.(create|update|findOneAndUpdate)/);
  assert.doesNotMatch(warehouse, /StockTransaction\.(create|update|findOneAndUpdate)/);
});
