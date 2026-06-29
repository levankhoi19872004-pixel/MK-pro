'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

const ROOT = path.resolve(__dirname, '..');
const inventoryPosting = readSource(path.join(ROOT, 'src/domain/posting/InventoryPostingService.js'));
const inventoryService = [
  'src/services/inventoryService.source/part-01.jsfrag',
  'src/services/inventoryService.source/part-02.jsfrag',
  'src/services/inventoryService.source/part-03.jsfrag'
].map((file) => readSource(path.join(ROOT, file))).join('\n');
const inventoryStockService = readSource(path.join(ROOT, 'src/services/inventoryStock.service.js'));
const returnOrderService = readSource(path.join(ROOT, 'src/services/returnOrderLegacy.service.source/part-02.jsfrag'));

function functionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const nextPlain = source.indexOf('\nfunction ', start + 1);
  const candidates = [nextAsync, nextPlain].filter((idx) => idx !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test('stock posting contract uses stable idempotency keys for sale out, cancellation reversal and return in', () => {
  assert.match(inventoryService, /function buildStockMovementIdempotencyKey\(/);
  assert.match(inventoryService, /sourceType[\s\S]*sourceId[\s\S]*productCode[\s\S]*warehouseCode[\s\S]*type/);
  assert.match(inventoryService, /findStockTransactionByIdempotencyKey/);
  assert.match(inventoryService, /DUPLICATE_STOCK_MOVEMENT/);

  assert.match(inventoryPosting, /type:\s*'SALE'[\s\S]*direction:\s*'OUT'[\s\S]*refType:\s*'SALES_ORDER'/);
  assert.match(inventoryPosting, /type:\s*'RETURN'[\s\S]*direction:\s*'IN'[\s\S]*refType:\s*'RETURN_ORDER'/);
  assert.match(inventoryService, /reverseType\s*\|\|\s*`\$\{movement\.type \|\| 'ADJUST'\}_REVERSAL`/);
});

test('runtime inventory MAIN normalization does not hard-delete current stock rows', () => {
  const normalizeSingleBlock = functionBlock(inventoryService, 'normalizeProductInventoryToMain');
  const normalizeBulkBlock = functionBlock(inventoryService, 'normalizeBulkSalesInventoryToMain');

  assert.doesNotMatch(normalizeSingleBlock, /InventoryLegacy\.deleteMany\s*\(/);
  assert.doesNotMatch(normalizeBulkBlock, /deleteMany\s*:/);
  assert.match(inventoryService, /function buildMergedInventoryPatch/);
  assert.match(inventoryService, /inventoryStatus:\s*'merged_to_main'/);
  assert.match(normalizeSingleBlock, /markMergedInventoryRowsToMain\(\{ \$or: filters \}/);
  assert.match(normalizeSingleBlock, /InventoryLegacy\.updateOne\([\s\S]*\{ upsert: true \}/);
  assert.match(normalizeBulkBlock, /updateMany:\s*\{[\s\S]*buildMergedInventoryPatch/);
});

test('stock posting remains session-protected and zero quantity returns do not create movements', () => {
  assert.match(inventoryPosting, /postSaleOut cần chạy trong Mongo session/);
  assert.match(inventoryPosting, /postSalesOrdersBulkOut cần chạy trong Mongo session/);
  assert.match(inventoryService, /if \(!rawQty\) continue/);
  assert.match(inventoryService, /if \(absQty <= 0\) continue/);
  assert.match(returnOrderService, /InventoryPostingService\.postReturnIn\(received, \{ session \}\)/);
});

test('runtime current stock reads from inventories projection and not inventorySnapshots', () => {
  assert.match(inventoryStockService, /InventoryCurrent = require\('\.\.\/models\/InventoryLegacy'\)/);
  assert.match(inventoryStockService, /inventorySource:\s*'inventories'/);
  assert.doesNotMatch(inventoryStockService, /inventorySnapshots|InventorySnapshot/);
  assert.doesNotMatch(inventoryService, /inventorySnapshots|InventorySnapshot/);
});
