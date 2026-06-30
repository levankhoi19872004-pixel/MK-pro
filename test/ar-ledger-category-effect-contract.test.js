'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeArCategory, getArLedgerCategoryEffect } = require('../src/utils/arLedgerCategoryEffect.util');

test('AR-SALE-REVERSAL is classified before generic AR-SALE pattern', () => {
  const row = { category: 'AR-SALE-REVERSAL', type: 'ar_sale_reversal', code: 'AR-SALE-REVERSAL-B0038442-REV' };
  assert.equal(normalizeArCategory(row), 'AR-SALE-REVERSAL');
  assert.deepEqual(getArLedgerCategoryEffect(row), { category: 'AR-SALE-REVERSAL', defaultSide: 'credit', effect: 'decrease_ar' });
});
