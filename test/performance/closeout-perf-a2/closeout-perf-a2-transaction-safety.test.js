'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRunnerHarness() {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutTransactionRunner');
  delete require.cache[target];
  const originalLoad = Module._load;
  const state = { transactions: 0, commits: 0, rollbacks: 0 };
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../../utils/transaction.util') return {
      withMongoTransaction: async (fn) => {
        state.transactions += 1;
        try {
          const result = await fn({ id: 'SESSION-A2' });
          state.commits += 1;
          return result;
        } catch (err) {
          state.rollbacks += 1;
          throw err;
        }
      }
    };
    if (request === './CloseoutCriticalReader') return {
      loadCriticalOrdersAndReturns: async () => ({
        orders: [{ id: 'SO1', orderCode: 'SO1' }],
        returnOrders: []
      })
    };
    if (request === '../../master-order/masterOrderIdentity.util') return {
      compactDeliveryOrderKeys: (row) => [row.id, row.orderCode].filter(Boolean)
    };
    if (request === '../../../observability/closeoutQueryAudit') return {
      withTransactionAttempt: (fn) => fn(),
      withCloseoutAuditStage: (_name, fn) => fn(),
      withCloseoutOrder: (_index, _total, fn) => fn()
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return { runner: require(target), state };
  } finally {
    Module._load = originalLoad;
  }
}

test('CL-A2-REQ-010/011: closeout transaction failure propagates and reaches rollback boundary', async () => {
  const h = loadRunnerHarness();
  const results = [];
  await assert.rejects(
    () => h.runner.runCloseoutTransaction({
      pendingConfirmOrders: [{ id: 'SO1', orderCode: 'SO1' }],
      results,
      assertReturnOrdersInventoryReady: () => {},
      confirmOneOrder: async (_order, _returns, options) => {
        assert.equal(options.session.id, 'SESSION-A2');
        const err = new Error('forced writer failure');
        err.code = 'FORCED_WRITER_FAILURE';
        throw err;
      }
    }),
    (err) => err && err.code === 'FORCED_WRITER_FAILURE'
  );
  assert.equal(h.state.transactions, 1);
  assert.equal(h.state.commits, 0);
  assert.equal(h.state.rollbacks, 1);
  assert.equal(results.length, 0);
});

test('CL-A2-REQ-010/011: successful writers share one transaction session and commit once', async () => {
  const h = loadRunnerHarness();
  const seenSessions = [];
  const result = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: [{ id: 'SO1', orderCode: 'SO1' }],
    results: [],
    assertReturnOrdersInventoryReady: () => {},
    confirmOneOrder: async (order, _returns, options) => {
      seenSessions.push(options.session.id);
      return { confirmed: true, orderId: order.id, readModelSyncNeeded: false };
    }
  });
  assert.deepEqual(seenSessions, ['SESSION-A2']);
  assert.equal(h.state.transactions, 1);
  assert.equal(h.state.commits, 1);
  assert.equal(h.state.rollbacks, 0);
  assert.equal(result.results.length, 1);
});
