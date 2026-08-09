'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDeliveryDebtAmount, normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../src/constants/finance.constants');

function debt(receivableAmount, { cashAmount = 0, bankAmount = 0, rewardAmount = 0, returnAmount = 0 } = {}) {
  return calculateDeliveryDebtAmount({ receivableAmount, cashAmount, bankAmount, rewardAmount, returnAmount }, DEBT_ZERO_TOLERANCE);
}

test('financial matrix cash/reward/bank/return and B0041181 combined state', () => {
  assert.equal(debt(10000, { cashAmount: 6000 }).debtAmount, 4000);
  assert.equal(debt(10000, { rewardAmount: 3000 }).debtAmount, 7000);
  assert.equal(debt(10000, { bankAmount: 2500 }).debtAmount, 7500);
  assert.equal(debt(10000, { returnAmount: 4000 }).debtAmount, 6000);
  const b0041181 = debt(23800085, { cashAmount: 22140000, rewardAmount: 1660000 });
  assert.equal(b0041181.rawDebtAmount, 85);
  assert.equal(b0041181.debtAmount, 0);
});

test('Debt Zero Tolerance boundary is inclusive at ±1000', () => {
  for (const raw of [0, 1, 999, 1000, -1, -999, -1000]) assert.equal(normalizeDebtAmount(raw), 0, `raw=${raw}`);
  assert.equal(normalizeDebtAmount(1001), 1001);
  assert.equal(normalizeDebtAmount(-1001), -1001);
});

test('money normalization safely handles null/undefined/NaN without creating debt noise', () => {
  assert.equal(normalizeDebtAmount(null), 0);
  assert.equal(normalizeDebtAmount(undefined), 0);
  assert.equal(normalizeDebtAmount(Number.NaN), 0);
});
