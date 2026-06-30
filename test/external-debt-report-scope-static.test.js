'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('debt report no longer pattern-matches external legacy AR and delegates to strict read model v2', () => {
  const source = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');
  assert.match(source, /arCustomerDebtReadModel\.debtReport\(query\)/);
  assert.match(source, /debtSource:\s*'AR_DEBT_READ_MODEL_V2'/);
  assert.doesNotMatch(source, /regex:\s*'sale\|external_debt'/);
});
