'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentState = require('../../../src/services/delivery/DeliveryPaymentStateReadService');
const LatestStateReader = require('../../../src/services/delivery/DeliveryFinancialLatestStateBatchReader');
const { buildPerfA3aFixture } = require('./fixture-factory');
const { FakeModel } = require('./fake-mongo');

function modelSet(fixture) {
  return {
    DeliveryCloseoutVersion: new FakeModel(fixture.versions, 'DeliveryCloseoutVersion'),
    OrderPaymentAllocation: new FakeModel(fixture.allocations, 'OrderPaymentAllocation'),
    ReturnOrder: new FakeModel(fixture.returns, 'ReturnOrder')
  };
}

function financialSnapshot(states = []) {
  return states.map((state) => ({
    orderId: state.orderId,
    orderCode: state.orderCode,
    paymentVersion: state.paymentVersion,
    paymentStateSource: state.paymentStateSource,
    stalePaymentAllocationIgnored: state.stalePaymentAllocationIgnored,
    diagnosticCodes: (state.diagnostics || []).map((row) => row.code).sort(),
    receivableAmount: state.receivableAmount,
    cashAmount: state.cashAmount,
    bankAmount: state.bankAmount,
    rewardAmount: state.rewardAmount,
    offsetAmount: state.offsetAmount,
    returnAmount: state.returnAmount,
    debtRaw: state.debtRaw,
    debtAmount: state.debtAmount,
    openDebtAmount: state.openDebtAmount,
    integrityStatus: state.integrityStatus
  }));
}

async function resolve(fixture, orders, dbNativeLatestState, maxPaymentCandidates = 50000) {
  const models = modelSet(fixture);
  const result = await PaymentState.resolvePaymentStatesForOrders(orders, {
    models,
    includeReturnState: true,
    dbNativeLatestState,
    maxOrders: 1000,
    maxPaymentCandidates
  });
  return { result, models };
}

test('DB-native latest-state grouping preserves complete financial semantics', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const orders = fixture.orders.slice(0, 100);
  const legacy = await resolve(fixture, orders, false);
  const optimized = await resolve(fixture, orders, true);

  assert.deepEqual(financialSnapshot(optimized.result.states), financialSnapshot(legacy.result.states));
  assert.ok(optimized.result.versionsByKey._dbNativeLatestState);
  assert.ok(optimized.result.allocationsByKey._dbNativeLatestState);
  assert.ok(optimized.result.versionsByKey._candidateRowsRead < legacy.result.versionsByKey._rows.length);
  assert.ok(optimized.result.allocationsByKey._candidateRowsRead < legacy.result.allocationsByKey._rows.length);
});

test('latest-state repository calls remain constant when order count grows', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const small = await resolve(fixture, fixture.orders.slice(0, 10), true);
  const large = await resolve(fixture, fixture.orders.slice(0, 100), true);

  assert.equal(small.models.DeliveryCloseoutVersion.metrics.queries, 1);
  assert.equal(large.models.DeliveryCloseoutVersion.metrics.queries, 1);
  assert.equal(small.models.OrderPaymentAllocation.metrics.queries, 2);
  assert.equal(large.models.OrderPaymentAllocation.metrics.queries, 2);
  assert.equal(small.models.ReturnOrder.metrics.queries, 1);
  assert.equal(large.models.ReturnOrder.metrics.queries, 1);
});

test('optimized pipelines group latest candidates without truncating with a global limit', () => {
  const pipeline = LatestStateReader.latestGroupPipeline({ status: { $ne: 'deleted' } }, {
    identityFields: LatestStateReader.VERSION_IDENTITY_FIELDS,
    versionFields: ['closeoutVersion', 'sourceVersion', 'version'],
    projection: '_id salesOrderId orderId closeoutVersion createdAt'
  });
  assert.ok(pipeline.some((stage) => stage.$group));
  assert.ok(pipeline.some((stage) => stage.$replaceRoot));
  assert.equal(pipeline.some((stage) => stage.$limit), false);
});

test('exact allocation query retains current version even when a future/stale candidate exists', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const order = fixture.orders.find((_row, index) => Math.floor(index / 5) % 10 === 7);
  const legacy = await resolve(fixture, [order], false);
  const optimized = await resolve(fixture, [order], true);
  assert.deepEqual(financialSnapshot(optimized.result.states), financialSnapshot(legacy.result.states));
  assert.equal(optimized.result.states[0].stalePaymentAllocationIgnored, true);
  assert.ok(optimized.result.states[0].diagnostics.some((row) => row.code === 'ALLOCATION_STALE'));
});

test('optimized latest-state path is not truncated by legacy candidate cap', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const optimized = await resolve(fixture, fixture.orders.slice(0, 100), true, 10);
  assert.equal(optimized.result.states.length, 100);
  assert.ok(optimized.result.versionsByKey._candidateRowsRead >= 100);
});

test('zero and NaN inputs keep legacy/canonical guard parity', async () => {
  const fixture = buildPerfA3aFixture(10000);
  const zeroOrder = fixture.orders.find((row) => row.totalAmount === 0);
  const nanOrder = fixture.orders.find((row) => row.bankAmount === 'NaN');
  const legacy = await resolve(fixture, [zeroOrder, nanOrder], false);
  const optimized = await resolve(fixture, [zeroOrder, nanOrder], true);
  assert.deepEqual(financialSnapshot(optimized.result.states), financialSnapshot(legacy.result.states));
  assert.equal(optimized.result.states[0].receivableAmount, 0);
  assert.ok(Number.isFinite(optimized.result.states[1].debtAmount));
});
