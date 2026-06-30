'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('strict AR read model uses exact category enum and no category includes heuristic', () => {
  const files = [
    'src/domain/ar/arLedgerValidator.js',
    'src/services/accounting/arCustomerDebtReadModel.service.js',
    'src/services/arDebtReadModel.service.js'
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /category\.includes\s*\(/);
  assert.doesNotMatch(source, /category\)\.includes\s*\(/);
  assert.doesNotMatch(source, /includes\s*\(\s*['"]AR-SALE/);
  assert.doesNotMatch(source, /includes\s*\(\s*['"]AR-RETURN/);
  assert.match(source, /AR-DEBT-OPEN/);
});
