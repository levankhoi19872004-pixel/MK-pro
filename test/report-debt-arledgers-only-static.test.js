'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('debt report delegates to AR debt read model v2 and does not remap from Customer/User', () => {
  const src = read('src/services/reportLegacy.service.js');

  assert.doesNotMatch(src, /require\(['"]\.\.\/models\/Customer['"]\)/);
  assert.doesNotMatch(src, /require\(['"]\.\.\/models\/User['"]\)/);
  assert.doesNotMatch(src, /Customer\.find/);
  assert.doesNotMatch(src, /User\.find/);

  assert.doesNotMatch(src, /findDebtCustomersForFilter/);
  assert.doesNotMatch(src, /makeCustomerDebtMeta/);
  assert.doesNotMatch(src, /buildCustomerMetaMap/);

  assert.match(src, /arCustomerDebtReadModel\.service/);
  assert.match(src, /async function debtReport[\s\S]*arCustomerDebtReadModel\.debtReport/);
  assert.match(src, /debtSource:\s*['"]AR_DEBT_READ_MODEL_V2['"]/);
});
