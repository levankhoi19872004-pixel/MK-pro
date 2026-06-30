'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('delivery closeout breakdown keeps original = return + collected + offset + final debt', () => {
  const order = {
    id: 'SO-CLOSEOUT-BREAKDOWN',
    code: 'B-CLOSEOUT-BREAKDOWN',
    customerCode: 'C-CLOSEOUT',
    totalAmount: 1258899,
    deliveryCloseout: {
      cashAmount: 1000000,
      transferAmount: 200000,
      rewardAmount: 25900
    }
  };
  const closeout = DeliveryCloseoutService.buildCloseout(order, []);
  assert.equal(closeout.finalDebtAmount, 32999);
  assert.equal(
    closeout.originalAmount,
    closeout.returnedAmount + closeout.collectedAmount + closeout.offsetAmount + closeout.finalDebtAmount
  );
});
