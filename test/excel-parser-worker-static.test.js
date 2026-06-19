'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

test('excel parser uses readSheet when available and is compatible with workbook-shaped default export', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /readXlsxFileModule\.readSheet/);
  assert.match(source, /function normalizeWorkbookResultToMatrix/);
  assert.match(source, /Array\.isArray\(item\.data\)/);
  assert.match(source, /sheetObjectData/);

  assert.doesNotMatch(source, /readSheetNames/);
  assert.doesNotMatch(source, /selectedSheet\s*&&\s*selectedSheet\.data/);
  assert.doesNotMatch(source, /item\s*&&\s*item\.sheet/);
});

test('excel parser tries Import sheet, default sheet, and indexed sheets', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /async function parseExcelBuffer/);
  assert.match(source, /sheet:\s*'Import'/);
  assert.match(source, /Array\.from\(\{ length: MAX_SHEETS \}/);
  assert.match(source, /readSheetRows\(buffer, options\)/);
});

test('excel parser detects header row instead of assuming first row is header', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /function findHeaderRowIndex/);
  assert.match(source, /headerScore/);
  assert.match(source, /__headerRowNo/);
  assert.match(source, /headerIndex \+ 1/);
});
