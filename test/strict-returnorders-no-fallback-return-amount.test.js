'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('strict returnOrders fail without totalReturnAmount even if amount/debtReduction exist', () => {
  const order = { id: 'SO-RET-STRICT', code: 'B-RET-STRICT', customerCode: 'C1', totalAmount: 1000000, deliveryCloseout: { collectedAmount: 0 } };
  const returnOrders = [{ id: 'RO-1', code: 'RO-1', sourceOrderId: 'SO-RET-STRICT', amount: 100000, debtReduction: 100000, status: 'active' }];
  assert.throws(
    () => DeliveryCloseoutService.buildCloseout(order, returnOrders),
    (err) => err && err.code === 'CONTRACT_VALIDATION_ERROR' && /totalReturnAmount/.test(err.message)
  );
});
