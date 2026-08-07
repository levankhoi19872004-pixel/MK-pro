'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BATCH_SIZES, CASES, createBatch, createFixtureMatrix } = require('./fixture-factory');
const { runCurrentArchitecture } = require('./current-architecture-simulator');

const ROOT = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('E1 source preserves per-order transaction and safety re-read architecture', () => {
  const bulk = read('src/services/delivery/DeliveryAdjustmentBulkCommitService.js');
  const commit = read('src/services/delivery/DeliveryAdjustmentCommitService.js');
  const reconcile = read('src/services/accounting/OrderPaymentDebtReconcileService.js');
  assert.match(bulk, /runBoundedByIdentity/);
  assert.match(bulk, /withOptionalMongoTransaction[\s\S]*commitOneAdjustment/);
  assert.match(bulk, /effectiveConcurrency = batchContext && !options\.session/);
  assert.match(commit, /const preflight = await preflightReconcile/);
  assert.match(commit, /createCorrection\(correctionInput/);
  assert.match(commit, /const after = await preflightReconcile/);
  assert.match(reconcile, /order\.debt\.safetyBalance/);
  assert.match(reconcile, /order\.debt\.prePostIdempotency/);
  assert.match(reconcile, /order\.debt\.afterBalance/);
});

test('fixture matrix covers every mandatory case and includes a 60-order batch', () => {
  const matrix = createFixtureMatrix();
  const covered = new Set(matrix.cases.flatMap((row) => row.covers));
  const mandatory = [
    'Current allocation hợp lệ', 'Allocation stale', 'Allocation version mismatch',
    'Latest closeout version', 'Legacy fallback', 'Giá trị tiền bằng 0', 'Null',
    'Undefined', 'NaN', 'Duplicate identity', 'Negative money',
    'Debt Zero Tolerance ±1.000', 'Có return', 'Không return',
    'Existing AR ledger', 'Existing idempotency ledger', 'Đơn không cần post ledger',
    'Đơn cần correction', 'Một đơn lỗi giữa batch', 'Hai input trỏ cùng canonical order'
  ];
  for (const name of mandatory) assert.ok(covered.has(name), `missing fixture case: ${name}`);
  assert.ok(matrix.batchSizes.includes(60));
  assert.equal(createBatch(60).length, 60);
  assert.equal(CASES.length, 21);
});

test('logical query counter is driven by spy adapter calls, not constants', async () => {
  const run = await runCurrentArchitecture(createBatch(16));
  assert.equal(run.counts.operations.findOrder, 16);
  assert.equal(run.counts.operations.findLatestVersion, 16);
  assert.equal(run.counts.operations.findReturns, 16);
  assert.equal(run.counts.operations.findAllocation, 16);
  assert.equal(run.counts.operations.batchFindOrders, 0);
  assert.equal(run.counts.operations.batchFindVersions, 0);
  assert.equal(run.counts.operations.batchFindReturns, 0);
  assert.equal(run.counts.operations.batchFindAllocations, 0);
  assert.equal(run.counts.operations.batchFindArContext, 0);
  assert.equal(run.counts.transactions, 16);
  assert.equal(run.counts.transactionCommits + run.counts.transactionAborts, 16);
  assert.ok(run.counts.operations.findArBalance > 16);
  assert.ok(run.counts.operations.findIdempotency > 16);
});

test('RED baseline grows approximately linearly with N', async () => {
  const baselines = [];
  for (const size of BATCH_SIZES) baselines.push(await runCurrentArchitecture(createBatch(size)));
  for (let index = 1; index < baselines.length; index += 1) {
    assert.ok(baselines[index].counts.logicalReads > baselines[index - 1].counts.logicalReads);
    assert.ok(baselines[index].counts.transactions > baselines[index - 1].counts.transactions);
  }
  const ratios = baselines.filter((row) => row.batchSize >= 16).map((row) => row.counts.logicalReads / row.batchSize);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  assert.ok(max / min < 1.15, `read/order slope drift too large: ${min}..${max}`);
  const sixty = baselines.find((row) => row.batchSize === 60);
  assert.equal(sixty.counts.operations.findOrder, 60);
  assert.equal(sixty.counts.transactions, 60);
});

test('financial resolver preserves zero and applies deterministic fallbacks', async () => {
  const run = await runCurrentArchitecture(createBatch(26));
  const byScenario = new Map(run.results.map((row) => [row.scenarioId, row]));
  assert.equal(byScenario.get('current-allocation-valid').financialSource, 'CURRENT_ALLOCATION');
  assert.equal(byScenario.get('allocation-stale').financialSource, 'LATEST_CLOSEOUT_VERSION');
  assert.equal(byScenario.get('allocation-version-mismatch').financialSource, 'LATEST_CLOSEOUT_VERSION');
  assert.equal(byScenario.get('latest-closeout-version').financialSource, 'LATEST_CLOSEOUT_VERSION');
  assert.equal(byScenario.get('legacy-fallback').financialSource, 'LEGACY_CLOSEOUT_FALLBACK');
  assert.equal(byScenario.get('zero-money').financial.cashAmount, 0);
  assert.equal(byScenario.get('zero-money').financial.bankAmount, 0);
  assert.equal(byScenario.get('zero-money').financial.rewardAmount, 0);
  assert.equal(byScenario.get('zero-money').financial.returnAmount, 0);
  assert.ok(byScenario.get('null-money').diagnostics.some((row) => row.code === 'INVALID_MONEY_NORMALIZED_TO_ZERO'));
  assert.ok(byScenario.get('undefined-money').diagnostics.some((row) => row.code === 'INVALID_MONEY_NORMALIZED_TO_ZERO'));
  assert.ok(byScenario.get('nan-money').diagnostics.some((row) => row.code === 'INVALID_MONEY_NORMALIZED_TO_ZERO'));
  assert.ok(byScenario.get('duplicate-identity').diagnostics.some((row) => row.code === 'DUPLICATE_RETURN_IDENTITY'));
  assert.equal(byScenario.get('negative-money').status, 'error');
  assert.equal(byScenario.get('negative-money').errorCode, 'NEGATIVE_MONEY_GUARD');
});

test('Debt Zero Tolerance and idempotency avoid duplicate ledger posting', async () => {
  const run = await runCurrentArchitecture(createBatch(26));
  const byScenario = new Map(run.results.map((row) => [row.scenarioId, row]));
  assert.equal(byScenario.get('debt-zero-tolerance-negative').postedLedger, null);
  assert.equal(byScenario.get('debt-zero-tolerance-positive').postedLedger, null);
  assert.equal(byScenario.get('no-ledger-post').postedLedger, null);
  assert.equal(byScenario.get('existing-ar-ledger').postedLedger, null);
  assert.equal(byScenario.get('existing-idempotency-ledger').postedLedger, null);
  assert.equal(byScenario.get('correction-required').postedLedger.category, 'AR-DEBT-ADJUSTMENT');
});

test('one error aborts only its transaction and result order stays stable', async () => {
  const run = await runCurrentArchitecture(createBatch(26));
  const errorIndex = run.results.findIndex((row) => row.scenarioId === 'mid-batch-error');
  assert.ok(errorIndex >= 0);
  assert.equal(run.results[errorIndex].status, 'error');
  assert.equal(run.results[errorIndex].errorCode, 'REPOSITORY_FAILURE_AFTER_PREFLIGHT');
  assert.ok(run.results.slice(errorIndex + 1).some((row) => row.status !== 'error'));
  assert.equal(run.counts.transactionAborts, 2); // negative-money guard + injected repository error
});

test('two inputs may resolve to one canonical order and repeat the current command chain', async () => {
  const batch = createBatch(26);
  const run = await runCurrentArchitecture(batch);
  const duplicate = run.results.find((row) => row.scenarioId === 'duplicate-canonical-input');
  assert.ok(duplicate);
  assert.equal(duplicate.orderCode, batch[0].canonicalOrderCode);
  assert.equal(run.counts.operations.findOrder, 26);
  assert.equal(run.counts.operations.findLatestVersion, 26);
});

test('correctness snapshot is deterministic after normalization', async () => {
  const first = await runCurrentArchitecture(createBatch(60));
  const second = await runCurrentArchitecture(createBatch(60));
  assert.deepEqual(first.snapshot, second.snapshot);
});
