'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('strict closeout fails when salesOrder lacks totalAmount even if legacy amount fields exist', () => {
  const order = { id: 'SO-NO-TOTAL', code: 'B-NO-TOTAL', customerCode: 'C1', amount: 1000000, payableAmount: 1000000, deliveryCloseout: { collectedAmount: 0 } };
  assert.throws(
    () => DeliveryCloseoutService.buildCloseout(order, []),
    (err) => err && err.code === 'CONTRACT_VALIDATION_ERROR' && /totalAmount/.test(err.message)
  );
});
