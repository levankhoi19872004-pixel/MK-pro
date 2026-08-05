'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');
const benchmark = require('../scripts/performance/benchmark-canonical-delivery-financial-read-model');

function chain(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    session() { return this; },
    async lean() { return rows; }
  };
}

function model(name, rows, counters) {
  const result = {
    find() {
      counters.find[name] = (counters.find[name] || 0) + 1;
      return chain(rows);
    }
  };
  for (const method of ['save', 'create', 'insert', 'insertMany', 'updateOne', 'updateMany', 'findOneAndUpdate', 'bulkWrite', 'deleteOne', 'deleteMany']) {
    result[method] = () => {
      counters.write[method] = (counters.write[method] || 0) + 1;
      throw new Error(`unexpected write ${method}`);
    };
  }
  return result;
}

function fixture(size) {
  const orders = [];
  const versions = [];
  const allocations = [];
  const returns = [];
  for (let index = 0; index < size; index += 1) {
    const id = `SO-${index}`;
    const code = `B${String(index).padStart(6, '0')}`;
    orders.push({ id, _id: id, code, orderCode: code, tenantId: 'TENANT-A', totalAmount: 10000 });
    versions.push({ id: `V-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', closeoutVersion: 1, status: 'corrected_confirmed', originalAmount: 10000, cashAmount: 1000 });
    allocations.push({ allocationCode: `OPA-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', sourceVersion: 1, status: 'posted', receivableAmount: 10000, cashAmount: 1000 });
    if (index % 2 === 0) returns.push({ id: `RO-${index}`, orderId: id, orderCode: code, tenantId: 'TENANT-A', status: 'waiting_receive', amount: 500 });
  }
  return { orders, versions, allocations, returns };
}

async function run(size, options = {}) {
  const data = fixture(size);
  const counters = { find: {}, write: {} };
  const models = {
    DeliveryCloseoutVersion: model('versions', options.versions || data.versions, counters),
    OrderPaymentAllocation: model('allocations', options.allocations || data.allocations, counters),
    ReturnOrder: model('returns', options.returns || data.returns, counters)
  };
  const result = await resolver.resolvePaymentStatesForOrders(data.orders, { models, includeReturnState: true, ...options.resolverOptions });
  return { result, counters };
}

for (const [id, size] of [['PERF-001', 1], ['PERF-002', 10], ['PERF-003', 100], ['PERF-004', 1000]]) {
  test(`${id}: ${size} orders use exactly three canonical join queries`, async () => {
    const { result, counters } = await run(size);
    assert.equal(result.states.length, size);
    assert.deepEqual(counters.find, { versions: 1, allocations: 1, returns: 1 });
  });
}

test('PERF-005: empty list uses zero join queries', async () => {
  const counters = { find: {}, write: {} };
  const failModel = model('unexpected', [], counters);
  const result = await resolver.resolvePaymentStatesForOrders([], {
    models: { DeliveryCloseoutVersion: failModel, OrderPaymentAllocation: failModel, ReturnOrder: failModel }
  });
  assert.equal(result.states.length, 0);
  assert.deepEqual(counters.find, {});
});

test('PERF-006: query count is constant and no model find occurs inside an order loop', async () => {
  const one = await run(1);
  const thousand = await run(1000);
  assert.equal(Object.values(one.counters.find).reduce((sum, value) => sum + value, 0), 3);
  assert.equal(Object.values(thousand.counters.find).reduce((sum, value) => sum + value, 0), 3);
});

let gate4BenchmarkPromise;
function gate4Benchmark() {
  if (!gate4BenchmarkPromise) gate4BenchmarkPromise = benchmark.runBenchmark({ sizes: [100, 1000], warmup: 1, iterations: 3, seed: 261 });
  return gate4BenchmarkPromise;
}

test('PERF-007: p50 stays within the approved budget', async () => {
  const report = await gate4Benchmark();
  assert.ok(report.results.every((row) => row.p50Ms <= row.p95Ms));
});

test('PERF-008: p95 stays within the approved budget', async () => {
  const report = await gate4Benchmark();
  assert.ok(report.results.every((row) => row.latencyPass), JSON.stringify(report.results));
});

test('PERF-009: heap delta stays within the approved budget', async () => {
  const report = await gate4Benchmark();
  assert.ok(report.results.every((row) => row.heapPass), JSON.stringify(report.results));
});

test('PERF-010: payload stays within the absolute response budget', async () => {
  const report = await gate4Benchmark();
  assert.ok(report.results.every((row) => row.payloadPass), JSON.stringify(report.results));
});

test('PERF-011: candidate cap fails closed instead of truncating', async () => {
  await assert.rejects(
    run(1, {
      versions: [
        { id: 'V-1', orderId: 'SO-0', orderCode: 'B000000', closeoutVersion: 1, status: 'corrected_confirmed' },
        { id: 'V-2', orderId: 'SO-0', orderCode: 'B000000', closeoutVersion: 2, status: 'corrected_confirmed' }
      ],
      resolverOptions: { maxPaymentCandidates: 1 }
    }),
    { code: 'CANONICAL_FINANCIAL_PAYMENT_CANDIDATE_LIMIT_EXCEEDED' }
  );
});

test('PERF-012: canonical GET-style financial read performs zero writes', async () => {
  const { counters } = await run(100);
  assert.deepEqual(counters.write, {});
});
