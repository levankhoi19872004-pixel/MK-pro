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
  const source = read('src/services/orderService.js');
  const applyBlock = functionBlock(source, 'applySalesOrderPosting');
  assert.match(applyBlock, /inventoryService\.postStockMovement\s*\(/, 'sales order posting must post stock');
  assert.doesNotMatch(applyBlock, /postingEngine\.postSalesOrderAR\s*\(/, 'sales order stock posting must not post AR');
});

test('DMS sales order import marks orders as stockPosted because inventory is cut in bulk', () => {
  const source = read('src/services/excelImportService.js');
  assert.match(source, /stockPosted:\s*true/, 'imported sales orders must be marked stockPosted');
  assert.match(source, /stockPostedBy:\s*options\.userName\s*\|\|\s*options\.username\s*\|\|\s*options\.createdBy\s*\|\|\s*'excel_import'/, 'imported sales orders must store stockPostedBy');
  assert.match(source, /applyInventoryMovementsBulk\(movements, inventoryDeltas\)/, 'DMS import must cut stock through bulk inventory posting');
});
