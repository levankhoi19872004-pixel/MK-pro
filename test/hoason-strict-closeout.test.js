'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('Hoa Sơn strict closeout formula is deterministic', () => {
  const order = {
    id: 'SO1782723235234708',
    code: 'B0038442',
    customerCode: 'BBHOASON',
    totalAmount: 487484570,
    deliveryCloseout: { collectedAmount: 190000000 }
  };
  const returnOrders = [{ id: 'RO-B0038442', code: 'RO-B0038442', sourceOrderId: 'SO1782723235234708', totalReturnAmount: 549540, status: 'active' }];
  const closeout = DeliveryCloseoutService.buildCloseout(order, returnOrders, [], { actor: 'KT' });
  assert.equal(closeout.originalAmount, 487484570);
  assert.equal(closeout.returnedAmount, 549540);
  assert.equal(closeout.collectedAmount, 190000000);
  assert.equal(closeout.finalDebtAmount, 296935030);
});
