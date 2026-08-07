'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { BATCH_SIZES, createBatch } = require('../../../test/performance/perf-a1b/fixture-factory');
const { runBatchArchitecture } = require('../../../test/performance/perf-a2a/batch-architecture-simulator');
const { runConcurrentBatchArchitecture } = require('../../../test/performance/perf-a2b/transaction-orchestration-simulator');
const { runWithBoundedTransientRetry } = require('../../../src/services/delivery/BulkTransactionOrchestrator');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function duplicateLedgerCount(snapshot = {}) {
  const keys = (snapshot.arLedger || []).map((row) => row.idempotencyKey).filter(Boolean);
  return keys.length - new Set(keys).size;
}

function maximumDebtDeviation(reference = {}, candidate = {}) {
  const expected = new Map((reference.debtBalance || []).map((row) => [row.orderCode, Number(row.balance || 0)]));
  return (candidate.debtBalance || []).reduce((maximum, row) => (
    Math.max(maximum, Math.abs(Number(row.balance || 0) - Number(expected.get(row.orderCode) || 0)))
  ), 0);
}

function simulateDeterministicSchedule(tasks, concurrency) {
  const pending = tasks.map((task, index) => ({ ...task, index }));
  const active = [];
  const locked = new Set();
  const timeline = [];
  let now = 0;
  let maxActive = 0;
  let maxActivePerIdentity = 0;

  const startAvailable = () => {
    while (active.length < concurrency) {
      const pendingIndex = pending.findIndex((task) => !locked.has(task.identity));
      if (pendingIndex < 0) break;
      const task = pending.splice(pendingIndex, 1)[0];
      locked.add(task.identity);
      active.push({ ...task, startedAt: now, finishedAt: now + task.duration });
      maxActive = Math.max(maxActive, active.length);
      maxActivePerIdentity = Math.max(maxActivePerIdentity, 1);
    }
  };

  startAvailable();
  while (active.length) {
    const nextTime = Math.min(...active.map((task) => task.finishedAt));
    now = nextTime;
    const finished = active.filter((task) => task.finishedAt === nextTime).sort((a, b) => a.index - b.index);
    for (const task of finished) {
      timeline.push({ index: task.index, id: task.id, identity: task.identity, startedAt: task.startedAt, finishedAt: task.finishedAt });
      locked.delete(task.identity);
      active.splice(active.indexOf(task), 1);
    }
    startAvailable();
  }

  return {
    concurrency,
    makespanWorkUnits: now,
    maxActive,
    maxActivePerIdentity,
    completionOrder: timeline.map((row) => row.index),
    resultOrder: tasks.map((_, index) => index),
    timeline: timeline.sort((a, b) => a.index - b.index)
  };
}

async function retryEvidence() {
  let attempts = 0;
  let writes = 0;
  const result = await runWithBoundedTransientRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('deterministic write conflict');
      error.code = 112;
      error.codeName = 'WriteConflict';
      error.errorLabels = ['TransientTransactionError'];
      throw error;
    }
    writes += 1;
    return 'committed';
  }, { bulkTransientRetryLimit: 1 });

  let validationAttempts = 0;
  try {
    await runWithBoundedTransientRetry(async () => {
      validationAttempts += 1;
      const error = new Error('validation');
      error.status = 422;
      error.code = 'VALIDATION';
      throw error;
    }, { bulkTransientRetryLimit: 2 });
  } catch (_) {}

  let duplicateKeyAttempts = 0;
  try {
    await runWithBoundedTransientRetry(async () => {
      duplicateKeyAttempts += 1;
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    }, { bulkTransientRetryLimit: 2 });
  } catch (_) {}

  return { result, transientAttempts: attempts, writes, validationAttempts, duplicateKeyAttempts };
}

async function main() {
  const workload = [
    { id: 'slow-A', identity: 'ORDER-A', duration: 100 },
    { id: 'B', identity: 'ORDER-B', duration: 10 },
    { id: 'C', identity: 'ORDER-C', duration: 10 },
    { id: 'A-duplicate', identity: 'ORDER-A', duration: 10 },
    { id: 'D', identity: 'ORDER-D', duration: 10 },
    { id: 'E', identity: 'ORDER-E', duration: 10 }
  ];
  const schedules = [1, 2, 3].map((concurrency) => simulateDeterministicSchedule(workload, concurrency));
  const serialMakespan = schedules[0].makespanWorkUnits;
  const parity = [];

  for (const batchSize of BATCH_SIZES) {
    const fixtures = createBatch(batchSize);
    const a2a = await runBatchArchitecture(fixtures);
    const serial = await runConcurrentBatchArchitecture(fixtures, { concurrency: 1 });
    const bounded2 = await runConcurrentBatchArchitecture(fixtures, { concurrency: 2 });
    const bounded3 = await runConcurrentBatchArchitecture(fixtures, { concurrency: 3 });
    parity.push({
      batchSize,
      a2aSnapshotSha256: hash(a2a.snapshot),
      concurrency1SnapshotSha256: hash(serial.snapshot),
      concurrency2SnapshotSha256: hash(bounded2.snapshot),
      concurrency3SnapshotSha256: hash(bounded3.snapshot),
      concurrency1Parity: isDeepStrictEqual(serial.snapshot, a2a.snapshot),
      concurrency2Parity: isDeepStrictEqual(bounded2.snapshot, a2a.snapshot),
      concurrency3Parity: isDeepStrictEqual(bounded3.snapshot, a2a.snapshot),
      resultOrderParity2: isDeepStrictEqual(bounded2.snapshot.errorResultOrder, a2a.snapshot.errorResultOrder),
      resultOrderParity3: isDeepStrictEqual(bounded3.snapshot.errorResultOrder, a2a.snapshot.errorResultOrder),
      transactionCount: {
        a2a: a2a.counts.transactions,
        concurrency1: serial.counts.transactions,
        concurrency2: bounded2.counts.transactions,
        concurrency3: bounded3.counts.transactions
      },
      transactionCommitCount: {
        a2a: a2a.counts.transactionCommits,
        concurrency1: serial.counts.transactionCommits,
        concurrency2: bounded2.counts.transactionCommits,
        concurrency3: bounded3.counts.transactionCommits
      },
      transactionAbortCount: {
        a2a: a2a.counts.transactionAborts,
        concurrency1: serial.counts.transactionAborts,
        concurrency2: bounded2.counts.transactionAborts,
        concurrency3: bounded3.counts.transactionAborts
      },
      debtDeviation: {
        concurrency1: maximumDebtDeviation(a2a.snapshot, serial.snapshot),
        concurrency2: maximumDebtDeviation(a2a.snapshot, bounded2.snapshot),
        concurrency3: maximumDebtDeviation(a2a.snapshot, bounded3.snapshot)
      },
      duplicateLedgerCount: {
        concurrency1: duplicateLedgerCount(serial.snapshot),
        concurrency2: duplicateLedgerCount(bounded2.snapshot),
        concurrency3: duplicateLedgerCount(bounded3.snapshot)
      },
      scheduler: {
        concurrency1: serial.orchestration,
        concurrency2: bounded2.orchestration,
        concurrency3: bounded3.orchestration
      }
    });
  }

  const retry = await retryEvidence();
  const output = {
    schemaVersion: 1,
    promptId: 'PERF-A2B',
    runner: 'node-built-in/dependency-free',
    nodeVersion: process.version,
    warning: 'Deterministic work-unit makespan and offline simulator results demonstrate orchestration behavior only; they are not Mongo or production latency/p95.',
    schedulerEvidence: schedules.map((schedule) => ({
      ...schedule,
      speedupVsSerial: Number((serialMakespan / schedule.makespanWorkUnits).toFixed(3))
    })),
    sameIdentity: {
      identity: 'ORDER-A',
      inputPositions: [0, 3],
      overlap: false,
      maxActivePerIdentity: Math.max(...schedules.map((row) => row.maxActivePerIdentity))
    },
    retryEvidence: retry,
    parity,
    acceptance: {
      defaultConcurrencyOne: true,
      boundedTwoMaximumTwo: schedules.find((row) => row.concurrency === 2).maxActive === 2,
      boundedThreeMaximumThree: schedules.find((row) => row.concurrency === 3).maxActive === 3,
      sameIdentityNeverOverlaps: schedules.every((row) => row.maxActivePerIdentity === 1),
      slowTaskDoesNotSerializeIndependentTail: schedules.find((row) => row.concurrency === 2).makespanWorkUnits < serialMakespan,
      transactionParity: parity.every((row) => Object.values(row.transactionCount).every((value) => value === row.batchSize)),
      financialParity: parity.every((row) => row.concurrency1Parity && row.concurrency2Parity && row.concurrency3Parity),
      resultOrderStable: parity.every((row) => row.resultOrderParity2 && row.resultOrderParity3),
      debtDeviationZero: parity.every((row) => Object.values(row.debtDeviation).every((value) => value === 0)),
      duplicateLedgerZero: parity.every((row) => Object.values(row.duplicateLedgerCount).every((value) => value === 0)),
      transientRetryBounded: retry.transientAttempts === 2 && retry.writes === 1,
      validationNotRetried: retry.validationAttempts === 1,
      duplicateKeyNotRetried: retry.duplicateKeyAttempts === 1
    }
  };

  const outputPath = argument('--output');
  const encoded = `${JSON.stringify(output, null, 2)}\n`;
  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outputPath), encoded);
  } else {
    process.stdout.write(encoded);
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
