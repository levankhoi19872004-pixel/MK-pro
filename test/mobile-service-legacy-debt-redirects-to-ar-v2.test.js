'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('mobileService legacy customer/order debt is sourced from arDebtRuntimeView', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/mobileService.js'), 'utf8');
  assert.match(source, /arDebtRuntimeView\.service/);
  assert.match(source, /arDebtRuntimeView\.getCustomerDebtMap/);
  assert.doesNotMatch(source, /totalAmount\s*-\s*paidAmount/);
  assert.doesNotMatch(source, /debtAmount:\s*toNumber\(order\.debtAmount\)/);
});
