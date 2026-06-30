'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('delivery closeout returnedAmount is calculated from strict active returnOrders', () => {
  const order = { id: 'SO-1', code: 'B001', customerCode: 'C001', totalAmount: 1000000, deliveryCloseout: { collectedAmount: 200000 } };
  const closeout = DeliveryCloseoutService.buildCloseout(order, [
    { id: 'RO-1', code: 'RO-1', sourceOrderId: 'SO-1', totalReturnAmount: 100000, status: 'active' },
    { id: 'RO-2', code: 'RO-2', sourceOrderId: 'SO-1', totalReturnAmount: 50000, status: 'active' },
    { id: 'RO-CANCEL', code: 'RO-CANCEL', sourceOrderId: 'SO-1', totalReturnAmount: 999999, status: 'cancelled' }
  ]);
  assert.equal(closeout.returnedAmount, 150000);
  assert.deepEqual(closeout.returnOrderIds, ['RO-1', 'RO-2']);
  assert.equal(closeout.finalDebtAmount, 650000);
});
