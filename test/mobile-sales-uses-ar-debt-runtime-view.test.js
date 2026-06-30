'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('mobile sales service imports AR debt runtime view for customer debt', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/mobile/sales.service.source/part-01.jsfrag'), 'utf8');
  assert.match(source, /arDebtRuntimeView\.service/);
  const listSource = fs.readFileSync(path.join(ROOT, 'src/services/mobile/sales.service.source/part-03.jsfrag'), 'utf8');
  assert.match(listSource, /arDebtRuntimeView\.getCustomerDebtMap/);
  assert.match(listSource, /debtSource:\s*runtimeDebt\.debtSource/);
});
