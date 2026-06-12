'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('import stock posting uses bulk insert and bulk inventory update', () => {
  const inventoryService = read('src/services/inventoryService.js');
  assert.match(inventoryService, /async function postStockMovementBulkImportIn\(/);
  assert.match(inventoryService, /StockTransaction\.insertMany\(insertDocs/);
  assert.match(inventoryService, /InventoryLegacy\.bulkWrite\(inventoryOps/);
});

test('import order post patches status instead of rewriting the whole import document', () => {
  const importOrderService = read('src/services/importOrderService.js');
  assert.match(importOrderService, /InventoryPostingService\.postImportIn\(postedForStock/);
  assert.match(importOrderService, /importOrderRepository\.patchByIdentity\(/);
  assert.doesNotMatch(importOrderService, /await\s+importOrderRepository\.upsert\(posted,\s*\{\s*session\s*\}\)/);
});

test('InventoryPostingService routes IMPORT IN through the bulk posting boundary', () => {
  const postingService = read('src/domain/posting/InventoryPostingService.js');
  assert.match(postingService, /postStockMovementBulkImportIn/);
  assert.match(postingService, /disableBulkImportPosting/);
});
