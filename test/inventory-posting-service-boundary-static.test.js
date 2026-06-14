'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function functionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const nextPlain = source.indexOf('\nfunction ', start + 1);
  const candidates = [nextAsync, nextPlain].filter((idx) => idx !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test('InventoryPostingService wraps single-document stock posting operations', () => {
  const source = read('src/domain/posting/InventoryPostingService.js');

  assert.match(source, /const inventoryService = require\('\.\.\/\.\.\/services\/inventoryService'\);/);
  assert.match(source, /async function postImportIn\(importOrder = \{\}, options = \{\}\)/);
  assert.match(source, /async function postSaleOut\(order = \{\}, options = \{\}\)/);
  assert.match(source, /async function postReturnIn\(returnOrder = \{\}, options = \{\}\)/);
  assert.match(source, /type:\s*'IMPORT'[\s\S]*direction:\s*'IN'[\s\S]*refType:\s*'IMPORT_ORDER'/);
  assert.match(source, /type:\s*'SALE'[\s\S]*direction:\s*'OUT'[\s\S]*refType:\s*'SALES_ORDER'/);
  assert.match(source, /INVENTORY_SESSION_REQUIRED/);
  assert.match(source, /options\.allowUnsafeNoSession\s*!==\s*true/);
  assert.match(source, /type:\s*'RETURN'[\s\S]*direction:\s*'IN'[\s\S]*refType:\s*'RETURN_ORDER'/);
  assert.match(source, /reverseMovement,/);
  assert.match(source, /reconcileInventory/);
});

test('orderService posts sales inventory through InventoryPostingService boundary', () => {
  const source = read('src/services/orderLegacy.service.js');
  const applyBlock = functionBlock(source, 'applySalesOrderPosting');

  assert.match(source, /const InventoryPostingService = require\('\.\.\/domain\/posting\/InventoryPostingService'\);/);
  assert.match(applyBlock, /InventoryPostingService\.postSaleOut\(order, options\)/);
  assert.doesNotMatch(applyBlock, /inventoryService\.postStockMovement\s*\(/);
  assert.doesNotMatch(applyBlock, /postingEngine\.postSalesOrderAR\s*\(/);
});

test('returnOrderService warehouse receive posts return stock through InventoryPostingService boundary', () => {
  const source = read('src/services/returnOrderLegacy.service.js');
  const receiveBlock = functionBlock(source, 'confirmReceiveReturnOrder');

  assert.match(source, /const InventoryPostingService = require\('\.\.\/domain\/posting\/InventoryPostingService'\);/);
  assert.match(receiveBlock, /InventoryPostingService\.postReturnIn\(received, \{ session \}\)/);
  assert.doesNotMatch(receiveBlock, /inventoryService\.postStockMovement\s*\(/);
});
