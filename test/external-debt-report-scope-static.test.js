'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('debt report treats external debt as original debt row for both staff scopes', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/reportService.js'), 'utf8');
  assert.match(source, /type:\s*\{ \$in: \['ar_sale', 'ar_external_debt'\] \}/);
  assert.match(source, /regex:\s*'sale\|external_debt'/);
  assert.match(source, /saleOrderType/);
});
