'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('delivery closeout does not open debt by original minus return only when cash/transfer/reward exist', () => {
  const order = {
    id: 'SO-CLOSEOUT-BREAKDOWN-2',
    code: 'B-CLOSEOUT-BREAKDOWN-2',
    customerCode: 'C-CLOSEOUT',
    totalAmount: 1258899,
    deliveryCloseout: {
      cashAmount: 1000000,
      transferAmount: 200000,
      rewardAmount: 25900
    }
  };
  const closeout = DeliveryCloseoutService.buildCloseout(order, []);
  assert.notEqual(closeout.finalDebtAmount, closeout.originalAmount - closeout.returnedAmount);
  assert.equal(closeout.finalDebtAmount, 32999);
});
