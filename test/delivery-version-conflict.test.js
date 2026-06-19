'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeliveryEngine } = require('../src/engines/delivery.engine');

function chain(value) {
  return {
    sort() { return this; }, skip() { return this; }, limit() { return this; },
    session() { return this; }, lean: async () => value
  };
}

test('delivery confirmation rejects a stale version instead of overwriting another write', async () => {
  const current = {
    id: 'SO-V1', code: 'SO-V1', salesOrderId: 'SO-V1', salesOrderCode: 'SO-V1',
    version: 3, status: 'assigned', deliveryStatus: 'assigned',
    deliveryStaffCode: 'NVGH-01', totalAmount: 100000, paidAmount: 0, debtAmount: 100000,
    items: [{ productCode: 'P1', quantity: 1, price: 100000 }]
  };
  const SalesOrder = {
    findOne: () => chain({ ...current }),
    findOneAndUpdate: async () => null
  };
  const ReturnOrder = { find: () => chain([]) };
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder });

  await assert.rejects(
    () => engine.confirm({
      orderId: 'SO-V1', status: 'delivered',
      actorDeliveryStaffCode: 'NVGH-01', enforceDeliveryOwnership: true
    }),
    (err) => err && err.status === 409 && err.code === 'ORDER_VERSION_CONFLICT'
  );
});
