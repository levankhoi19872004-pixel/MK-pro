'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRunner({ arBulk = true, allocationBatch = true } = {}) {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutTransactionRunner');
  delete require.cache[target];
  const events = [];
  let txCount = 0;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../../utils/transaction.util') return { withMongoTransaction: async (fn) => { txCount += 1; return fn({ id: `tx-${txCount}` }); } };
    if (request === './CloseoutCriticalReader') return { loadCriticalOrdersAndReturns: async (orders) => ({ orders, returnOrders: [] }) };
    if (request === '../../master-order/masterOrderIdentity.util') return { compactDeliveryOrderKeys: (order) => [order.id] };
    if (request === '../../../observability/closeoutQueryAudit') return { withTransactionAttempt: (fn) => fn(), withCloseoutAuditStage: (_n, fn) => fn(), withCloseoutOrder: (_i, _n, fn) => fn() };
    if (request === '../../../config/featureFlags') return { FLAGS: { closeoutArBalanceBatchV1: () => false, closeoutAllocationPostedRefsBatchV1: () => allocationBatch, closeoutArWriteBulkV1: () => arBulk } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return { runner: require(target), events, getTxCount: () => txCount }; }
  finally { Module._load = originalLoad; }
}

function orders(n) { return Array.from({ length: n }, (_, i) => ({ id: `SO${i + 1}`, code: `B${i + 1}` })); }
function intent(order, n) { return { id: `AR-${order.id}-${n}`, code: `AR-${order.id}-${n}`, idempotencyKey: `K:${order.id}:${n}`, category: n === 1 ? 'AR-SALE' : n === 2 ? 'AR-RECEIPT-CASH' : 'AR-REWARD-ALLOWANCE' }; }

test('G4 runner phase: prepare all -> one AR batch -> finalize all -> one allocation flush', async () => {
  const h = loadRunner({ arBulk: true, allocationBatch: true });
  const arBatchService = {
    async postEligibleArIntentsBatch(rows, { session }) {
      h.events.push(`ar-batch:${rows.length}:${session.id}`);
      const entries = rows.map((row) => ({ ...row, _id: `mongo-${row.id}` }));
      const postingResults = entries.map((entry) => ({ idempotencyKey: entry.idempotencyKey, category: entry.category, created: true, alreadyExists: false, reasonCode: 'POSTED', entry }));
      return { entries, postingResults, telemetry: { arPreflightReadCommands: 1, arBulkWriteCommands: 1, arReadbackCommands: 1, legacyArWriteCommands: 0, bulkOperationCount: rows.length } };
    }
  };
  const allocationBatchService = { async flushFinalAllocationUpdatePlans(plans, { session }) { h.events.push(`alloc-batch:${plans.length}:${session.id}`); return { commandCount: 1, operationCount: plans.length, matchedCount: plans.length }; } };
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders(5), results: [], assertReturnOrdersInventoryReady: () => {}, confirmOneOrder: async () => { throw new Error('legacy path must not run'); },
    prepareOneOrderForArBulk: async (order, _returns, options) => { h.events.push(`prepare:${order.id}`); return { order, expectedArLedgers: [intent(order,1), intent(order,2), intent(order,3)], allocationOptions: options }; },
    finalizePreparedOrderAfterArBulk: async (prepared, rows, options) => { h.events.push(`finalize:${prepared.order.id}:${rows.length}`); if (options.deferFinalAllocationUpdate) options.collectFinalAllocationUpdatePlan({ idempotencyKey: `OPA:${prepared.order.id}`, update: { $set: { status: 'posted' } } }); return { confirmed: true, orderId: prepared.order.id, affectedSourceId: prepared.order.id, affectedCustomerCode: `C-${prepared.order.id}`, readModelSyncNeeded: true }; },
    perOrderOptions: { arBatchService, allocationBatchService }
  });
  assert.deepEqual(h.events.slice(0,5), ['prepare:SO1','prepare:SO2','prepare:SO3','prepare:SO4','prepare:SO5']);
  assert.equal(h.events[5].startsWith('ar-batch:15:'), true);
  assert.deepEqual(h.events.slice(6,11), ['finalize:SO1:3','finalize:SO2:3','finalize:SO3:3','finalize:SO4:3','finalize:SO5:3']);
  assert.equal(h.events[11].startsWith('alloc-batch:5:'), true);
  assert.equal(out.results.length, 5);
  assert.equal(out.arBulk.arPreflightReadCommands, 1);
  assert.equal(out.arBulk.arBulkWriteCommands, 1);
  assert.equal(out.arBulk.arReadbackCommands, 1);
  assert.equal(out.allocationPostedRefsBatch.commandCount, 1);
  assert.equal(out.arBulk.allocationBulkCommands, 1);
  assert.equal(out.arBulk.transactionCount, 1);
});

test('G4 runner race: idempotency E11000 retries the whole transaction once with fresh prepare/preflight', async () => {
  const h = loadRunner({ arBulk: true, allocationBatch: false });
  let batchAttempt = 0;
  let prepareCount = 0;
  const arBatchService = { async postEligibleArIntentsBatch(rows) { batchAttempt += 1; h.events.push(`batch-attempt:${batchAttempt}`); if (batchAttempt === 1) { const e = Object.assign(new Error('duplicate race'), { code: 11000, arBatchRetryWholeTransaction: true }); throw e; } const entries = rows.map((r) => ({ ...r, _id: `mongo-${r.id}` })); return { entries, postingResults: entries.map((entry) => ({ ...entry, entry, created: false, alreadyExists: true })), telemetry: { arPreflightReadCommands: 1, arBulkWriteCommands: 0, arReadbackCommands: 0, bulkOperationCount: 0 } }; } };
  const out = await h.runner.runCloseoutTransaction({
    pendingConfirmOrders: orders(2), results: [], assertReturnOrdersInventoryReady: () => {}, confirmOneOrder: async () => {},
    prepareOneOrderForArBulk: async (order, _r, options) => { prepareCount += 1; return { order, expectedArLedgers: [intent(order,1)], allocationOptions: options }; },
    finalizePreparedOrderAfterArBulk: async (prepared) => ({ confirmed: true, orderId: prepared.order.id }),
    perOrderOptions: { arBatchService }
  });
  assert.equal(h.getTxCount(), 2);
  assert.equal(batchAttempt, 2);
  assert.equal(prepareCount, 4, 'fresh whole-transaction attempt must rerun prepare for all orders');
  assert.equal(out.results.length, 2);
  assert.equal(out.arBulk.wholeTransactionRaceRetries, 1);
  assert.equal(out.arBulk.transactionCount, 2);
});
