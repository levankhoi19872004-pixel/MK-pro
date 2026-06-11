'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('excel parser reads Import sheet when possible and falls back to first sheet without readSheetNames', () => {
  const source = read('utils/excelParser.worker.js');

  assert.match(source, /readPreferredSheetMatrix/);
  assert.match(source, /sheet:\s*'Import'/);
  assert.match(source, /readXlsxFile\(buffer, \{ dateFormat: 'dd\/mm\/yyyy' \}\)/);
  assert.match(source, /rowsToObjects\(matrix\)/);

  assert.doesNotMatch(source, /readSheetNames/);
  assert.doesNotMatch(source, /selectedSheet\s*&&\s*selectedSheet\.data/);
  assert.doesNotMatch(source, /item\s*&&\s*item\.sheet/);
});
