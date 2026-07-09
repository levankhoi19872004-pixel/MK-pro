'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const canonicalReader = require('../src/services/delivery/deliveryTodayCanonicalOrderReader');

function chain(rows) {
  return {
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  };
}

function models(rows, masterRows = []) {
  return {
    SalesOrder: { find() { return chain(rows); } },
    MasterOrder: { find() { return chain(masterRows); } }
  };
}

test('Delivery Today date filter returns only orders matching requested deliveryDate', async () => {
  const modelSet = models([
    { id: 'SO1', code: 'B001', deliveryDate: '2026-07-08', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 1000 },
    { id: 'SO2', code: 'B002', deliveryDate: '2026-07-07', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 2000 },
    { id: 'SO3', code: 'B003', deliveryDate: '2026-07-09', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 3000 }
  ]);
  const result = await canonicalReader.listSalesOrders({ date: '2026-07-08', delivery: 'GH1', deliveryDateChangedByUser: '1' }, modelSet);
  assert.deepEqual(result.orders.map((row) => row.orderCode), ['B001']);
  assert.equal(result.diagnostics.dateFilter.requestedDate, '2026-07-08');
  assert.equal(result.diagnostics.dateFilter.canonicalField, 'orders.deliveryDate');
});

test('Delivery Today date filter does not use createdAt as fallback for deliveryDate', async () => {
  const modelSet = models([
    { id: 'SO1', code: 'B001', deliveryDate: '2026-07-07', createdAt: '2026-07-08T02:00:00.000Z', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 1000 }
  ]);
  const result = await canonicalReader.listSalesOrders({ date: '2026-07-08', delivery: 'GH1', deliveryDateChangedByUser: '1' }, modelSet);
  assert.equal(result.orders.length, 0);
});

test('Delivery Today date filter does not use orderDate as fallback for deliveryDate', async () => {
  const modelSet = models([
    { id: 'SO1', code: 'B001', deliveryDate: '2026-07-07', orderDate: '2026-07-08', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 1000 }
  ]);
  const result = await canonicalReader.listSalesOrders({ date: '2026-07-08', delivery: 'GH1', deliveryDateChangedByUser: '1' }, modelSet);
  assert.equal(result.orders.length, 0);
});

test('Delivery Today date filter does not pull missing deliveryDate from masterOrders date metadata', async () => {
  const modelSet = models([
    { id: 'SO1', code: 'B001', orderDate: '2026-07-08', deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 1000 }
  ], [
    { id: 'MO1', childOrderIds: ['SO1'], deliveryDate: '2026-07-08', deliveryStaffCode: 'GH1' }
  ]);
  const result = await canonicalReader.listSalesOrders({ date: '2026-07-08', delivery: 'GH1', deliveryDateChangedByUser: '1' }, modelSet);
  assert.equal(result.orders.length, 0);
  assert.ok(result.diagnostics.dateFilter.warnings.includes('ORDER_MISSING_CANONICAL_DELIVERY_DATE'));
});

test('Delivery Today date filter uses Asia/Ho_Chi_Minh day for Date deliveryDate values', async () => {
  const modelSet = models([
    { id: 'SO1', code: 'B001', deliveryDate: new Date('2026-07-07T17:30:00.000Z'), deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 1000 },
    { id: 'SO2', code: 'B002', deliveryDate: new Date('2026-07-08T17:30:00.000Z'), deliveryStaffCode: 'GH1', salesStaffCode: 'NV1', totalAmount: 1000 }
  ]);
  const result = await canonicalReader.listSalesOrders({ date: '2026-07-08', delivery: 'GH1', deliveryDateChangedByUser: '1' }, modelSet);
  assert.deepEqual(result.orders.map((row) => row.orderCode), ['B001']);
  assert.equal(result.orders[0].deliveryDate, '2026-07-08');
});
