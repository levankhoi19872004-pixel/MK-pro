'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('report runtime no longer computes debt as sales total minus paid amount', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/reportLegacy.service.js'), 'utf8');
  assert.doesNotMatch(source, /totalAmount\s*-\s*paidAmount/);
  assert.doesNotMatch(source, /Math\.max\(0,[^)]*totalAmount[^)]*paidAmount/);
  assert.doesNotMatch(source, /\$subtract\s*:\s*\[\s*[^\]]*paidExpr/);
});
