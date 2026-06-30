'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('strict delivery closeout does not infer collectedAmount from AR-RECEIPT-like or legacy cash fields', () => {
  const order = {
    id: 'SO-CASH-STRICT',
    code: 'B-CASH-STRICT',
    customerCode: 'C1',
    totalAmount: 1000000,
    cashCollected: 200000,
    receiptAmount: 300000,
    deliveryCloseout: { collectedAmount: 0 }
  };
  const closeout = DeliveryCloseoutService.buildCloseout(order, []);
  assert.equal(closeout.collectedAmount, 0);
  assert.equal(closeout.finalDebtAmount, 1000000);
});
