'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');
const reader = resolver._private.ReturnStateReader;

const baseOrder = { id: 'SO-1', _id: 'SO-1', code: 'B0001', orderCode: 'B0001', tenantId: 'TENANT-A', totalAmount: 10000 };

function row(overrides = {}) {
  return {
    id: 'RO-1',
    code: 'RO-1',
    orderId: 'SO-1',
    orderCode: 'B0001',
    tenantId: 'TENANT-A',
    status: 'waiting_receive',
    amount: 1000,
    ...overrides
  };
}

function state(rows) {
  return reader.resolveReturnStateForOrder(baseOrder, rows);
}

test('RET-001: no returnOrders resolves zero from returnOrders source', () => {
  const result = state([]);
  assert.equal(result.returnAmount, 0);
  assert.equal(result.returnStateSource, 'returnOrders');
});

test('RET-002: one eligible returnOrder is totaled', () => {
  assert.equal(state([row()]).returnAmount, 1000);
});

test('RET-003: multiple eligible returnOrders are totaled', () => {
  assert.equal(state([row(), row({ id: 'RO-2', code: 'RO-2', amount: 2500 })]).returnAmount, 3500);
});

test('RET-004: cancelled return is excluded', () => {
  assert.equal(state([row({ status: 'cancelled' })]).returnAmount, 0);
});

test('RET-005: reversed or void legacy state is excluded', () => {
  assert.equal(state([row({ status: 'reversed' }), row({ id: 'RO-2', code: 'RO-2', status: 'void' })]).returnAmount, 0);
});

test('RET-006: deleted return is excluded', () => {
  assert.equal(state([row({ isDeleted: true }), row({ id: 'RO-2', code: 'RO-2', deletedAt: '2026-08-01' })]).returnAmount, 0);
});

for (const [id, lifecycleState] of [
  ['RET-007', 'draft'],
  ['RET-008', 'waiting_receive'],
  ['RET-009', 'received'],
  ['RET-010', 'accounting_confirmed'],
  ['RET-011', 'posted_to_ar']
]) {
  test(`${id}: ${lifecycleState} follows the audited operational contract`, () => {
    assert.equal(state([row({ status: lifecycleState })]).returnAmount, 1000);
  });
}

test('RET-012: unknown positive state is included with rollout warning', () => {
  const result = state([row({ status: 'legacy_custom_positive' })]);
  assert.equal(result.returnAmount, 1000);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'UNKNOWN_RETURN_STATE_INCLUDED'));
});

test('RET-013: explicit zero total does not fall through to stale item aliases', () => {
  const result = state([row({ amount: undefined, totalReturnAmount: 0, items: [{ returnQty: 2, price: 5000 }] })]);
  assert.equal(result.returnAmount, 0);
});

test('RET-014: item amount fallback is supported', () => {
  const result = state([row({ amount: undefined, items: [{ returnAmount: 1200 }, { amount: 300 }] })]);
  assert.equal(result.returnAmount, 1500);
});

test('RET-015: quantity multiplied by price fallback is integer VND', () => {
  const result = state([row({ amount: undefined, items: [{ returnQty: 3, salePrice: 333.4 }] })]);
  assert.equal(result.returnAmount, 999);
});

test('RET-016: matching both id and code does not double count', () => {
  const built = reader.buildReturnStatesForOrders([baseOrder], [row({ amount: 2000 })]);
  const result = reader.returnStateForOrder(baseOrder, built.statesByIdentity);
  assert.equal(result.returnAmount, 2000);
});

test('RET-017: duplicate return identity is deduplicated with warning', () => {
  const result = state([row({ amount: 2000 }), row({ amount: 2000 })]);
  assert.equal(result.returnAmount, 2000);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'DUPLICATE_RETURN_IDENTITY'));
});

test('RET-018: allocation return snapshot cannot override returnOrders', () => {
  const currentVersion = { id: 'VER-1', orderId: 'SO-1', orderCode: 'B0001', closeoutVersion: 1, status: 'corrected_confirmed', originalAmount: 10000, cashAmount: 1000 };
  const allocation = { allocationCode: 'OPA-1', orderId: 'SO-1', orderCode: 'B0001', sourceVersion: 1, status: 'posted', receivableAmount: 10000, cashAmount: 1000, returnAmount: 9000 };
  const financial = resolver.resolvePaymentStateForOrder(
    baseOrder,
    new Map([['SO-1', currentVersion]]),
    new Map([['SO-1', allocation]]),
    { returnAmount: 2500, returnStateSource: 'returnOrders', returnOrderIds: ['RO-1'], diagnostics: [] }
  );
  assert.equal(financial.returnAmount, 2500);
  assert.ok(financial.diagnostics.some((entry) => entry.code === 'RETURN_SNAPSHOT_DIFF' && entry.source === 'orderPaymentAllocations.current'));
});

test('RET-019: version return snapshot cannot override returnOrders', () => {
  const currentVersion = { id: 'VER-1', orderId: 'SO-1', orderCode: 'B0001', closeoutVersion: 1, status: 'corrected_confirmed', originalAmount: 10000, cashAmount: 1000, returnAmount: 7000 };
  const financial = resolver.resolvePaymentStateForOrder(
    baseOrder,
    new Map([['SO-1', currentVersion]]),
    new Map(),
    { returnAmount: 2500, returnStateSource: 'returnOrders', returnOrderIds: ['RO-1'], diagnostics: [] }
  );
  assert.equal(financial.returnAmount, 2500);
  assert.ok(financial.diagnostics.some((entry) => entry.code === 'RETURN_SNAPSHOT_DIFF' && entry.source === 'deliveryCloseoutVersions.latest'));
});
