'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function functionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf('\nasync function ', start + 1);
  const nextPlain = source.indexOf('\nfunction ', start + 1);
  const candidates = [next, nextPlain].filter((idx) => idx !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test('sales order inventory posting is separated from AR posting', () => {
  const source = read('src/services/orderLegacy.service.js');
  const applyBlock = functionBlock(source, 'applySalesOrderPosting');
  assert.match(applyBlock, /InventoryPostingService\.postSaleOut\s*\(order, options\)/, 'sales order posting must post stock through InventoryPostingService');
  assert.doesNotMatch(applyBlock, /postingEngine\.postSalesOrderAR\s*\(/, 'sales order stock posting must not post AR');
});

test('DMS sales order import posts order and inventory in atomic chunks', () => {
  const source = read('src/services/excelImportService.js');
  const block = functionBlock(source, 'importSalesOrders');
  assert.match(block, /runAtomicChunks\s*\(/, 'DMS import must use atomic chunks');
  assert.match(block, /SalesOrder\.insertMany\([\s\S]*?chunk\.map\(\(row\) => canonicalizeOperationalStaff\(row\)\),\s*\{[\s\S]*session,[\s\S]*ordered:\s*true/, 'order insert must use the chunk session');
  assert.match(block, /InventoryPostingService\.postSaleOut\(order,\s*\{\s*session\s*\}\)/, 'stock must post through InventoryPostingService in the same session');
  assert.match(block, /stockPosted:\s*false/, 'orders must start unposted inside the transaction');
  assert.match(block, /stockPosted:\s*true/, 'orders must be marked posted only after inventory succeeds');
  assert.doesNotMatch(block, /applyInventoryMovementsBulk\(movements, inventoryDeltas\)/, 'sales import must not use the non-atomic bulk inventory path');
});
