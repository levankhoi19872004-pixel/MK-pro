'use strict';

const { LogicalQueryCounter } = require('../perf-a1b/logical-query-counter');
const { FakeRepository } = require('../perf-a1b/fake-repository');
const { normalizeSnapshot } = require('../perf-a1b/normalize-snapshot');
const { buildBatchContext, runOneWithBatchContext } = require('../perf-a2a/batch-architecture-simulator');
const { runBoundedByIdentity } = require('../../../src/services/delivery/BulkTransactionOrchestrator');

async function runConcurrentBatchArchitecture(fixtures, options = {}) {
  const counter = new LogicalQueryCounter();
  const repository = new FakeRepository(fixtures, counter);
  const batchContext = await buildBatchContext(fixtures, repository, options);
  if (!batchContext.complete) throw new Error('partial batch context');
  const tasks = fixtures.map((fixture, index) => ({
    fixture,
    index,
    contextItem: batchContext.itemByPosition.get(index),
    identity: fixture.canonicalOrderCode
  }));
  const orchestration = await runBoundedByIdentity(tasks, {
    concurrency: options.concurrency || 1,
    identityOf: (task) => task.identity,
    worker: (task) => runOneWithBatchContext(task.fixture, repository, task.contextItem, options)
  });
  const results = orchestration.results;
  const uniqueOrderCodes = [...new Set(fixtures.map((fixture) => fixture.canonicalOrderCode))];
  const orderStates = uniqueOrderCodes.map((orderCode) => ({ orderCode, ...repository.snapshot(orderCode) }));
  const snapshot = normalizeSnapshot({
    orderFinancialState: orderStates.map((state) => ({ orderCode: state.orderCode, order: state.order })),
    returnState: orderStates.map((state) => ({ orderCode: state.orderCode, returns: state.returns })),
    paymentAllocation: orderStates.map((state) => ({ orderCode: state.orderCode, allocation: state.allocation })),
    arLedger: orderStates.flatMap((state) => state.ledgers),
    debtBalance: orderStates.map((state) => ({ orderCode: state.orderCode, balance: state.arBalance })),
    idempotencyKeys: orderStates.flatMap((state) => state.idempotencyLedger ? [state.idempotencyLedger.idempotencyKey] : []).sort(),
    closeoutVersion: orderStates.map((state) => ({ orderCode: state.orderCode, version: Math.max(0, ...state.versions.map((row) => Number(row.closeoutVersion || row.sourceVersion || 0))) })),
    errorResultOrder: results.map((result, index) => ({ index, inputRef: result.inputRef, status: result.status, errorCode: result.errorCode || null }))
  });
  return {
    results,
    snapshot,
    counts: counter.snapshot({ batchSize: fixtures.length }),
    orchestration: orchestration.metrics
  };
}

module.exports = { runConcurrentBatchArchitecture };
