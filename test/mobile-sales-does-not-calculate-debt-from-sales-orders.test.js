'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const files = [
  'src/services/mobile/sales.service.source/part-02.jsfrag',
  'src/services/mobile/sales.service.source/part-03.jsfrag',
  'src/services/mobile/sales.service.js'
];

test('mobile sales runtime does not derive debt from salesOrders total/paid fields', () => {
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /totalAmount\s*-\s*paidAmount/, file);
    assert.doesNotMatch(source, /debtAmount\s*:\s*[^\n;]*totalAmount[^\n;]*paidAmount/, file);
    assert.doesNotMatch(source, /\$subtract\s*:\s*\[\s*totalExpr\s*,\s*paidExpr\s*\]/, file);
    assert.doesNotMatch(source, /order\.debtAmount\s*\?\?\s*\(/, file);
  }
});
