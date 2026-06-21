'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DeliveryEngine } = require('../src/engines/delivery.engine');
const { _internal: mobileDebtInternal } = require('../src/services/mobile/debts.service');
const { _internal: debtCollectionInternal } = require('../src/services/DebtCollectionService');

function chain(value) {
  return {
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => (typeof value === 'function' ? value() : value)
  };
}

function orderB() {
  return {
    id: 'SO-B',
    code: 'SO-B',
    salesOrderId: 'SO-B',
    salesOrderCode: 'SO-B',
    orderId: 'SO-B',
    orderCode: 'SO-B',
    customerCode: 'C-B',
    customerName: 'Khách B',
    deliveryStaffCode: 'NVGH-B',
    deliveryStaffName: 'Giao hàng B',
    deliveryDate: '2026-06-21',
    status: 'assigned',
    deliveryStatus: 'assigned',
    totalAmount: 100000,
    paidAmount: 0,
    debtAmount: 100000,
    items: [{ productCode: 'P1', productName: 'SP 1', quantity: 1, price: 100000 }]
  };
}

function returnB() {
  return {
    id: 'RO-SO-B',
    code: 'RO-SO-B',
    salesOrderId: 'SO-B',
    salesOrderCode: 'SO-B',
    orderId: 'SO-B',
    orderCode: 'SO-B',
    customerCode: 'C-B',
    customerName: 'Khách B',
    deliveryStaffCode: 'NVGH-B',
    deliveryStaffName: 'Giao hàng B',
    status: 'waiting_receive',
    items: [{ productCode: 'P1', productName: 'SP 1', returnQty: 1, price: 100000 }]
  };
}

test('NVGH A cannot read direct return rows of NVGH B by guessing orderCode', async () => {
  let findOneCalls = 0;
  const SalesOrder = {
    findOne: () => {
      findOneCalls += 1;
      return chain(orderB());
    },
    find: () => chain([])
  };
  const ReturnOrder = { find: () => chain([returnB()]) };
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder });

  const result = await engine.listReturns({
    orderCode: 'SO-B',
    deliveryStaffCode: 'NVGH-A',
    actorDeliveryStaffCode: 'NVGH-A',
    enforceDeliveryOwnership: true
  });

  assert.deepEqual(result.rows, []);
  assert.equal(findOneCalls, 0, 'must not fall back to loading another NVGH order after direct return scope fails');
});

test('admin-style delivery return lookup still reads direct return rows when ownership guard is not enforced', async () => {
  const SalesOrder = {
    findOne: () => chain(orderB()),
    find: () => chain([])
  };
  const ReturnOrder = { find: () => chain([returnB()]) };
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder });

  const result = await engine.listReturns({ orderCode: 'SO-B' });

  assert.equal(result.rows.length, 1);
  assert.equal(result.returnOrdersRaw[0].deliveryStaffCode, 'NVGH-B');
});

test('NVGH A cannot mutate return/payment/confirm for NVGH B order', async () => {
  let updateCount = 0;
  const SalesOrder = {
    findOne: () => chain(orderB()),
    findOneAndUpdate: async () => {
      updateCount += 1;
      return orderB();
    },
    find: () => chain([])
  };
  const ReturnOrder = { find: () => chain([]) };
  const engine = new DeliveryEngine({ SalesOrder, ReturnOrder });
  const guard = {
    orderId: 'SO-B',
    actorDeliveryStaffCode: 'NVGH-A',
    enforceDeliveryOwnership: true
  };

  await assert.rejects(
    () => engine.saveReturn({ ...guard, items: [{ productCode: 'P1', returnQty: 1, price: 100000 }] }),
    (err) => err && err.status === 403 && err.code === 'DELIVERY_ORDER_FORBIDDEN'
  );
  await assert.rejects(
    () => engine.savePayment({ ...guard, cashAmount: 100000 }),
    (err) => err && err.status === 403 && err.code === 'DELIVERY_ORDER_FORBIDDEN'
  );
  await assert.rejects(
    () => engine.confirm({ ...guard, status: 'delivered' }),
    (err) => err && err.status === 403 && err.code === 'DELIVERY_ORDER_FORBIDDEN'
  );
  assert.equal(updateCount, 0);
});

test('mobile debts always binds delivery role to logged-in NVGH and ignores spoofed collector/staff scope', () => {
  const scoped = mobileDebtInternal.scopeDebtQuery({
    collectorType: 'sales',
    salesStaffCode: 'NVBH-B',
    deliveryStaffCode: 'NVGH-B',
    q: 'khach b'
  }, {
    role: 'delivery',
    code: 'NVGH-A',
    name: 'Giao hàng A'
  });

  assert.equal(scoped.collectorType, 'delivery');
  assert.equal(scoped.deliveryStaffCode, 'NVGH-A');
  assert.equal(scoped.salesStaffCode, undefined);
});

test('mobile debt collection ignores spoofed deliveryStaffCode for delivery user but preserves admin override', () => {
  const deliveryCollector = debtCollectionInternal.buildCollectorFields({
    role: 'delivery',
    staffCode: 'NVGH-A',
    fullName: 'Giao hàng A'
  }, {
    collectorType: 'sales',
    deliveryStaffCode: 'NVGH-B',
    deliveryStaffName: 'Giao hàng B',
    salesStaffCode: 'NVBH-B'
  });

  assert.equal(deliveryCollector.collectorType, 'delivery');
  assert.equal(deliveryCollector.deliveryStaffCode, 'NVGH-A');
  assert.equal(deliveryCollector.deliveryStaffName, 'Giao hàng A');
  assert.equal(deliveryCollector.salesStaffCode, '');

  const adminCollector = debtCollectionInternal.buildCollectorFields({
    role: 'admin',
    staffCode: 'ADMIN'
  }, {
    collectorType: 'delivery',
    deliveryStaffCode: 'NVGH-B',
    deliveryStaffName: 'Giao hàng B'
  });

  assert.equal(adminCollector.collectorType, 'delivery');
  assert.equal(adminCollector.deliveryStaffCode, 'NVGH-B');
});
