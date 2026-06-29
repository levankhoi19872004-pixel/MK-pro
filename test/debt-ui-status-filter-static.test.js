'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('debt UI status filter keeps overpaid customers out of Khách còn nợ', () => {
  const src = read('public/js/app/debt/07a-debt-core.js');
  assert.match(src, /function matchDebtStatus\(row=\{\}, status=''\)/);
  assert.match(src, /return debt>0;/);
  assert.doesNotMatch(src, /return hasOpenDebt\(d\.debt\) \|\| isOverpaidDebt\(d\.debt\);/);
  assert.match(src, /const rows=debtsCache\.filter\(d=>matchDebtStatus\(d, criteria\.status\)\);/);
});

test('debt collection panel clears payment amount and disables submit when no payable order exists', () => {
  const src = read('public/js/app/debt/07a-debt-core.js');
  assert.match(src, /function setDebtPaymentControlsEnabled\(enabled\)/);
  assert.match(src, /debtPaymentAmount\.value='0'/);
  assert.match(src, /submitButton\.disabled=!allowed/);
  assert.match(src, /Khách này không còn đơn nợ để thanh toán/);
});
