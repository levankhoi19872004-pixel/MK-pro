'use strict';

const mongoose = require('mongoose');
const CloseoutCriticalReader = require('../src/services/accounting/closeout/CloseoutCriticalReader');
const CloseoutTransactionRunner = require('../src/services/accounting/closeout/CloseoutTransactionRunner');
const CloseoutPostCommitHandler = require('../src/services/accounting/closeout/CloseoutPostCommitHandler');
const readModelSyncJobService = require('../src/services/readModelSyncJob.service');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `SO${String(index + 1).padStart(5, '0')}`,
    code: `B${String(index + 1).padStart(5, '0')}`,
    customerCode: `C${String(index % 10).padStart(3, '0')}`,
    accountingConfirmed: false
  }));
}

function memorySnapshot() {
  if (global.gc) global.gc();
  return process.memoryUsage();
}

function mb(value) {
  return Math.round((Number(value) || 0) / 1024 / 1024 * 100) / 100;
}

function patch(object, replacements) {
  const old = {};
  for (const [key, value] of Object.entries(replacements)) {
    old[key] = object[key];
    object[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(old)) object[key] = value;
  };
}

async function measure(label, fn) {
  const startedMemory = memorySnapshot();
  const startedAt = Date.now();
  const result = await fn();
  const endedMemory = memorySnapshot();
  return {
    label,
    durationMs: Date.now() - startedAt,
    heapDeltaMB: mb(endedMemory.heapUsed - startedMemory.heapUsed),
    heapUsedMB: mb(endedMemory.heapUsed),
    ...result
  };
}

async function runLegacyLikeFixture(orders) {
  const stats = { readQueriesInTx: 0, writeOpsInTx: 0, postCommitOps: 0, ledgerRows: 0, syncEnqueueInTx: 0 };
  const txStartedAt = Date.now();
  const syncGroups = new Set();
  for (const order of orders) {
    stats.writeOpsInTx += 4;
    stats.ledgerRows += 3;
    syncGroups.add(order.customerCode || '(missing-customer)');
    void order;
  }
  stats.syncEnqueueInTx += syncGroups.size;
  stats.writeOpsInTx += syncGroups.size;
  return {
    transactionDurationMs: Date.now() - txStartedAt,
    totalDurationMs: Date.now() - txStartedAt,
    ...stats
  };
}

async function runPhase238Fixture(orders) {
  const stats = { readQueriesInTx: 0, writeOpsInTx: 0, postCommitOps: 0, ledgerRows: 0, syncEnqueueInTx: 0 };
  const txSession = {
    async withTransaction(work) { return work(); },
    async endSession() {}
  };
  const restoreMongoose = patch(mongoose, { startSession: async () => txSession });
  const restoreCritical = patch(CloseoutCriticalReader, {
    loadCriticalOrdersAndReturns: async (inputOrders, options = {}) => {
      if (options.session !== txSession) throw new Error('critical read missing transaction session');
      stats.readQueriesInTx += 2;
      return { orders: inputOrders.map((row) => ({ ...row })), returnOrders: [] };
    }
  });
  const restoreSync = patch(readModelSyncJobService, {
    enqueueArDebtSyncJobs: async () => {
      stats.postCommitOps += 1;
      return { queued: 1, jobs: [{ id: 'JOB', idempotencyKey: 'IDEM' }] };
    },
    scheduleDrain: () => ({ scheduled: true })
  });
  try {
    const results = [];
    const txStartedAt = Date.now();
    const transactionResult = await CloseoutTransactionRunner.runCloseoutTransaction({
      pendingConfirmOrders: orders,
      results,
      assertReturnOrdersInventoryReady: () => true,
      confirmOneOrder: async (order, _returns, options = {}) => {
        if (options.session !== txSession) throw new Error('write missing transaction session');
        stats.writeOpsInTx += 4;
        stats.ledgerRows += 3;
        return {
          confirmed: true,
          readModelSyncNeeded: true,
          affectedCustomerCode: order.customerCode,
          affectedSourceId: order.id,
          orderId: order.id
        };
      }
    });
    const transactionDurationMs = Date.now() - txStartedAt;
    await CloseoutPostCommitHandler.enqueueReadModelSync(transactionResult.syncGroups, {
      actor: 'benchmark',
      reason: 'phase238 benchmark'
    });
    return {
      transactionDurationMs,
      totalDurationMs: Date.now() - txStartedAt,
      ...stats
    };
  } finally {
    restoreSync();
    restoreCritical();
    restoreMongoose();
  }
}

async function main() {
  const counts = String(arg('orders', '1,10,50'))
    .split(',')
    .map((value) => Math.max(1, Number(value.trim()) || 0))
    .filter(Boolean);
  const results = [];
  for (const count of counts) {
    const data = rows(count);
    results.push(await measure(`baseline_like.${count}`, () => runLegacyLikeFixture(data)));
    results.push(await measure(`phase238.${count}`, () => runPhase238Fixture(data)));
  }
  console.log(JSON.stringify({
    ok: true,
    runtime: 'in-memory-fixture',
    productionRuntime: 'BLOCKED',
    exposeGc: typeof global.gc === 'function',
    orders: counts,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
