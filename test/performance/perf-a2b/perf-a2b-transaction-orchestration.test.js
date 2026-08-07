'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  resolveConcurrency,
  resolveRetryLimit,
  isTransientTransactionError,
  runWithBoundedTransientRetry,
  runBoundedByIdentity
} = require('../../../src/services/delivery/BulkTransactionOrchestrator');
const { createBatch } = require('../perf-a1b/fixture-factory');
const { runBatchArchitecture } = require('../perf-a2a/batch-architecture-simulator');
const { runConcurrentBatchArchitecture } = require('./transaction-orchestration-simulator');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function waitFor(predicate, label = 'condition') {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error(`Deterministic wait failed: ${label}`);
}

function transientError(code = 112) {
  const error = new Error('deterministic transient transaction failure');
  error.code = code;
  error.codeName = 'WriteConflict';
  error.errorLabels = ['TransientTransactionError'];
  return error;
}

test('configuration defaults to serial and caps runtime-unverified concurrency at three', () => {
  assert.equal(resolveConcurrency({}), 1);
  assert.equal(resolveConcurrency({ bulkConcurrency: 2 }), 2);
  assert.equal(resolveConcurrency({ bulkConcurrency: 3 }), 3);
  assert.equal(resolveConcurrency({ bulkConcurrency: 99 }), 3);
  assert.equal(resolveConcurrency({ bulkConcurrency: 0 }), 1);
  assert.equal(resolveRetryLimit({}), 1);
  assert.equal(resolveRetryLimit({ bulkTransientRetryLimit: 99 }), 2);
});

test('concurrency=1 preserves serial start and finish order', async () => {
  const events = [];
  const { results, metrics } = await runBoundedByIdentity([
    { id: 'A' }, { id: 'B' }, { id: 'C' }
  ], {
    concurrency: 1,
    identityOf: (task) => task.id,
    worker: async (task) => {
      events.push(`start:${task.id}`);
      await Promise.resolve();
      events.push(`finish:${task.id}`);
      return task.id;
    }
  });
  assert.deepEqual(events, ['start:A', 'finish:A', 'start:B', 'finish:B', 'start:C', 'finish:C']);
  assert.deepEqual(results, ['A', 'B', 'C']);
  assert.equal(metrics.maxActive, 1);
});

test('concurrency=2 runs at most two independent identities', async () => {
  const gates = { A: deferred(), B: deferred(), C: deferred() };
  const started = [];
  const run = runBoundedByIdentity([{ id: 'A' }, { id: 'B' }, { id: 'C' }], {
    concurrency: 2,
    identityOf: (task) => task.id,
    worker: async (task) => {
      started.push(task.id);
      await gates[task.id].promise;
      return task.id;
    }
  });
  await waitFor(() => started.length === 2, 'first two tasks start');
  assert.deepEqual(started, ['A', 'B']);
  gates.A.resolve();
  await waitFor(() => started.length === 3, 'third task starts after one slot frees');
  assert.equal(started[2], 'C');
  gates.B.resolve();
  gates.C.resolve();
  const outcome = await run;
  assert.equal(outcome.metrics.maxActive, 2);
  assert.deepEqual(outcome.results, ['A', 'B', 'C']);
});

test('concurrency=3 permits at most three independent identities', async () => {
  const gates = { A: deferred(), B: deferred(), C: deferred(), D: deferred() };
  const started = [];
  const run = runBoundedByIdentity([{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }], {
    concurrency: 3,
    identityOf: (task) => task.id,
    worker: async (task) => {
      started.push(task.id);
      await gates[task.id].promise;
      return task.id;
    }
  });
  await waitFor(() => started.length === 3, 'first three tasks start');
  assert.deepEqual(started, ['A', 'B', 'C']);
  gates.B.resolve();
  await waitFor(() => started.includes('D'), 'fourth task starts after a slot frees');
  gates.A.resolve();
  gates.C.resolve();
  gates.D.resolve();
  const outcome = await run;
  assert.equal(outcome.metrics.maxActive, 3);
  assert.deepEqual(outcome.results, ['A', 'B', 'C', 'D']);
});

test('same canonical identity never overlaps while other identities can progress', async () => {
  const gates = { A1: deferred(), A2: deferred(), B1: deferred() };
  const started = [];
  const finished = [];
  const run = runBoundedByIdentity([
    { id: 'A1', identity: 'ORDER-A' },
    { id: 'A2', identity: 'ORDER-A' },
    { id: 'B1', identity: 'ORDER-B' }
  ], {
    concurrency: 2,
    identityOf: (task) => task.identity,
    worker: async (task) => {
      started.push(task.id);
      await gates[task.id].promise;
      finished.push(task.id);
      return task.id;
    }
  });
  await waitFor(() => started.length === 2, 'A1 and B1 start');
  assert.deepEqual(started, ['A1', 'B1']);
  gates.B1.resolve();
  await waitFor(() => finished.includes('B1'), 'B1 finishes');
  await Promise.resolve();
  assert.equal(started.includes('A2'), false, 'A2 must remain blocked by A1 identity lock');
  gates.A1.resolve();
  await waitFor(() => started.includes('A2'), 'A2 starts after A1 finishes');
  gates.A2.resolve();
  const outcome = await run;
  assert.equal(outcome.metrics.maxActivePerIdentity, 1);
  assert.deepEqual(outcome.results, ['A1', 'A2', 'B1']);
});

test('a slow task does not block later independent work when another slot frees', async () => {
  const slow = deferred();
  const medium = deferred();
  const tail = deferred();
  const started = [];
  const run = runBoundedByIdentity([
    { id: 'SLOW' }, { id: 'MEDIUM' }, { id: 'TAIL' }
  ], {
    concurrency: 2,
    identityOf: (task) => task.id,
    worker: async (task) => {
      started.push(task.id);
      await ({ SLOW: slow, MEDIUM: medium, TAIL: tail })[task.id].promise;
      return task.id;
    }
  });
  await waitFor(() => started.length === 2, 'slow and medium start');
  medium.resolve();
  await waitFor(() => started.includes('TAIL'), 'tail starts while slow still pending');
  assert.equal(started.includes('SLOW'), true);
  tail.resolve();
  slow.resolve();
  await run;
});

test('one failure is isolated and stable result ordering is preserved', async () => {
  const tasks = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const outcome = await runBoundedByIdentity(tasks, {
    concurrency: 2,
    identityOf: (task) => task.id,
    settleErrors: true,
    errorResult: (error, task) => ({ id: task.id, status: 'error', code: error.code }),
    worker: async (task) => {
      if (task.id === 'B') {
        const error = new Error('business failure');
        error.code = 'VALIDATION_FAILURE';
        error.status = 422;
        throw error;
      }
      return { id: task.id, status: 'ok' };
    }
  });
  assert.deepEqual(outcome.results, [
    { id: 'A', status: 'ok' },
    { id: 'B', status: 'error', code: 'VALIDATION_FAILURE' },
    { id: 'C', status: 'ok' }
  ]);
  assert.equal(outcome.metrics.failedTasks, 1);
});

test('transient transaction errors retry within limit and preserve a single logical success', async () => {
  let attempts = 0;
  let writes = 0;
  const value = await runWithBoundedTransientRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw transientError();
    writes += 1;
    return 'committed';
  }, { bulkTransientRetryLimit: 1 });
  assert.equal(value, 'committed');
  assert.equal(attempts, 2);
  assert.equal(writes, 1);
  assert.equal(isTransientTransactionError(transientError()), true);
});

test('validation, duplicate key and unknown commit result are not retried as whole commands', async () => {
  const cases = [
    Object.assign(new Error('validation'), { status: 400, code: 'VALIDATION' }),
    Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
    Object.assign(new Error('unknown commit'), { errorLabels: ['UnknownTransactionCommitResult'] })
  ];
  for (const failure of cases) {
    let attempts = 0;
    await assert.rejects(() => runWithBoundedTransientRetry(async () => {
      attempts += 1;
      throw failure;
    }, { bulkTransientRetryLimit: 2 }));
    assert.equal(attempts, 1);
  }
});

test('concurrency=1 financial state is identical to A2A serial architecture', async () => {
  for (const size of [1, 16, 26, 60, 100]) {
    const fixtures = createBatch(size);
    const a2a = await runBatchArchitecture(fixtures);
    const a2b = await runConcurrentBatchArchitecture(fixtures, { concurrency: 1 });
    assert.deepEqual(a2b.snapshot, a2a.snapshot, `serial parity mismatch at ${size}`);
    assert.equal(a2b.counts.transactions, a2a.counts.transactions);
  }
});

test('concurrency=2 keeps financial parity, result order, zero debt deviation and no duplicate ledger', async () => {
  for (const size of [16, 26, 60, 100]) {
    const fixtures = createBatch(size);
    const serial = await runConcurrentBatchArchitecture(fixtures, { concurrency: 1 });
    const bounded = await runConcurrentBatchArchitecture(fixtures, { concurrency: 2 });
    assert.deepEqual(bounded.snapshot, serial.snapshot, `bounded parity mismatch at ${size}`);
    assert.deepEqual(
      bounded.results.map((row) => [row.inputRef, row.status, row.errorCode || null]),
      serial.results.map((row) => [row.inputRef, row.status, row.errorCode || null])
    );
    const ledgerKeys = bounded.snapshot.arLedger.map((row) => row.idempotencyKey);
    assert.equal(new Set(ledgerKeys).size, ledgerKeys.length, `duplicate ledger at ${size}`);
    const serialDebt = new Map(serial.snapshot.debtBalance.map((row) => [row.orderCode, row.balance]));
    const maxDeviation = bounded.snapshot.debtBalance.reduce((max, row) => (
      Math.max(max, Math.abs(Number(row.balance) - Number(serialDebt.get(row.orderCode))))
    ), 0);
    assert.equal(maxDeviation, 0);
    assert.ok(bounded.orchestration.maxActive <= 2);
    assert.equal(bounded.orchestration.maxActivePerIdentity, 1);
  }
});

test('production bulk service uses canonical identity scheduler and keeps legacy fallback serial', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../src/services/delivery/DeliveryAdjustmentBulkCommitService.js'), 'utf8');
  assert.match(source, /BulkTransactionOrchestrator\.runBoundedByIdentity/);
  assert.match(source, /canonicalOrderKey/);
  assert.match(source, /const effectiveConcurrency = batchContext && !options\.session \? configuredConcurrency : 1/);
  assert.match(source, /withOptionalMongoTransaction/);
  assert.match(source, /runWithBoundedTransientRetry/);
});
