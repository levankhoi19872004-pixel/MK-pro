'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('excel parser uses readSheetNames and reads selected sheet matrix directly', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /readSheetNames/);
  assert.match(source, /sheet:\s*selectedSheet/);
  assert.match(source, /rowsToObjects\(matrix\)/);

  assert.doesNotMatch(source, /selectedSheet\s*&&\s*selectedSheet\.data/);
  assert.doesNotMatch(source, /item\s*&&\s*item\.sheet/);
});
