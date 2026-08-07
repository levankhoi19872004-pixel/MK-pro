'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { BATCH_SIZES, createBatch } = require('../../../test/performance/perf-a1b/fixture-factory');
const { runCurrentArchitecture } = require('../../../test/performance/perf-a1b/current-architecture-simulator');
const { runBatchArchitecture } = require('../../../test/performance/perf-a2a/batch-architecture-simulator');

const DEFAULT_ITERATIONS = 5;

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function stableCountSignature(counts = {}) {
  return JSON.stringify({
    operations: counts.operations,
    groups: counts.groups,
    logicalReads: counts.logicalReads,
    writes: counts.writes,
    transactions: counts.transactions,
    transactionCommits: counts.transactionCommits,
    transactionAborts: counts.transactionAborts,
    totalCalls: counts.totalCalls,
    callsPerOrder: counts.callsPerOrder
  });
}

function snapshotHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function duplicateLedgerCount(snapshot = {}) {
  const keys = (snapshot.arLedger || []).map((row) => row.idempotencyKey).filter(Boolean);
  return keys.length - new Set(keys).size;
}

function maximumDebtDeviation(redSnapshot = {}, greenSnapshot = {}) {
  const red = new Map((redSnapshot.debtBalance || []).map((row) => [row.orderCode, Number(row.balance || 0)]));
  let maximum = 0;
  for (const row of greenSnapshot.debtBalance || []) {
    maximum = Math.max(maximum, Math.abs(Number(row.balance || 0) - Number(red.get(row.orderCode) || 0)));
  }
  return maximum;
}

async function measure(run, size, iterations) {
  // Warm-up is deliberately excluded from duration and memory summaries.
  await run(createBatch(size));
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    samples.push(await run(createBatch(size)));
  }
  const signature = stableCountSignature(samples[0].counts);
  assert.ok(samples.every((sample) => stableCountSignature(sample.counts) === signature), `logical counts are not deterministic for batch ${size}`);
  assert.ok(samples.every((sample) => isDeepStrictEqual(sample.snapshot, samples[0].snapshot)), `snapshot is not deterministic for batch ${size}`);
  return {
    representative: samples[0],
    durationMedianMs: round(median(samples.map((sample) => sample.durationMs))),
    durationMinMs: round(Math.min(...samples.map((sample) => sample.durationMs))),
    durationMaxMs: round(Math.max(...samples.map((sample) => sample.durationMs))),
    heapDeltaMedianBytes: Math.round(median(samples.map((sample) => sample.heapDeltaBytes)))
  };
}

async function main() {
  const iterations = Math.max(1, Number(argument('--iterations', DEFAULT_ITERATIONS)) || DEFAULT_ITERATIONS);
  const rows = [];
  const parity = [];

  for (const batchSize of BATCH_SIZES) {
    const red = await measure(runCurrentArchitecture, batchSize, iterations);
    const green = await measure(runBatchArchitecture, batchSize, iterations);
    const redCounts = red.representative.counts;
    const greenCounts = green.representative.counts;
    const snapshotsEqual = isDeepStrictEqual(red.representative.snapshot, green.representative.snapshot);
    const readReduction = redCounts.logicalReads - greenCounts.logicalReads;

    rows.push({
      batchSize,
      red: {
        logicalReads: redCounts.logicalReads,
        writes: redCounts.writes,
        transactions: redCounts.transactions,
        transactionCommits: redCounts.transactionCommits,
        transactionAborts: redCounts.transactionAborts,
        callsPerOrder: redCounts.callsPerOrder,
        operations: redCounts.operations,
        offlineDurationMedianMs: red.durationMedianMs,
        offlineDurationRangeMs: [red.durationMinMs, red.durationMaxMs],
        offlineHeapDeltaMedianBytes: red.heapDeltaMedianBytes
      },
      green: {
        logicalReads: greenCounts.logicalReads,
        writes: greenCounts.writes,
        transactions: greenCounts.transactions,
        transactionCommits: greenCounts.transactionCommits,
        transactionAborts: greenCounts.transactionAborts,
        callsPerOrder: greenCounts.callsPerOrder,
        operations: greenCounts.operations,
        offlineDurationMedianMs: green.durationMedianMs,
        offlineDurationRangeMs: [green.durationMinMs, green.durationMaxMs],
        offlineHeapDeltaMedianBytes: green.heapDeltaMedianBytes
      },
      comparison: {
        logicalReadReduction: readReduction,
        logicalReadReductionPercent: round((readReduction / redCounts.logicalReads) * 100, 2),
        writesUnchanged: redCounts.writes === greenCounts.writes,
        transactionsUnchanged: redCounts.transactions === greenCounts.transactions,
        resultSnapshotEqual: snapshotsEqual,
        greenGate500Equivalent: greenCounts.logicalReads <= 500,
        greenTarget300Equivalent: greenCounts.logicalReads <= 300
      }
    });

    parity.push({
      batchSize,
      financialSnapshotEqual: snapshotsEqual,
      redSnapshotSha256: snapshotHash(red.representative.snapshot),
      greenSnapshotSha256: snapshotHash(green.representative.snapshot),
      returnStateEqual: isDeepStrictEqual(red.representative.snapshot.returnState, green.representative.snapshot.returnState),
      paymentAllocationEqual: isDeepStrictEqual(red.representative.snapshot.paymentAllocation, green.representative.snapshot.paymentAllocation),
      closeoutVersionEqual: isDeepStrictEqual(red.representative.snapshot.closeoutVersion, green.representative.snapshot.closeoutVersion),
      errorResultOrderEqual: isDeepStrictEqual(red.representative.snapshot.errorResultOrder, green.representative.snapshot.errorResultOrder),
      debtDeviation: maximumDebtDeviation(red.representative.snapshot, green.representative.snapshot),
      duplicateLedgerCount: duplicateLedgerCount(green.representative.snapshot)
    });
  }

  const output = {
    schemaVersion: 1,
    promptId: 'PERF-A2A',
    runner: 'node-built-in/dependency-free',
    nodeVersion: process.version,
    fixtureDeterminism: { random: false, currentTimeDependency: false, iterations, warmupRunsPerBatch: 1 },
    warning: 'Offline duration and heap delta compare algorithmic behavior only; they are not production latency, Mongo execution time, or production p95.',
    rows,
    parity,
    acceptance: {
      redProvesLinearInitialReads: rows.every((row) => row.red.operations.findOrder === row.batchSize),
      initialOrderReadsCollapsed: rows.every((row) => row.green.operations.batchFindOrders === 1),
      initialVersionReadsCollapsed: rows.every((row) => row.green.operations.batchFindVersions === 1),
      initialReturnReadsCollapsed: rows.every((row) => row.green.operations.batchFindReturns === 1),
      initialAllocationReadsCollapsed: rows.every((row) => row.green.operations.batchFindAllocations === 1),
      initialArReadsCollapsed: rows.every((row) => row.green.operations.batchFindArContext === 1),
      initialCorrectionIdempotencyReadsCollapsed: rows.every((row) => row.green.operations.batchFindCorrectionIdempotency === 1),
      sixtyOrderGate500Equivalent: rows.find((row) => row.batchSize === 60).green.logicalReads <= 500,
      sixtyOrderTarget300Equivalent: rows.find((row) => row.batchSize === 60).green.logicalReads <= 300,
      allFinancialParity: parity.every((row) => row.financialSnapshotEqual),
      debtDeviationZero: parity.every((row) => row.debtDeviation === 0),
      duplicateLedgerZero: parity.every((row) => row.duplicateLedgerCount === 0)
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
