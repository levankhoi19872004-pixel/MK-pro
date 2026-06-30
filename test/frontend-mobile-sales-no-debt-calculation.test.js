'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('mobile sales sync frontend does not calculate accounting debt', () => {
  const source = fs.readFileSync(path.join(ROOT, 'public/mobile/js/sales/sync.js'), 'utf8');
  assert.doesNotMatch(source, /totalAmount\s*-\s*paidAmount/);
  assert.doesNotMatch(source, /Math\.max\(0,[^)]*paidAmount/);
  assert.match(source, /currentDebtAmount/);
  assert.match(source, /Chưa có dữ liệu công nợ/);
});
