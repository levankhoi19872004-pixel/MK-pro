'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function withPatchedLoad(stubs, loadFn) {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return loadFn(); } finally { Module._load = originalLoad; }
}

function loadDebtHarness(flagValue, options = {}) {
  const target = require.resolve('../../../src/services/accounting/OrderPaymentDebtReconcileService');
  delete require.cache[target];
  const previous = process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
  process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = flagValue;
  const counters = { balanceReads: 0, idempotencyReads: 0, posts: 0 };
  let currentBalance = Number(options.initialBalance || 0);
  const service = withPatchedLoad({
    '../arLedgerRead.service': {
      inspectActiveDebtReadModelLedgersByOrderKeys: async () => {
        counters.balanceReads += 1;
        return {
          lookupKeys: ['SO-A2'],
          rawMatchedLedgerCount: currentBalance ? 1 : 0,
          rawActiveConfirmedLedgerCount: currentBalance ? 1 : 0,
          canonicalMatchedLedgerCount: currentBalance ? 1 : 0,
          excludedLedgerCount: 0,
          canonicalLedgers: currentBalance ? [{ debit: currentBalance, credit: 0, active: true, accountingConfirmed: true, accountingStatus: 'confirmed' }] : [],
          rawActiveConfirmedLedgers: [],
          excludedLedgers: []
        };
      },
      getCanonicalLedgersByRawMatch: async () => {
        counters.idempotencyReads += 1;
        return options.idempotencyRows || [];
      }
    },
    '../arPosting.service': {
      postArLedgerEntry: async (row) => {
        counters.posts += 1;
        currentBalance += Number(row.debit || 0) - Number(row.credit || 0);
        return { ...row };
      }
    },
    './OrderPaymentAllocationService': {
      computeDebtBreakdown(allocation = {}, opts = {}) {
        const tolerance = Number(opts.zeroTolerance ?? allocation.zeroTolerance ?? 1000);
        const raw = Math.round(Number(allocation.receivableAmount || 0)
          - Number(allocation.cashAmount || 0)
          - Number(allocation.bankAmount || 0)
          - Number(allocation.rewardAmount || 0)
          - Number(allocation.returnAmount || 0));
        const normalized = Math.abs(raw) <= tolerance ? 0 : Math.max(0, raw);
        return {
          rawDebtAmount: raw,
          normalizedDebtAmount: normalized,
          debtAmount: normalized,
          zeroTolerance: tolerance,
          zeroToleranceApplied: raw !== normalized,
          zeroToleranceAdjustmentAmount: raw - normalized
        };
      }
    },
    '../../observability/closeoutQueryAudit': {
      withCloseoutAuditStage: (_name, fn) => fn(),
      updateCardinality: () => {}
    }
  }, () => require(target));
  return {
    service,
    counters,
    restore() {
      delete require.cache[target];
      if (previous === undefined) delete process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
      else process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = previous;
    }
  };
}

function fixtureAllocation(overrides = {}) {
  return {
    allocationCode: 'OPA-A2', idempotencyKey: 'OPA-A2-IDEM',
    orderId: 'SO-A2', orderCode: 'SO-A2', customerCode: 'C-A2',
    sourceVersion: 1, receivableAmount: 688113, cashAmount: 503000,
    bankAmount: 0, rewardAmount: 185000, returnAmount: 0,
    deliveryDate: '2026-08-07',
    ...overrides
  };
}

const fixtureOrder = { id: 'SO-A2', _id: 'SO-A2', orderCode: 'SO-A2', customerCode: 'C-A2', deliveryDate: '2026-08-07' };

test('CL-A2-REQ-001: flag ON no-debt path performs zero idempotency reads', async () => {
  const h = loadDebtHarness('1');
  try {
    const result = await h.service.reconcileOneOrder({ order: fixtureOrder, allocation: fixtureAllocation(), apply: true });
    assert.equal(result.skipReason, 'NO_DEBT_DELTA');
    assert.equal(h.counters.idempotencyReads, 0);
    assert.equal(h.counters.posts, 0);
    assert.equal(h.counters.balanceReads, 1);
  } finally { h.restore(); }
});

test('CL-A2-REQ-001: flag OFF preserves legacy initial Q17 read', async () => {
  const h = loadDebtHarness('0');
  try {
    const result = await h.service.reconcileOneOrder({ order: fixtureOrder, allocation: fixtureAllocation(), apply: true });
    assert.equal(result.skipReason, 'NO_DEBT_DELTA');
    assert.equal(h.counters.idempotencyReads, 1);
    assert.equal(h.counters.posts, 0);
  } finally { h.restore(); }
});

test('CL-A2-REQ-001/011: adjustment mutation keeps exactly one fresh pre-post idempotency read', async () => {
  const h = loadDebtHarness('1');
  try {
    const result = await h.service.reconcileOneOrder({
      order: fixtureOrder,
      allocation: fixtureAllocation({ receivableAmount: 5000, cashAmount: 0, rewardAmount: 0 }),
      apply: true
    });
    assert.equal(result.posted, true);
    assert.equal(h.counters.idempotencyReads, 1);
    assert.equal(h.counters.posts, 1);
    assert.equal(h.counters.balanceReads, 3); // initial + safety + after-post verification
  } finally { h.restore(); }
});

function loadSyncServiceHarness(bulkBehavior) {
  const target = require.resolve('../../../src/services/readModelSyncJob.service');
  delete require.cache[target];
  const counters = { updateOne: 0, bulkWrite: 0, operations: [] };
  const model = {
    updateOne: async () => { counters.updateOne += 1; return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; },
    bulkWrite: async (ops) => {
      counters.bulkWrite += 1;
      counters.operations.push(ops);
      if (bulkBehavior) return bulkBehavior(counters.bulkWrite, ops);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: ops.length };
    },
    findOneAndUpdate: () => ({ lean: async () => null })
  };
  const service = withPatchedLoad({
    '../models/ReadModelSyncJob': model,
    './arDebtReadModelProjector.service': { projectArDebtReadModel: async () => ({ ok: true }) }
  }, () => require(target));
  return { service, counters };
}

function syncPayload(i) {
  return { customerCode: `C${i}`, sourceIds: [`SO${i}`], actor: 'a2', source: 'DELIVERY_CLOSEOUT' };
}

test('CL-A2-REQ-003: 60 distinct groups use one bulk Mongo command', async () => {
  const h = loadSyncServiceHarness();
  const result = await h.service.enqueueArDebtSyncJobsBulk(Array.from({ length: 60 }, (_, i) => syncPayload(i + 1)));
  assert.equal(h.counters.bulkWrite, 1);
  assert.equal(h.counters.operations[0].length, 60);
  assert.equal(result.queued, 60);
  assert.equal(result.jobs.length, 60);
});

test('CL-A2-REQ-003: duplicate group is idempotently deduplicated inside the bulk', async () => {
  const h = loadSyncServiceHarness();
  const p = syncPayload(1);
  const result = await h.service.enqueueArDebtSyncJobsBulk([p, p]);
  assert.equal(h.counters.bulkWrite, 1);
  assert.equal(h.counters.operations[0].length, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.jobs.length, 1);
});

test('CL-A2-REQ-004: malformed payload does not discard valid groups', async () => {
  const h = loadSyncServiceHarness();
  const result = await h.service.enqueueArDebtSyncJobsBulk([{}, syncPayload(1)]);
  assert.equal(h.counters.bulkWrite, 1);
  assert.equal(h.counters.operations[0].length, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'READ_MODEL_SYNC_PAYLOAD_SKIPPED');
});

test('CL-A2-REQ-004: bulk error retries whole idempotent batch once', async () => {
  const h = loadSyncServiceHarness(async (call, ops) => {
    if (call === 1) { const err = new Error('duplicate race'); err.code = 'E11000'; throw err; }
    return { acknowledged: true, upsertedCount: ops.length };
  });
  const result = await h.service.enqueueArDebtSyncJobsBulk([syncPayload(1), syncPayload(2)]);
  assert.equal(h.counters.bulkWrite, 2);
  assert.equal(result.retryAttempted, true);
  assert.equal(result.queued, 2);
});

test('CL-A2-REQ-004: permanent bulk failure exposes pending job keys for external retry', async () => {
  const h = loadSyncServiceHarness(async () => { const err = new Error('mongo down'); err.code = 'MONGO_DOWN'; throw err; });
  await assert.rejects(
    () => h.service.enqueueArDebtSyncJobsBulk([syncPayload(1), syncPayload(2)]),
    (err) => err && err.bulkRetryAttempted === true && err.pendingJobs.length === 2 && err.validGroupCount === 2
  );
  assert.equal(h.counters.bulkWrite, 2);
});

function loadContextHarness() {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutContextLoader');
  delete require.cache[target];
  const state = { metadataQueries: 0 };
  const deliveryReader = {
    loadMasterOrderMetadata: async (orders) => {
      state.metadataQueries += 1;
      const map = new Map();
      for (const order of orders) {
        map.set(order.id || order.orderCode, {
          verified: true,
          source: 'childOrderIds',
          master: { deliveryStaffCode: 'NV1' }
        });
      }
      return { metadataByOrderKey: map, masterRows: [{ id: 'MO1' }], queryExecuted: true };
    },
    metadataForOrder: (order, map) => map.get(order.id || order.orderCode) || null
  };
  const loader = withPatchedLoad({
    '../../../repositories/orderRepository': {},
    '../../../repositories/paymentRepository': {},
    '../../../repositories/fundLedgerRepository': {},
    '../../master-order/masterOrderReturn.impl': { findReturnOrdersForDeliveryChildren: async () => [] },
    '../../master-order/masterOrderIdentity.util': { compactDeliveryOrderKeys: (order) => [order.id, order.orderCode].filter(Boolean) },
    '../DeliveryCloseoutService': {},
    '../OrderPaymentAllocationService': {},
    '../OrderPaymentDebtReconcileService': {},
    '../../../observability/closeoutQueryAudit': { withCloseoutAuditStage: (_n, fn) => fn(), updateCardinality: () => {} },
    '../../../models/MasterOrder': {},
    '../../delivery/deliveryTodayCanonicalOrderReader': deliveryReader
  }, () => require(target));
  return { loader, state };
}

test('CL-A2-REQ-006: matching canonical SalesOrder assignment skips MasterOrder lookup', async () => {
  const previous = process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
  process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = '1';
  const h = loadContextHarness();
  try {
    const result = await h.loader.assertCloseoutDeliveryScope(
      { deliveryStaffCode: 'NV1' },
      [{ id: 'SO1', orderCode: 'SO1', deliveryStaffCode: 'NV1' }]
    );
    assert.equal(h.state.metadataQueries, 0);
    assert.equal(result.masterMetadataQueryExecuted, false);
  } finally {
    if (previous === undefined) delete process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1; else process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = previous;
  }
});

test('CL-A2-REQ-006: missing canonical assignment keeps MasterOrder fallback', async () => {
  const previous = process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
  process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = '1';
  const h = loadContextHarness();
  try {
    const result = await h.loader.assertCloseoutDeliveryScope(
      { deliveryStaffCode: 'NV1' },
      [{ id: 'SO1', orderCode: 'SO1' }]
    );
    assert.equal(h.state.metadataQueries, 1);
    assert.equal(result.masterMetadataQueryExecuted, true);
  } finally {
    if (previous === undefined) delete process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1; else process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = previous;
  }
});

test('CL-A2-REQ-006: mismatched stored assignment still queries metadata and rejects scope', async () => {
  const previous = process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
  process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = '1';
  const h = loadContextHarness();
  try {
    await assert.rejects(
      () => h.loader.assertCloseoutDeliveryScope(
        { deliveryStaffCode: 'NV1' },
        [{ id: 'SO1', orderCode: 'SO1', deliveryStaffCode: 'NV2' }]
      ),
      (err) => err && err.code === 'DELIVERY_CLOSEOUT_ORDER_SCOPE_MISMATCH'
    );
    assert.equal(h.state.metadataQueries, 1);
  } finally {
    if (previous === undefined) delete process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1; else process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = previous;
  }
});

function loadPostCommitHarness({ bulkEnabled, scheduleThrows = false } = {}) {
  const target = require.resolve('../../../src/services/accounting/closeout/CloseoutPostCommitHandler');
  delete require.cache[target];
  const state = { serialCalls: 0, bulkCalls: 0, scheduled: 0 };
  const syncService = {
    enqueueArDebtSyncJobs: async (payload) => {
      state.serialCalls += 1;
      return { queued: 1, jobs: [{ id: `S-${payload.customerCode}`, customerCode: payload.customerCode }] };
    },
    enqueueArDebtSyncJobsBulk: async (payloads) => {
      state.bulkCalls += 1;
      return { queued: payloads.length, jobs: payloads.map((p) => ({ id: `B-${p.customerCode}`, customerCode: p.customerCode })), warnings: [] };
    },
    scheduleDrain: () => {
      state.scheduled += 1;
      if (scheduleThrows) { const err = new Error('schedule failed'); err.code = 'SCHEDULE_FAILED'; throw err; }
      return { scheduled: true };
    }
  };
  const handler = withPatchedLoad({
    '../../readModelSyncJob.service': syncService,
    '../../../config/featureFlags': { FLAGS: { closeoutSyncBulkV1: () => Boolean(bulkEnabled) } }
  }, () => require(target));
  return { handler, state };
}

test('CL-A2-REQ-003/007: sync flag OFF preserves serial updateOne-style behavior', async () => {
  const h = loadPostCommitHarness({ bulkEnabled: false });
  const result = await h.handler.enqueueReadModelSync([
    { customerCode: 'C1', sourceIds: ['SO1'] },
    { customerCode: 'C2', sourceIds: ['SO2'] }
  ]);
  assert.equal(h.state.serialCalls, 2);
  assert.equal(h.state.bulkCalls, 0);
  assert.equal(result.queued, 2);
  assert.equal(result.syncBulkEnabled, false);
});

test('CL-A2-REQ-003: sync flag ON uses one bulk service call for N groups', async () => {
  const h = loadPostCommitHarness({ bulkEnabled: true });
  const result = await h.handler.enqueueReadModelSync(Array.from({ length: 26 }, (_, i) => ({ customerCode: `C${i}`, sourceIds: [`SO${i}`] })));
  assert.equal(h.state.serialCalls, 0);
  assert.equal(h.state.bulkCalls, 1);
  assert.equal(result.queued, 26);
  assert.equal(result.jobs.length, 26);
  assert.equal(h.state.scheduled, 1);
});

test('CL-A2-REQ-004: worker scheduling failure is warning-only after financial commit', async () => {
  const h = loadPostCommitHarness({ bulkEnabled: true, scheduleThrows: true });
  const result = await h.handler.enqueueReadModelSync([{ customerCode: 'C1', sourceIds: ['SO1'] }]);
  assert.equal(result.queued, 1);
  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some((row) => row.code === 'SCHEDULE_FAILED' && row.retryRequired === true));
});
