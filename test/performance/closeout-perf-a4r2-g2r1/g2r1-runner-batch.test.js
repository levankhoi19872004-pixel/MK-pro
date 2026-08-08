'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRunner({ batchEnabled = false, retryCallback = false, flushError = null } = {}) {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutTransactionRunner');
  delete require.cache[target];
  const events = [];
  let flushCalls = 0;
  const session = { id: 'tx-session' };
  const batchService = {
    flushFinalAllocationUpdatePlans: async (plans, options) => {
      flushCalls += 1;
      events.push(`flush:${plans.length}`);
      assert.equal(options.session, session);
      if (flushError) throw flushError;
      return { commandCount: 1, operationCount: plans.length, matchedCount: plans.length };
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../../utils/transaction.util') {
      return {
        withMongoTransaction: async (work) => {
          if (retryCallback) {
            events.push('tx-attempt-1');
            await work(session);
            events.push('tx-attempt-2');
            return work(session);
          }
          return work(session);
        }
      };
    }
    if (request === './CloseoutCriticalReader') {
      return { loadCriticalOrdersAndReturns: async (orders) => ({ orders, returnOrders: [] }) };
    }
    if (request === '../../master-order/masterOrderIdentity.util') {
      return { compactDeliveryOrderKeys: (order) => [String(order.id || order.code || '')].filter(Boolean) };
    }
    if (request === '../../../observability/closeoutQueryAudit') {
      return {
        withTransactionAttempt: (fn) => fn(),
        withCloseoutAuditStage: (_name, fn) => fn(),
        withCloseoutOrder: (_index, _count, fn) => fn()
      };
    }
    if (request === '../../../config/featureFlags') {
      return { FLAGS: { closeoutArBalanceBatchV1: () => false, closeoutAllocationPostedRefsBatchV1: () => batchEnabled } };
    }
    if (request === '../OrderPaymentAllocationService') return batchService;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return { runner: require(target), events, getFlushCalls: () => flushCalls, session, batchService }; }
  finally { Module._load = originalLoad; }
}

function orders(n) { return Array.from({ length: n }, (_, i) => ({ id: `SO${i + 1}`, code: `B${i + 1}` })); }

function confirmHarness(events) {
  return async (order, _returns, options) => {
    events.push(`confirm:${order.id}`);
    if (options.deferFinalAllocationUpdate) {
      options.collectFinalAllocationUpdatePlan(Object.freeze({
        idempotencyKey: `OPA:${order.id}`,
        filter: Object.freeze({ idempotencyKey: `OPA:${order.id}` }),
        update: Object.freeze({ $set: Object.freeze({ postedArLedgerIds: Object.freeze([`AR:${order.id}`]), status: 'posted' }) })
      }));
    }
    return { confirmed: true, orderId: order.id, affectedSourceId: order.id, affectedCustomerCode: `C-${order.id}`, readModelSyncNeeded: true };
  };
}

test('G2R1 feature flag defaults OFF in production config', () => {
  const flags = require('../../../src/config/featureFlags');
  const previous = process.env.PERF_CLOSEOUT_ALLOCATION_POSTEDREFS_BATCH_V1;
  delete process.env.PERF_CLOSEOUT_ALLOCATION_POSTEDREFS_BATCH_V1;
  try { assert.equal(flags.FLAGS.closeoutAllocationPostedRefsBatchV1(), false); }
  finally {
    if (previous === undefined) delete process.env.PERF_CLOSEOUT_ALLOCATION_POSTEDREFS_BATCH_V1;
    else process.env.PERF_CLOSEOUT_ALLOCATION_POSTEDREFS_BATCH_V1 = previous;
  }
});

test('G2R1 flag OFF preserves immediate per-order path and performs no batch flush', async () => {
  const h = loadRunner({ batchEnabled: false });
  const results = [];
  let sawDeferred = false;
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders(5), results,
    confirmOneOrder: async (order, returns, options) => {
      sawDeferred ||= options.deferFinalAllocationUpdate === true;
      return confirmHarness(h.events)(order, returns, options);
    },
    assertReturnOrdersInventoryReady: () => {}, perOrderOptions: { allocationBatchService: h.batchService }
  });
  assert.equal(sawDeferred, false);
  assert.equal(h.getFlushCalls(), 0);
  assert.equal(out.results.length, 5);
  assert.equal(out.allocationPostedRefsBatch.enabled, false);
});

test('G2R1 flag ON flushes only after all orders completed and uses one transactional batch', async () => {
  const h = loadRunner({ batchEnabled: true });
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders(5), results: [], confirmOneOrder: confirmHarness(h.events), assertReturnOrdersInventoryReady: () => {}, perOrderOptions: { allocationBatchService: h.batchService }
  });
  assert.deepEqual(h.events.slice(0, 6), ['confirm:SO1','confirm:SO2','confirm:SO3','confirm:SO4','confirm:SO5','flush:5']);
  assert.equal(h.getFlushCalls(), 1);
  assert.deepEqual(out.allocationPostedRefsBatch, { enabled: true, planned: 5, commandCount: 1, operationCount: 5, matchedCount: 5 });
  assert.equal(out.results.length, 5);
});

test('G2R1 forced bulkWrite failure propagates and prevents a successful transaction result', async () => {
  const h = loadRunner({ batchEnabled: true, flushError: Object.assign(new Error('forced bulk failure'), { code: 'FORCED_BULK' }) });
  await assert.rejects(() => h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders(5), results: [], confirmOneOrder: confirmHarness(h.events), assertReturnOrdersInventoryReady: () => {}, perOrderOptions: { allocationBatchService: h.batchService }
  }), (err) => err && err.code === 'FORCED_BULK');
  assert.equal(h.getFlushCalls(), 1);
});

test('G2R1 transient transaction callback retry does not duplicate published results/plans', async () => {
  const h = loadRunner({ batchEnabled: true, retryCallback: true });
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders(5), results: [], confirmOneOrder: confirmHarness(h.events), assertReturnOrdersInventoryReady: () => {}, perOrderOptions: { allocationBatchService: h.batchService }
  });
  assert.equal(h.getFlushCalls(), 2, 'each transaction callback attempt sends its own batch command');
  assert.equal(out.results.length, 5, 'only final successful attempt is published');
  assert.equal(new Set(out.results.map((row) => row.orderId)).size, 5);
  assert.equal(out.allocationPostedRefsBatch.planned, 5);
});
