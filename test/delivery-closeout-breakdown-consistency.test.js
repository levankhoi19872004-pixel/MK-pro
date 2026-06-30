'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('delivery closeout breakdown keeps original = return + collected + offset + final debt', () => {
  const order = {
    id: 'SO-BREAKDOWN',
    code: 'B-BREAKDOWN',
    customerCode: 'C1',
    totalAmount: 1573635,
    cashAmount: 1000000,
    transferAmount: 125900,
    rewardAmount: 100000
  };
  const closeout = DeliveryCloseoutService.buildCloseout(order, [
    { id: 'RO-BREAKDOWN', code: 'RO-BREAKDOWN', sourceOrderId: 'SO-BREAKDOWN', totalReturnAmount: 314736, status: 'active' }
  ]);
  assert.equal(closeout.finalDebtAmount, 32999);
  assert.equal(closeout.originalAmount, closeout.returnedAmount + closeout.collectedAmount + closeout.offsetAmount + closeout.finalDebtAmount);
});
