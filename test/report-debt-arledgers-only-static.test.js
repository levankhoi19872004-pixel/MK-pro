'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('debt report reads only arLedgers and does not remap from Customer/User', () => {
  const src = read('src/services/reportLegacy.service.js');

  assert.match(src, /REPORT_DEBT_ARLEDGER_ONLY_MATCH_START/);

  assert.doesNotMatch(src, /require\(['"]\.\.\/models\/Customer['"]\)/);
  assert.doesNotMatch(src, /require\(['"]\.\.\/models\/User['"]\)/);
  assert.doesNotMatch(src, /Customer\.find/);
  assert.doesNotMatch(src, /User\.find/);

  assert.doesNotMatch(src, /findDebtCustomersForFilter/);
  assert.doesNotMatch(src, /makeCustomerDebtMeta/);
  assert.doesNotMatch(src, /buildCustomerMetaMap/);

  assert.match(src, /ArLedger\.aggregate/);
  assert.match(src, /ledgerCollection:\s*['"]arLedgers['"]/);
});
