'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('delivery closeout does not open debt by original minus return only when cash/transfer/reward exist', () => {
  const order = {
    id: 'SO-NOT-ORIGINAL-MINUS-RETURN',
    code: 'B-NOT-ORIGINAL-MINUS-RETURN',
    customerCode: 'C1',
    totalAmount: 1573635,
    cashAmount: 1000000,
    transferAmount: 125900,
    rewardAmount: 100000
  };
  const closeout = DeliveryCloseoutService.buildCloseout(order, [
    { id: 'RO-NOT-ORIGINAL-MINUS-RETURN', code: 'RO-NOT-ORIGINAL-MINUS-RETURN', sourceOrderId: 'SO-NOT-ORIGINAL-MINUS-RETURN', totalReturnAmount: 314736, status: 'active' }
  ]);
  assert.equal(closeout.originalAmount - closeout.returnedAmount, 1258899);
  assert.notEqual(closeout.finalDebtAmount, 1258899);
  assert.equal(closeout.finalDebtAmount, 32999);
});
