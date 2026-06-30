'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('report runtime uses arDebtRuntimeView for sales/dashboard debt fields', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/reportLegacy.service.source/part-03.jsfrag'), 'utf8');
  assert.match(source, /arDebtRuntimeView\.getCustomerDebtMap/);
  assert.match(source, /arDebtRuntimeView\.getDebtSummary/);
  assert.match(source, /debtSource:\s*arDebtRuntimeView\.DEBT_SOURCE/);
});
