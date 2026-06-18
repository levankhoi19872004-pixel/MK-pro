'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

test('excel import supports carton/unit quantity columns as primary quantity source', () => {
  const source = read('src/services/excelImportService.js');

  assert.match(source, /function hasCartonUnitQuantityColumns/);
  assert.match(source, /function getCartonUnitQuantityFromRow/);
  assert.match(source, /function getQtyFromRow\(row = \{\}, product = null\)/);
  assert.match(source, /if \(hasCartonUnitQuantityColumns\(row\)\)/);
  assert.match(source, /return getCartonUnitQuantityFromRow\(row, product\)/);
});

test('opening stock and import order quantity parsing receives product conversion rate', () => {
  const source = read('src/services/excelImportService.js');

  const matches = source.match(/getQtyFromRow\(row, product\)/g) || [];
  assert.ok(matches.length >= 4, 'getQtyFromRow(row, product) must be used in commit and preview flows');
});

test('dms quantity parsing also prioritizes carton unit columns', () => {
  const source = read('src/services/excelImportService.js');

  assert.match(source, /function getDmsQuantityFromRow\(row = \{\}, product = null\)/);
  assert.match(source, /hasCartonUnitQuantityColumns\(row\)/);
  assert.match(source, /getCartonUnitQuantityFromRow\(row, product\)/);
});
