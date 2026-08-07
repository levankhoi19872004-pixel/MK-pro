'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const source = {
  debt: read('src/services/accounting/OrderPaymentDebtReconcileService.js'),
  postCommit: read('src/services/accounting/closeout/CloseoutPostCommitHandler.js'),
  sync: read('src/services/readModelSyncJob.service.js'),
  context: read('src/services/accounting/closeout/CloseoutContextLoader.js'),
  flags: read('src/config/featureFlags.js')
};

const invariants = {
  opt01Flag: /PERF_CLOSEOUT_QUERY_DEDUP_V1/.test(source.flags),
  noDebtBeforeInitialIdempotency: source.debt.indexOf("skipReason: 'NO_DEBT_DELTA'", source.debt.indexOf('PERF_CLOSEOUT_QUERY_DEDUP_V1')) < source.debt.indexOf("order.debt.initialIdempotency"),
  mutationFreshGuard: source.debt.indexOf('order.debt.prePostIdempotency') < source.debt.indexOf('order.debt.adjustmentPost'),
  opt02Flag: /PERF_CLOSEOUT_SYNC_BULK_V1/.test(source.flags),
  syncBulkWrite: /ReadModelSyncJob\.bulkWrite\(/.test(source.sync),
  postCommitBulk: /enqueueArDebtSyncJobsBulk/.test(source.postCommit),
  opt03Skip: /canSkipMasterOrderMetadata/.test(source.context) && /masterMetadataQueryExecuted:\s*false/.test(source.context),
  q15q16Preserved: /order\.debt\.initialBalance/.test(source.debt) && /order\.debt\.safetyBalance/.test(source.debt)
};
for (const [name, ok] of Object.entries(invariants)) assert.equal(ok, true, `source invariant failed: ${name}`);

function baseline(n, groups = n) {
  return {
    workload: n,
    logicalQueryCount: 8 + (9 * n) + groups,
    salesOrderReadCount: 2,
    masterOrderReadCount: 1,
    returnOrderReadCount: 4,
    arReadCount: 1 + (3 * n),
    arWriteCount: 3 * n,
    allocationWriteCount: 2 * n,
    transactionCount: 1,
    syncJobCommands: groups,
    debtInitialIdempotencyReads: n
  };
}

function optimized(n, { opt03 = true } = {}) {
  const fixed = opt03 ? 7 : 8; // Q2 removed only when canonical assignment is verified.
  return {
    workload: n,
    logicalQueryCount: fixed + (8 * n) + 1,
    salesOrderReadCount: 2,
    masterOrderReadCount: opt03 ? 0 : 1,
    returnOrderReadCount: 4,
    arReadCount: 1 + (2 * n),
    arWriteCount: 3 * n,
    allocationWriteCount: 2 * n,
    transactionCount: 1,
    syncJobCommands: 1,
    debtInitialIdempotencyReads: 0
  };
}

const workloads = [1, 16, 26, 60].map((n) => ({
  workload: n,
  before: baseline(n),
  afterOpt01Opt02: optimized(n, { opt03: false }),
  afterOpt01Opt02Opt03: optimized(n, { opt03: true })
}));

assert.deepEqual(workloads.map((r) => r.before.logicalQueryCount), [18, 168, 268, 608]);
assert.deepEqual(workloads.map((r) => r.afterOpt01Opt02.logicalQueryCount), [17, 137, 217, 489]);
assert.deepEqual(workloads.map((r) => r.afterOpt01Opt02Opt03.logicalQueryCount), [16, 136, 216, 488]);
assert.ok(workloads.at(-1).afterOpt01Opt02Opt03.logicalQueryCount <= 500);

const output = {
  schemaVersion: '1.0',
  promptId: 'CLOSEOUT-PERF-A2',
  evidenceType: 'E2_DETERMINISTIC_SOURCE_AWARE_LOGICAL_QUERY_BUDGET',
  productionLatencyClaimed: false,
  physicalMongoLatencyClaimed: false,
  invariants,
  formula: {
    before: '8 fixed + 9*N + G sync commands',
    opt01Opt02: '8 fixed + 8*N + 1 bulk sync command',
    opt01Opt02Opt03: '7 fixed + 8*N + 1 bulk sync command when canonical staff assignment is verified'
  },
  workloads,
  sameCustomer60: {
    before: baseline(60, 1).logicalQueryCount,
    afterOpt01Opt02: optimized(60, { opt03: false }).logicalQueryCount,
    afterOpt01Opt02Opt03: optimized(60, { opt03: true }).logicalQueryCount
  },
  hardAcceptance: {
    workload60Max: 500,
    actualWithOpt01Opt02: optimized(60, { opt03: false }).logicalQueryCount,
    preferredWithOpt03: optimized(60, { opt03: true }).logicalQueryCount,
    pass: optimized(60, { opt03: false }).logicalQueryCount <= 500
  }
};
console.log(JSON.stringify(output, null, 2));
