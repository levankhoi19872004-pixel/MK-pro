'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');

function order(overrides = {}) {
  return {
    id: 'SO-1',
    _id: 'SO-1',
    code: 'B0001',
    orderCode: 'B0001',
    tenantId: 'TENANT-A',
    totalAmount: 10000,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    ...overrides
  };
}

function version(overrides = {}) {
  return {
    id: 'VER-1',
    salesOrderId: 'SO-1',
    salesOrderCode: 'B0001',
    tenantId: 'TENANT-A',
    closeoutVersion: 1,
    status: 'corrected_confirmed',
    originalAmount: 10000,
    cashAmount: 1000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    ...overrides
  };
}

function allocation(overrides = {}) {
  return {
    allocationCode: 'OPA-1',
    orderId: 'SO-1',
    orderCode: 'B0001',
    tenantId: 'TENANT-A',
    sourceVersion: 1,
    status: 'posted',
    active: true,
    receivableAmount: 10000,
    cashAmount: 2000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    ...overrides
  };
}

function mapFor(row, keys = ['SO-1', 'B0001']) {
  return new Map(keys.map((key) => [key, row]));
}

function returnState(amount = 0) {
  return {
    returnAmount: amount,
    returnStateSource: 'returnOrders',
    returnOrderIds: amount ? ['RO-1'] : [],
    diagnostics: []
  };
}

function resolve({ currentOrder = order(), latest = version(), currentAllocation = allocation(), returns = returnState(0), options = {} } = {}) {
  return resolver.resolvePaymentStateForOrder(
    currentOrder,
    latest ? mapFor(latest) : new Map(),
    currentAllocation ? mapFor(currentAllocation) : new Map(),
    returns,
    options
  );
}

test('RES-001: current allocation exact-version is selected', () => {
  const state = resolve();
  assert.equal(state.paymentStateSource, 'orderPaymentAllocations.current');
  assert.equal(state.cashAmount, 2000);
  assert.equal(state.paymentVersion, 1);
});

test('RES-002: stale allocation falls back to latest eligible closeout version', () => {
  const state = resolve({
    latest: version({ id: 'VER-2', closeoutVersion: 2, cashAmount: 3500 }),
    currentAllocation: allocation({ sourceVersion: 1, cashAmount: 9000 })
  });
  assert.equal(state.paymentStateSource, 'deliveryCloseoutVersions.latest');
  assert.equal(state.cashAmount, 3500);
  assert.equal(state.stalePaymentAllocationIgnored, true);
  assert.ok(state.diagnostics.some((row) => row.code === 'ALLOCATION_STALE'));
});

test('RES-003: allocation version higher than effective version is not current', () => {
  assert.equal(
    resolver.allocationIsCurrentForVersion(
      { sourceVersion: 2, status: 'posted', active: true },
      { closeoutVersion: 1, status: 'accounting_confirmed' }
    ),
    false
  );
  const state = resolve({ currentAllocation: allocation({ sourceVersion: 2, cashAmount: 8000 }) });
  assert.equal(state.paymentStateSource, 'deliveryCloseoutVersions.latest');
  assert.ok(state.diagnostics.some((row) => row.code === 'ALLOCATION_VERSION_MISMATCH'));
});

test('RES-004: latest eligible closeout version is selected when allocation is absent', () => {
  const state = resolve({ currentAllocation: null });
  assert.equal(state.paymentStateSource, 'deliveryCloseoutVersions.latest');
  assert.equal(state.cashAmount, 1000);
});

test('RES-005: embedded deliveryCloseout is the first legacy fallback', () => {
  const state = resolve({
    latest: null,
    currentAllocation: null,
    currentOrder: order({
      cashAmount: 9000,
      deliveryCloseout: { originalAmount: 10000, cashAmount: 0, bankAmount: 1000, rewardAmount: 0 }
    })
  });
  assert.equal(state.paymentStateSource, 'salesOrders.deliveryCloseout');
  assert.equal(state.cashAmount, 0);
  assert.equal(state.bankAmount, 1000);
  assert.equal(state.isLegacyFallback, true);
});

test('RES-006: top-level legacy fields are the final payment fallback', () => {
  const state = resolve({
    latest: null,
    currentAllocation: null,
    currentOrder: order({ cashAmount: 1200, bankAmount: 300 })
  });
  assert.equal(state.paymentStateSource, 'orders.top-level');
  assert.equal(state.cashAmount, 1200);
  assert.equal(state.bankAmount, 300);
});

test('RES-007: explicit zero is preserved by firstDefinedMoney and aliases', () => {
  assert.equal(resolver._private.firstDefinedMoney({ cashAmount: 0, cashCollected: 999 }, ['cashAmount', 'cashCollected']), 0);
  const state = resolve({
    latest: null,
    currentAllocation: null,
    currentOrder: order({ cashAmount: 0, cashCollected: 999 })
  });
  assert.equal(state.cashAmount, 0);
});

test('RES-008: null undefined and empty values continue to the next alias', () => {
  const state = resolve({
    latest: null,
    currentAllocation: null,
    currentOrder: order({ cashAmount: null, cashCollectedAmount: '', cashCollected: 1250 })
  });
  assert.equal(state.cashAmount, 1250);
});

test('RES-009: NaN Infinity and unparseable money fall through with diagnostics', () => {
  const state = resolve({
    latest: null,
    currentAllocation: null,
    currentOrder: order({ cashAmount: 'not-money', cashCollectedAmount: Infinity, cashCollected: '1.250' })
  });
  assert.equal(state.cashAmount, 1250);
  assert.equal(state.integrityStatus, 'degraded');
  assert.ok(state.diagnostics.filter((row) => row.code === 'INVALID_MONEY').length >= 2);
});

test('RES-010: duplicate financial candidates are ambiguous and never first-row-wins', () => {
  const latest = version({ cashAmount: 1700 });
  const duplicateAllocations = new Map([
    ['SO-1', [allocation({ allocationCode: 'OPA-A', cashAmount: 5000 }), allocation({ allocationCode: 'OPA-B', cashAmount: 7000 })]]
  ]);
  const state = resolver.resolvePaymentStateForOrder(order(), mapFor(latest), duplicateAllocations, returnState(0));
  assert.equal(state.paymentStateSource, 'deliveryCloseoutVersions.latest');
  assert.equal(state.cashAmount, 1700);
  assert.ok(state.diagnostics.some((row) => row.code === 'DUPLICATE_PAYMENT_IDENTITY'));
});

test('RES-011: string id and orderCode typed identities resolve the same order', () => {
  const versions = new Map([['id:SO-1', version({ cashAmount: 1800 })], ['code:B0001', version({ cashAmount: 1800 })]]);
  const allocations = new Map([['id:SO-1', allocation({ cashAmount: 2200 })], ['code:B0001', allocation({ cashAmount: 2200 })]]);
  const state = resolver.resolvePaymentStateForOrder(order(), versions, allocations, returnState(0));
  assert.equal(state.cashAmount, 2200);
  assert.equal(state.orderId, 'SO-1');
  assert.equal(state.orderCode, 'B0001');
});

test('RES-012: negative input components are excluded and diagnosed', () => {
  const state = resolve({ currentAllocation: allocation({ cashAmount: -500, bankAmount: 100 }) });
  assert.equal(state.cashAmount, 0);
  assert.equal(state.bankAmount, 100);
  assert.equal(state.integrityStatus, 'degraded');
  assert.ok(state.diagnostics.some((row) => row.code === 'NEGATIVE_INPUT_COMPONENT' && row.component === 'cashAmount'));
});

test('RES-013: handled amount above receivable keeps signed debt and warning', () => {
  const state = resolve({ currentAllocation: allocation({ receivableAmount: 10000, cashAmount: 12000 }) });
  assert.equal(state.debtRaw, -2000);
  assert.equal(state.debtAmount, -2000);
  assert.equal(state.overpaidAmount, 2000);
  assert.ok(state.diagnostics.some((row) => row.code === 'TOTAL_HANDLED_EXCEEDS_RECEIVABLE'));
});

test('RES-014: debtRaw +1000 normalizes debtAmount to zero', () => {
  const state = resolve({ currentAllocation: allocation({ receivableAmount: 10000, cashAmount: 9000 }) });
  assert.equal(state.debtRaw, 1000);
  assert.equal(state.debtAmount, 0);
});

test('RES-015: debtRaw -1000 normalizes debtAmount to zero', () => {
  const state = resolve({ currentAllocation: allocation({ receivableAmount: 10000, cashAmount: 11000 }) });
  assert.equal(state.debtRaw, -1000);
  assert.equal(state.debtAmount, 0);
});

test('RES-016: absolute debtRaw 1001 remains signed', () => {
  const positive = resolve({ currentAllocation: allocation({ receivableAmount: 10000, cashAmount: 8999 }) });
  const negative = resolve({ currentAllocation: allocation({ receivableAmount: 10000, cashAmount: 11001 }) });
  assert.equal(positive.debtAmount, 1001);
  assert.equal(negative.debtAmount, -1001);
});

test('RES-017: offset is subtracted exactly once', () => {
  const state = resolve({ currentAllocation: allocation({ cashAmount: 1000, rewardAmount: 2000, offsetAmount: 3000 }) });
  assert.equal(state.totalCollectedAmount, 6000);
  assert.equal(state.debtRaw, 4000);
});

test('RES-018: empty order batch performs zero join queries', async () => {
  let finds = 0;
  const model = { find() { finds += 1; throw new Error('must not query'); } };
  const result = await resolver.resolvePaymentStatesForOrders([], {
    models: { DeliveryCloseoutVersion: model, OrderPaymentAllocation: model, ReturnOrder: model }
  });
  assert.equal(result.states.length, 0);
  assert.equal(finds, 0);
});

test('RES-019: batch above 1000 fails before querying', async () => {
  let finds = 0;
  const model = { find() { finds += 1; return []; } };
  const orders = Array.from({ length: 1001 }, (_, index) => order({ id: `SO-${index}`, _id: `SO-${index}`, code: `B${index}`, orderCode: `B${index}` }));
  await assert.rejects(
    resolver.resolvePaymentStatesForOrders(orders, {
      models: { DeliveryCloseoutVersion: model, OrderPaymentAllocation: model, ReturnOrder: model }
    }),
    { code: 'CANONICAL_FINANCIAL_BATCH_TOO_LARGE' }
  );
  assert.equal(finds, 0);
});

test('RES-020: tenant mismatch candidate is excluded', () => {
  const currentOrder = order({ cashAmount: 400 });
  const foreignAllocation = allocation({ tenantId: 'TENANT-B', cashAmount: 9000 });
  const state = resolver.resolvePaymentStateForOrder(
    currentOrder,
    new Map(),
    mapFor(foreignAllocation),
    returnState(0)
  );
  assert.equal(state.paymentStateSource, 'orders.top-level');
  assert.equal(state.cashAmount, 400);
});
