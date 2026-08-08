'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRunner({ arBulk, allocationBatch }) {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutTransactionRunner');
  delete require.cache[target];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../../utils/transaction.util') return { withMongoTransaction: async (fn) => fn({ id: 'matrix-session' }) };
    if (request === './CloseoutCriticalReader') return { loadCriticalOrdersAndReturns: async (orders) => ({ orders, returnOrders: [] }) };
    if (request === '../../master-order/masterOrderIdentity.util') return { compactDeliveryOrderKeys: (order) => [order.id] };
    if (request === '../../../observability/closeoutQueryAudit') return { withTransactionAttempt: (fn) => fn(), withCloseoutAuditStage: (_n, fn) => fn(), withCloseoutOrder: (_i, _n, fn) => fn() };
    if (request === '../../../config/featureFlags') return { FLAGS: { closeoutArBalanceBatchV1: () => false, closeoutAllocationPostedRefsBatchV1: () => allocationBatch, closeoutArWriteBulkV1: () => arBulk } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(target); } finally { Module._load = originalLoad; }
}

function intent(order) {
  return { id: `AR-${order.id}`, code: `AR-${order.id}`, idempotencyKey: `K:${order.id}`, category: 'AR-SALE' };
}

async function run(arBulk, allocationBatch) {
  const runner = loadRunner({ arBulk, allocationBatch });
  const finalState = (order) => ({
    confirmed: true,
    orderId: order.id,
    finalDebtAmount: 0,
    rewardAmount: 185000,
    returnAmount: 0,
    paymentAllocation: { idempotencyKey: `OPA:${order.id}`, status: 'posted', postedArLedgerIds: [`AR-${order.id}`] },
    persistence: { legacyArWriteCommands: arBulk ? 0 : 1 }
  });
  return runner.runCloseoutTransaction({
    pendingConfirmOrders: [{ id: 'SO1' }],
    results: [],
    assertReturnOrdersInventoryReady: () => {},
    confirmOneOrder: async (order, _returns, options) => {
      if (options.deferFinalAllocationUpdate) options.collectFinalAllocationUpdatePlan({ idempotencyKey: `OPA:${order.id}`, update: { $set: { status: 'posted', postedArLedgerIds: [`AR-${order.id}`] } } });
      return finalState(order);
    },
    prepareOneOrderForArBulk: async (order, _returns, options) => ({ order, expectedArLedgers: [intent(order)], allocationOptions: options }),
    finalizePreparedOrderAfterArBulk: async (prepared, _rows, options) => {
      if (options.deferFinalAllocationUpdate) options.collectFinalAllocationUpdatePlan({ idempotencyKey: `OPA:${prepared.order.id}`, update: { $set: { status: 'posted', postedArLedgerIds: [`AR-${prepared.order.id}`] } } });
      return finalState(prepared.order);
    },
    perOrderOptions: {
      arBatchService: { async postEligibleArIntentsBatch(rows) { const entries = rows.map((r) => ({ ...r, _id: `mongo-${r.id}` })); return { entries, postingResults: entries.map((entry) => ({ idempotencyKey: entry.idempotencyKey, entry, created: true })), telemetry: { arPreflightReadCommands: 1, arBulkWriteCommands: 1, arReadbackCommands: 1, legacyArWriteCommands: 0, bulkOperationCount: rows.length } }; } },
      allocationBatchService: { async flushFinalAllocationUpdatePlans(plans) { return { commandCount: 1, operationCount: plans.length, matchedCount: plans.length }; } }
    }
  });
}

test('G4 2x2 feature matrix preserves final financial/allocation state while only command path changes', async () => {
  const combos = [[false,false],[false,true],[true,false],[true,true]];
  const outputs = [];
  for (const [arBulk, allocationBatch] of combos) outputs.push({ arBulk, allocationBatch, out: await run(arBulk, allocationBatch) });
  const canonical = (o) => ({ results: o.results.map((r) => ({ orderId:r.orderId, finalDebtAmount:r.finalDebtAmount, rewardAmount:r.rewardAmount, returnAmount:r.returnAmount, paymentAllocation:r.paymentAllocation })) });
  const expected = canonical(outputs[0].out);
  for (const row of outputs) assert.deepEqual(canonical(row.out), expected);
  assert.equal(outputs[0].out.arBulk.enabled, false);
  assert.equal(outputs[1].out.allocationPostedRefsBatch.commandCount, 1);
  assert.equal(outputs[2].out.arBulk.arBulkWriteCommands, 1);
  assert.equal(outputs[3].out.arBulk.arBulkWriteCommands, 1);
  assert.equal(outputs[3].out.allocationPostedRefsBatch.commandCount, 1);
});
