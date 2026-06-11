'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('excel parser tries Import sheet, default sheet, and indexed sheets without readSheetNames', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /async function parseExcelBuffer/);
  assert.match(source, /sheet:\s*'Import'/);
  assert.match(source, /Array\.from\(\{ length: MAX_SHEETS \}/);
  assert.match(source, /readSheetRows\(buffer, options\)/);

  assert.doesNotMatch(source, /readSheetNames/);
  assert.doesNotMatch(source, /selectedSheet\s*&&\s*selectedSheet\.data/);
  assert.doesNotMatch(source, /item\s*&&\s*item\.sheet/);
});

test('excel parser detects header row instead of assuming first row is header', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /function findHeaderRowIndex/);
  assert.match(source, /headerScore/);
  assert.match(source, /__headerRowNo/);
  assert.match(source, /headerIndex \+ 1/);
});
