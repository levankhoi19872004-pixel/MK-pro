'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BATCH_SIZES, createBatch } = require('../perf-a1b/fixture-factory');
const { runCurrentArchitecture } = require('../perf-a1b/current-architecture-simulator');
const { runBatchArchitecture } = require('./batch-architecture-simulator');
const BatchContextService = require('../../../src/services/delivery/DeliveryAdjustmentBatchContextService');

const ROOT = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('RED first contract remains unchanged and still proves N initial reads', async () => {
  const red = await runCurrentArchitecture(createBatch(60));
  assert.equal(red.counts.operations.findOrder, 60);
  assert.equal(red.counts.operations.findLatestVersion, 60);
  assert.equal(red.counts.operations.findReturns, 60);
  assert.equal(red.counts.operations.findAllocation, 60);
  assert.equal(red.counts.operations.batchFindOrders, 0);
  assert.equal(red.counts.logicalReads, 688);
});

test('production source has an off-by-default feature flag and explicit fallback policy', () => {
  const bulk = read('src/services/delivery/DeliveryAdjustmentBulkCommitService.js');
  const batch = read('src/services/delivery/DeliveryAdjustmentBatchContextService.js');
  const reconcile = read('src/services/accounting/OrderPaymentDebtReconcileService.js');
  assert.match(bulk, /PERF_BULK_BATCH_CONTEXT_V1/);
  assert.match(batch, /process\.env\.PERF_BULK_BATCH_CONTEXT_V1/);
  assert.match(batch, /fallback_legacy/);
  assert.match(batch, /fail_request/);
  assert.match(reconcile, /Always re-read idempotency immediately before the write/);
  assert.match(reconcile, /order\.debt\.safetyBalance/);
  assert.match(reconcile, /order\.debt\.afterBalance/);
  assert.equal(BatchContextService.isEnabled({}), false);
  assert.equal(BatchContextService.isEnabled({ batchContextEnabled: true }), true);
});

test('request-scoped batch context loads complete maps and marks duplicate canonical input', async () => {
  const orders = [
    { id: 'O-1', code: 'B-1', customerCode: 'C-1', deliveryCloseout: { id: 'DCO-1' } },
    { id: 'O-2', code: 'B-2', customerCode: 'C-2', deliveryCloseout: { id: 'DCO-2' } }
  ];
  const adapter = {
    async batchFindOrders() { return orders; },
    async batchFindVersions() { return [{ id: 'V-1', orderId: 'O-1', orderCode: 'B-1', closeoutVersion: 2 }]; },
    async batchFindReturns() { return [{ id: 'R-1', orderId: 'O-1', orderCode: 'B-1', amount: 1000 }]; },
    async batchFindAllocations() { return [{ id: 'A-1', orderId: 'O-1', orderCode: 'B-1', sourceVersion: 2 }]; },
    async batchFindArContext() {
      return {
        inspection: { canonicalLedgers: [], rawActiveConfirmedLedgers: [], excludedLedgers: [] },
        idempotencyLedgers: []
      };
    },
    async batchFindCorrectionIdempotency() { return []; }
  };
  const context = await BatchContextService.loadBatchContext([
    { orderCode: 'B-1' },
    { orderId: 'O-2' },
    { orderId: 'O-1' }
  ], { batchContextAdapter: adapter, batchContextChunkSize: 100 });
  assert.equal(context.complete, true);
  assert.equal(context.requestScoped, true);
  assert.equal(context.itemByPosition.size, 3);
  assert.equal(context.metrics.batchFindOrders, 1);
  assert.equal(context.metrics.batchFindVersions, 1);
  assert.equal(context.metrics.batchFindReturns, 1);
  assert.equal(context.metrics.batchFindAllocations, 1);
  assert.equal(context.metrics.batchFindArContext, 1);
  assert.equal(context.itemByPosition.get(0).duplicateCanonicalInput, true);
  assert.deepEqual(context.itemByPosition.get(0).duplicateInputPositions, [0, 2]);
  assert.equal(context.itemByPosition.get(1).currentAllocation, null);
  assert.equal(context.itemByPosition.get(1).allocationLoaded, true);
});

test('ambiguous canonical identity fails closed instead of selecting an arbitrary order', async () => {
  const adapter = {
    async batchFindOrders() {
      return [
        { id: 'O-A', code: 'SHARED-ALIAS' },
        { id: 'O-B', code: 'SHARED-ALIAS' }
      ];
    },
    async batchFindVersions() { return []; },
    async batchFindReturns() { return []; },
    async batchFindAllocations() { return []; },
    async batchFindArContext() { return { inspection: null, idempotencyLedgers: [] }; },
    async batchFindCorrectionIdempotency() { return []; }
  };
  await assert.rejects(
    () => BatchContextService.loadBatchContext([{ orderCode: 'SHARED-ALIAS' }], { batchContextAdapter: adapter }),
    (error) => error && error.code === 'BULK_BATCH_CONTEXT_AMBIGUOUS_ORDER'
  );
});

test('partial batch context fails closed instead of mixing incomplete data', async () => {
  const adapter = {
    async batchFindOrders() { return []; },
    async batchFindVersions() { return []; },
    async batchFindReturns() { return []; },
    async batchFindAllocations() { return []; },
    async batchFindArContext() { return { inspection: null, idempotencyLedgers: [] }; },
    async batchFindCorrectionIdempotency() { return []; }
  };
  await assert.rejects(
    () => BatchContextService.loadBatchContext([{ orderCode: 'MISSING' }], { batchContextAdapter: adapter }),
    (error) => error && error.code === 'BULK_BATCH_CONTEXT_ORDER_NOT_FOUND'
  );
});

test('GREEN collapses initial order/version/return/allocation/AR reads to bounded batch calls', async () => {
  for (const size of BATCH_SIZES) {
    const fixtures = createBatch(size);
    const canonicalFrequency = new Map();
    for (const fixture of fixtures) {
      const canonicalId = String(fixture.canonicalOrderCode || fixture.inputRef || '');
      canonicalFrequency.set(canonicalId, (canonicalFrequency.get(canonicalId) || 0) + 1);
    }
    const duplicateRefreshCount = [...canonicalFrequency.values()]
      .reduce((sum, frequency) => sum + Math.max(0, frequency - 1), 0);

    const green = await runBatchArchitecture(fixtures);
    assert.equal(green.counts.operations.batchFindOrders, 1);
    assert.equal(green.counts.operations.batchFindVersions, 1);
    assert.equal(green.counts.operations.batchFindReturns, 1);
    assert.equal(green.counts.operations.batchFindAllocations, 1);
    assert.equal(green.counts.operations.batchFindArContext, 1);
    assert.equal(green.counts.operations.batchFindCorrectionIdempotency, 1);
    assert.equal(green.counts.operations.findOrder, duplicateRefreshCount,
      `findOrder must only refresh later duplicate canonical inputs: ${size}`);
    assert.equal(green.counts.operations.findLatestVersion, duplicateRefreshCount);
    assert.equal(green.counts.operations.findReturns, duplicateRefreshCount);
    assert.equal(green.counts.operations.findAllocation, duplicateRefreshCount);
    assert.equal(green.counts.transactions, size);
  }
});

test('60-order GREEN reaches logical query gate and long-term target equivalent', async () => {
  const green = await runBatchArchitecture(createBatch(60));
  assert.ok(green.counts.logicalReads <= 500, `gate exceeded: ${green.counts.logicalReads}`);
  assert.ok(green.counts.logicalReads <= 300, `long-term target exceeded: ${green.counts.logicalReads}`);
  assert.equal(green.counts.transactions, 60);
  assert.equal(green.counts.transactionCommits + green.counts.transactionAborts, 60);
  assert.ok(green.counts.operations.findArBalance > 0, 'safety/after-write balance reads must remain');
  assert.ok(green.counts.operations.findIdempotency > 0, 'idempotency safety reads must remain');
});

test('financial snapshots, return state, debt balance and result order remain identical', async () => {
  for (const size of [1, 16, 26, 60, 100]) {
    const fixtures = createBatch(size);
    const red = await runCurrentArchitecture(fixtures);
    const green = await runBatchArchitecture(fixtures);
    assert.deepEqual(green.snapshot, red.snapshot, `snapshot mismatch at batch ${size}`);
    const ledgerKeys = green.snapshot.arLedger.map((row) => row.idempotencyKey);
    assert.equal(new Set(ledgerKeys).size, ledgerKeys.length, `duplicate ledger at batch ${size}`);
    assert.ok(green.snapshot.debtBalance.every((row) => Number.isFinite(Number(row.balance))));
  }
});

test('error isolation and duplicate canonical input keep stable order', async () => {
  const green = await runBatchArchitecture(createBatch(26));
  const errorIndex = green.results.findIndex((row) => row.scenarioId === 'mid-batch-error');
  const duplicate = green.results.find((row) => row.scenarioId === 'duplicate-canonical-input');
  assert.ok(errorIndex >= 0);
  assert.equal(green.results[errorIndex].status, 'error');
  assert.ok(green.results.slice(errorIndex + 1).some((row) => row.status !== 'error'));
  assert.equal(duplicate.duplicateScopedRefresh, true);
});
