'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

test('closeout correction preserves old accounting_confirmed version snapshot', () => {
  const oldVersion = Object.freeze({ version: 1, finalDebtAmount: 500000, calculationHash: 'old' });
  const order = { id: 'SO-VERSION', code: 'B-VERSION', customerCode: 'C1', totalAmount: 600000, deliveryCloseout: { status: 'accounting_confirmed', version: 1, finalDebtAmount: 500000, collectedAmount: 0, versions: [oldVersion] } };
  const next = DeliveryCloseoutService.confirmCloseout(order, DeliveryCloseoutService.buildCloseout(order, [{ id: 'RO', code: 'RO', sourceOrderId: 'SO-VERSION', totalReturnAmount: 200000, status: 'active' }], [], { version: 2 }), { actor: 'KT' });
  assert.equal(order.deliveryCloseout.versions[0].finalDebtAmount, 500000);
  assert.equal(next.versions[0].finalDebtAmount, 500000);
  assert.equal(next.version, 2);
  assert.equal(next.versions.at(-1).version, 2);
});
