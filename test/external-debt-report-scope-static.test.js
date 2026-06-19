'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('debt report treats external debt as original debt row for both staff scopes', () => {
  const source = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');
  assert.match(source, /type:\s*\{ \$in: \['ar_sale', 'ar_external_debt'\] \}/);
  assert.match(source, /regex:\s*'sale\|external_debt'/);
  assert.match(source, /saleOrderType/);
});
