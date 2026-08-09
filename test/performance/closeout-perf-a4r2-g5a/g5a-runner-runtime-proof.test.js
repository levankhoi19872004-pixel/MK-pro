'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRunner({ arBulk }) {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutTransactionRunner');
  delete require.cache[target];
  let runtimeSummary = null;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../../utils/transaction.util') return { withMongoTransaction: async (fn) => fn({ id: 'g5a-session' }) };
    if (request === './CloseoutCriticalReader') return { loadCriticalOrdersAndReturns: async (orders) => ({ orders, returnOrders: [] }) };
    if (request === '../../master-order/masterOrderIdentity.util') return { compactDeliveryOrderKeys: (order) => [order.id] };
    if (request === '../../../observability/closeoutQueryAudit') return {
      withTransactionAttempt: (fn) => fn(),
      withCloseoutAuditStage: (_n, fn) => fn(),
      withCloseoutOrder: (_i, _n, fn) => fn(),
      recordRuntimeExecutionSummary: (summary) => { runtimeSummary = JSON.parse(JSON.stringify(summary)); }
    };
    if (request === '../../../config/featureFlags') return { FLAGS: {
      closeoutArBalanceBatchV1: () => false,
      closeoutAllocationPostedRefsBatchV1: () => true,
      closeoutArWriteBulkV1: () => arBulk
    } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return { runner: require(target), getRuntimeSummary: () => runtimeSummary }; }
  finally { Module._load = originalLoad; }
}

function intent(order, n) {
  const categories = ['AR-SALE','AR-RECEIPT-CASH','AR-REWARD-ALLOWANCE'];
  return { id: `AR-${order.id}-${n}`, code: `AR-${order.id}-${n}`, idempotencyKey: `K:${order.id}:${n}`, category: categories[n - 1] };
}

test('G5A runtime proof: AR bulk ON emits 1 preflight + 1 bulk + 1 readback + 0 legacy writes', async () => {
  const h = loadRunner({ arBulk: true });
  const orders = [{ id: 'SO1' }, { id: 'SO2' }];
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders,
    results: [],
    assertReturnOrdersInventoryReady: () => {},
    confirmOneOrder: async () => { throw new Error('legacy path must not run'); },
    prepareOneOrderForArBulk: async (order) => ({ order, expectedArLedgers: [intent(order,1), intent(order,2), intent(order,3)] }),
    finalizePreparedOrderAfterArBulk: async (prepared, _rows, options) => {
      if (options.deferFinalAllocationUpdate) options.collectFinalAllocationUpdatePlan({ idempotencyKey: `OPA:${prepared.order.id}`, update: { $set: { status: 'posted' } } });
      return { confirmed: true, orderId: prepared.order.id };
    },
    perOrderOptions: {
      arBatchService: { async postEligibleArIntentsBatch(rows) {
        const entries = rows.map((row) => ({ ...row, _id: `mongo-${row.id}` }));
        return { entries, postingResults: entries.map((entry) => ({ idempotencyKey: entry.idempotencyKey, entry })), telemetry: { arPreflightReadCommands: 1, arBulkWriteCommands: 1, arReadbackCommands: 1, legacyArWriteCommands: 0, bulkOperationCount: rows.length } };
      } },
      allocationBatchService: { async flushFinalAllocationUpdatePlans(plans) { return { commandCount: 1, operationCount: plans.length, matchedCount: plans.length }; } }
    }
  });
  const summary = h.getRuntimeSummary();
  assert.ok(summary);
  assert.equal(summary.arBulk.enabled, true);
  assert.equal(summary.arBulk.intentCount, 6);
  assert.equal(summary.arBulk.arPreflightReadCommands, 1);
  assert.equal(summary.arBulk.arBulkWriteCommands, 1);
  assert.equal(summary.arBulk.arReadbackCommands, 1);
  assert.equal(summary.arBulk.legacyArWriteCommands, 0);
  assert.equal(summary.allocationPostedRefsBatch.commandCount, 1);
  assert.equal(summary.arBalanceBatch.enabled, false);
  assert.equal(out.arBulk.arBulkWriteCommands, 1);
});

test('G5A runtime proof: AR bulk OFF emits legacy mode and zero bulk/readback commands', async () => {
  const h = loadRunner({ arBulk: false });
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: [{ id: 'SO1' }],
    results: [],
    assertReturnOrdersInventoryReady: () => {},
    confirmOneOrder: async (order, _returns, options) => {
      if (options.deferFinalAllocationUpdate) options.collectFinalAllocationUpdatePlan({ idempotencyKey: `OPA:${order.id}`, update: { $set: { status: 'posted' } } });
      return { confirmed: true, orderId: order.id, persistence: { legacyArWriteCommands: 3 } };
    },
    prepareOneOrderForArBulk: async () => { throw new Error('bulk prepare must not run'); },
    finalizePreparedOrderAfterArBulk: async () => { throw new Error('bulk finalize must not run'); },
    perOrderOptions: { allocationBatchService: { async flushFinalAllocationUpdatePlans(plans) { return { commandCount: 1, operationCount: plans.length, matchedCount: plans.length }; } } }
  });
  const summary = h.getRuntimeSummary();
  assert.ok(summary);
  assert.equal(summary.arBulk.enabled, false);
  assert.equal(summary.arBulk.arBulkWriteCommands, 0);
  assert.equal(summary.arBulk.arReadbackCommands, 0);
  assert.equal(summary.arBulk.legacyArWriteCommands, 3);
  assert.equal(out.arBulk.enabled, false);
});
