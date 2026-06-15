'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/excelImportService.js'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'src/services/import/importTransaction.service.js'), 'utf8');

test('sales import transaction helper never swallows a successful/failed chunk boundary', () => {
  assert.match(helper, /withMongoTransaction\(\(session\)\s*=>\s*handler\(chunk/);
  assert.match(helper, /ok:\s*false/);
  assert.match(helper, /IMPORT_CHUNK_FAILED/);
});

test('sales import inserts, posts stock and marks posted in one shared session', () => {
  assert.match(source, /SalesOrder\.insertMany\([\s\S]*?chunk\.map\(\(row\) => canonicalizeOperationalStaff\(row\)\),[\s\S]*?session,[\s\S]*?ordered:\s*true/);
  assert.match(source, /InventoryPostingService\.postSalesOrdersBulkOut\([\s\S]*?insertedOrders,[\s\S]*?\{\s*session\s*\}/);
  assert.match(source, /SalesOrder\.updateMany\([\s\S]*?stockPosted:\s*true[\s\S]*?\{\s*session\s*\}/);
});

test('failed sales chunks are reported and not counted as imported', () => {
  assert.match(source, /if \(result\.ok\)[\s\S]*?imported \+=/);
  assert.match(source, /skipped \+= result\.count/);
  assert.match(source, /failed:\s*orderDocs\.length - imported/);
});
