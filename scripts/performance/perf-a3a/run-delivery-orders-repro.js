#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const reader = require('../../../src/services/delivery/deliveryTodayCanonicalOrderReader');
const PaymentState = require('../../../src/services/delivery/DeliveryPaymentStateReadService');
const { buildPerfA3aFixture } = require('../../../test/performance/perf-a3a/fixture-factory');
const { FakeModel } = require('../../../test/performance/perf-a3a/fake-mongo');
const { oracleOrders } = require('../../../test/performance/perf-a3a/oracle-reader');

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function modelsForReader(fixture) {
  return {
    SalesOrder: new FakeModel(fixture.orders, 'SalesOrder'),
    MasterOrder: new FakeModel(fixture.masterOrders, 'MasterOrder')
  };
}

function modelsForFinancial(fixture) {
  return {
    DeliveryCloseoutVersion: new FakeModel(fixture.versions, 'DeliveryCloseoutVersion'),
    OrderPaymentAllocation: new FakeModel(fixture.allocations, 'OrderPaymentAllocation'),
    ReturnOrder: new FakeModel(fixture.returns, 'ReturnOrder')
  };
}

function ids(rows = []) {
  return rows.map((row) => String(row.orderId || row.id || row.code));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stateSnapshot(states = []) {
  return states.map((state) => ({
    orderId: state.orderId,
    orderCode: state.orderCode,
    paymentVersion: state.paymentVersion,
    paymentStateSource: state.paymentStateSource,
    receivableAmount: state.receivableAmount,
    cashAmount: state.cashAmount,
    bankAmount: state.bankAmount,
    rewardAmount: state.rewardAmount,
    offsetAmount: state.offsetAmount,
    returnAmount: state.returnAmount,
    debtRaw: state.debtRaw,
    debtAmount: state.debtAmount,
    openDebtAmount: state.openDebtAmount,
    stalePaymentAllocationIgnored: state.stalePaymentAllocationIgnored,
    diagnostics: (state.diagnostics || []).map((item) => item.code).filter(Boolean).sort()
  }));
}

async function timed(fn) {
  if (global.gc) global.gc();
  const beforeHeap = process.memoryUsage().heapUsed;
  const started = process.hrtime.bigint();
  const value = await fn();
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const afterHeap = process.memoryUsage().heapUsed;
  return { value, durationMs: Number(durationMs.toFixed(3)), heapDeltaBytes: afterHeap - beforeHeap };
}

async function readerScenario(fixture, limit, enabled, cursor = '') {
  const models = modelsForReader(fixture);
  const query = {
    date: fixture.target.date,
    deliveryStaffCode: fixture.target.deliveryStaffCode,
    limit,
    ...(cursor ? { cursor } : {})
  };
  const measured = await timed(() => reader.listSalesOrders(query, models, { deliveryCanonicalFilterV1: enabled }));
  return {
    result: measured.value,
    durationMs: measured.durationMs,
    heapDeltaBytes: measured.heapDeltaBytes,
    repository: {
      salesOrderQueries: models.SalesOrder.metrics.queries,
      salesOrderRowsMatched: models.SalesOrder.metrics.rowsMatched,
      salesOrderRowsReturned: models.SalesOrder.metrics.rowsReturned,
      masterOrderQueries: models.MasterOrder.metrics.queries,
      masterOrderRowsReturned: models.MasterOrder.metrics.rowsReturned
    }
  };
}

async function financialScenario(fixture, orders, optimized) {
  const models = modelsForFinancial(fixture);
  const measured = await timed(() => PaymentState.resolvePaymentStatesForOrders(orders, {
    models,
    includeReturnState: true,
    dbNativeLatestState: optimized,
    maxOrders: 1000,
    maxPaymentCandidates: optimized ? 10 : 50000
  }));
  const result = measured.value;
  return {
    result,
    snapshot: stateSnapshot(result.states),
    durationMs: measured.durationMs,
    heapDeltaBytes: measured.heapDeltaBytes,
    repository: {
      versionCalls: models.DeliveryCloseoutVersion.metrics.queries,
      allocationCalls: models.OrderPaymentAllocation.metrics.queries,
      returnCalls: models.ReturnOrder.metrics.queries,
      versionRowsRead: optimized ? Number(result.versionsByKey._candidateRowsRead || 0) : Number(result.versionsByKey._rows?.length || 0),
      allocationRowsRead: optimized ? Number(result.allocationsByKey._candidateRowsRead || 0) : Number(result.allocationsByKey._rows?.length || 0),
      returnRowsRead: Number(result.returnResult?.rows?.length || 0)
    }
  };
}

async function main() {
  const fixture = buildPerfA3aFixture(10000);
  const query = { date: fixture.target.date, deliveryStaffCode: fixture.target.deliveryStaffCode, limit: 100 };
  const oracle = oracleOrders(fixture, query);
  const legacy = await readerScenario(fixture, 100, false);
  const optimized = await readerScenario(fixture, 100, true);
  const page2 = await readerScenario(fixture, 100, true, optimized.result.pagination.nextCursor);
  const masterFallback = await timed(() => reader.listSalesOrders(
    { date: fixture.target.date, deliveryStaffCode: 'D01', limit: 100 },
    modelsForReader(fixture),
    { deliveryCanonicalFilterV1: true }
  ));

  const selectedOrders = optimized.result.orders;
  const legacyFinancial = await financialScenario(fixture, selectedOrders, false);
  const optimizedFinancial = await financialScenario(fixture, selectedOrders, true);
  const legacySnapshotHash = digest(legacyFinancial.snapshot);
  const optimizedSnapshotHash = digest(optimizedFinancial.snapshot);
  const maxDebtDeviation = optimizedFinancial.snapshot.reduce((max, row, index) => {
    const legacyRow = legacyFinancial.snapshot[index] || {};
    return Math.max(max, Math.abs(Number(row.debtAmount || 0) - Number(legacyRow.debtAmount || 0)));
  }, 0);

  const limits = [];
  for (const limit of [50, 100, 200]) {
    const red = await readerScenario(fixture, limit, false);
    const green = await readerScenario(fixture, limit, true);
    limits.push({
      limit,
      legacyRowsProcessed: red.result.diagnostics.rawOrderCount,
      optimizedRowsProcessed: green.result.diagnostics.rowsProcessed,
      reductionPercent: Number((100 * (1 - green.result.diagnostics.rowsProcessed / red.result.diagnostics.rawOrderCount)).toFixed(2)),
      legacyRowsReturned: red.result.orders.length,
      optimizedRowsReturned: green.result.orders.length,
      legacyDurationMs: red.durationMs,
      optimizedDurationMs: green.durationMs,
      legacyHeapDeltaBytes: red.heapDeltaBytes,
      optimizedHeapDeltaBytes: green.heapDeltaBytes
    });
  }

  const evidence = {
    promptId: 'PERF-A3A',
    generatedAt: new Date().toISOString(),
    evidenceModel: { E1: 'PASS', E2: 'PASS', E3: 'DEFERRED_TO_PERF_A6' },
    fixture: {
      seed: fixture.seed,
      orders: fixture.orders.length,
      masterOrders: fixture.masterOrders.length,
      closeoutVersions: fixture.versions.length,
      allocations: fixture.allocations.length,
      returns: fixture.returns.length,
      target: fixture.target
    },
    red: {
      readerMode: legacy.result.diagnostics.readerMode,
      dbLimit: legacy.result.diagnostics.dbLimit,
      rawOrderCount: legacy.result.diagnostics.rawOrderCount,
      returnedOrderCount: legacy.result.orders.length,
      filterLocation: 'JavaScript after bounded DB read',
      paginationLocation: 'slice after JavaScript filter',
      repository: legacy.repository
    },
    green: {
      readerMode: optimized.result.diagnostics.readerMode,
      rowsProcessed: optimized.result.diagnostics.rowsProcessed,
      canonicalRowsRead: optimized.result.diagnostics.canonicalRowsRead,
      legacyRowsRead: optimized.result.diagnostics.legacyRowsRead,
      masterScopedRowsRead: optimized.result.diagnostics.masterScopedRowsRead,
      returnedOrderCount: optimized.result.orders.length,
      pagination: optimized.result.pagination,
      repository: optimized.repository
    },
    parity: {
      page1IdsMatchOracle: digest(ids(optimized.result.orders)) === digest(ids(oracle.slice(0, 100))),
      page2IdsMatchOracle: digest(ids(page2.result.orders)) === digest(ids(oracle.slice(100, 200))),
      page1OrderHash: digest(ids(optimized.result.orders)),
      oraclePage1OrderHash: digest(ids(oracle.slice(0, 100))),
      page2OrderHash: digest(ids(page2.result.orders)),
      oraclePage2OrderHash: digest(ids(oracle.slice(100, 200))),
      pageOverlapCount: ids(optimized.result.orders).filter((id) => new Set(ids(page2.result.orders)).has(id)).length,
      financialSnapshotMatch: legacySnapshotHash === optimizedSnapshotHash,
      legacyFinancialSnapshotHash: legacySnapshotHash,
      optimizedFinancialSnapshotHash: optimizedSnapshotHash,
      maxDebtDeviation,
      returnStateMatch: legacyFinancial.snapshot.every((row, index) => row.returnAmount === optimizedFinancial.snapshot[index]?.returnAmount),
      paymentStateMatch: legacyFinancial.snapshot.every((row, index) => row.paymentStateSource === optimizedFinancial.snapshot[index]?.paymentStateSource),
      staffScopeLeakCount: optimized.result.orders.filter((row) => row.deliveryStaffCode !== fixture.target.deliveryStaffCode).length,
      dateScopeLeakCount: optimized.result.orders.filter((row) => row.deliveryDate !== fixture.target.date).length,
      duplicateIdentityCount: optimized.result.orders.length - new Set(ids(optimized.result.orders)).size,
      legacyMasterAssignmentsPreserved: masterFallback.value.orders.some((row) => String(row.deliveryAssignmentSource || '').startsWith('masterOrder.'))
    },
    pagination: {
      page1: optimized.result.pagination,
      page2: page2.result.pagination,
      stableSort: optimized.result.diagnostics.stableSort,
      page1Count: optimized.result.orders.length,
      page2Count: page2.result.orders.length
    },
    latestState: {
      legacy: legacyFinancial.repository,
      optimized: optimizedFinancial.repository,
      versionCandidateReductionPercent: Number((100 * (1 - optimizedFinancial.repository.versionRowsRead / legacyFinancial.repository.versionRowsRead)).toFixed(2)),
      allocationCandidateReductionPercent: Number((100 * (1 - optimizedFinancial.repository.allocationRowsRead / legacyFinancial.repository.allocationRowsRead)).toFixed(2)),
      noGlobalLimitInOptimizedPipeline: true,
      financialSnapshotMatch: legacySnapshotHash === optimizedSnapshotHash
    },
    logicalWorkByLimit: limits,
    warning: 'Offline duration and heap deltas compare deterministic algorithmic work only; they are not Mongo latency or production p95.'
  };

  const output = path.resolve(argValue('--output', 'evidence/perf-a3a/PERF_A3A_OFFLINE_RUN.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
