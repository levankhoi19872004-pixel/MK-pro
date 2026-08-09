'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../../../src/observability/performanceMeasurementStore');
const monitor = require('../../../src/middlewares/apiMonitor.middleware');
const closeoutAudit = require('../../../src/observability/closeoutQueryAudit');

const CLOSEOUT_FLAGS = [
  'PERF_CLOSEOUT_QUERY_DEDUP_V1',
  'PERF_CLOSEOUT_SYNC_BULK_V1',
  'PERF_CLOSEOUT_AR_BALANCE_BATCH_V1',
  'PERF_CLOSEOUT_ALLOCATION_POSTEDREFS_BATCH_V1',
  'PERF_CLOSEOUT_AR_WRITE_BULK_V1',
  'PERF_BULK_CONCURRENCY',
  'PERF_BULK_TRANSIENT_RETRY_LIMIT'
];

function envWithCloseoutFlags(arBulk = '0') {
  return {
    PERF_CLOSEOUT_QUERY_DEDUP_V1: '1',
    PERF_CLOSEOUT_SYNC_BULK_V1: '1',
    PERF_CLOSEOUT_AR_BALANCE_BATCH_V1: '1',
    PERF_CLOSEOUT_ALLOCATION_POSTEDREFS_BATCH_V1: '1',
    PERF_CLOSEOUT_AR_WRITE_BULK_V1: arBulk,
    PERF_BULK_CONCURRENCY: '1',
    PERF_BULK_TRANSIENT_RETRY_LIMIT: '1'
  };
}

test('G5A OBS-GAP-01: closeout feature flags are part of immutable sample-window snapshot', () => {
  for (const flag of CLOSEOUT_FLAGS) assert.ok(store.FLAG_NAMES.includes(flag), `missing ${flag}`);
  const off = store.snapshotFlags(envWithCloseoutFlags('0'));
  const on = store.snapshotFlags(envWithCloseoutFlags('1'));
  assert.equal(off.PERF_CLOSEOUT_AR_WRITE_BULK_V1, '0');
  assert.equal(on.PERF_CLOSEOUT_AR_WRITE_BULK_V1, '1');
  assert.notDeepEqual(off, on);
});

test('G5A OBS-GAP-02: closeout selectedOrderIds cardinality is deduplicated and prioritized', () => {
  assert.equal(typeof monitor._private.resolveMeasurementWorkload, 'function');
  const ids = Array.from({ length: 21 }, (_, i) => `id-${i + 1}`);
  const req = {
    method: 'POST',
    path: '/api/new/delivery-today/closeout',
    originalUrl: '/api/new/delivery-today/closeout',
    body: { selectedOrderIds: [...ids, ids[0]], orderIds: ['ignored-because-selected-has-priority'] }
  };
  assert.deepEqual(monitor._private.resolveMeasurementWorkload(req), { inputSize: 21, orderCount: 21, source: 'selectedOrderIds' });
});

test('G5A OBS-GAP-03: physical Mongo counters survive completeMeasurement and export aggregation', () => {
  store._testing.resetForTest();
  const window = store.startWindow('g5a-physical', { productionMode: false, allowUnknown: true, env: envWithCloseoutFlags('1') });
  const start = store.beginMeasurement({ endpoint: '/api/new/delivery-today/closeout', httpMethod: 'POST', orderCount: 21, inputSize: 21 });
  const row = store.completeMeasurement(start, {
    durationMs: 36084,
    mongoDurationMs: 26728,
    jsDurationMs: 9356,
    queryCount: 124,
    queryExecCount: 120,
    aggregateExecCount: 4,
    bulkWriteCommandCount: 8,
    bulkOperationCount: 63,
    modelCreateSaveCommandCount: 35,
    physicalMongoCommandCount: 167,
    statusCode: 200
  });
  store.closeWindow();
  assert.equal(row.physicalMongoCommandCount, 167);
  assert.equal(row.bulkWriteCommandCount, 8);
  assert.equal(row.bulkOperationCount, 63);
  assert.equal(row.modelCreateSaveCommandCount, 35);
  const exported = store.exportWindow(window.id);
  assert.equal(exported.records[0].physicalMongoCommandCount, 167);
  assert.equal(exported.groups[0].physicalMongoCommandCountAvg, 167);
  assert.equal(exported.groups[0].physicalMongoCommandCountP95, 167);
  assert.equal(exported.groups[0].bulkWriteCommandCountAvg, 8);
  assert.equal(exported.groups[0].bulkOperationCountMax, 63);
  assert.equal(exported.groups[0].orderCountAvg, 21);
  assert.equal(exported.groups[0].mongoP95Ms, 26728);
});

test('G5A OBS-GAP-04: closeout audit supports sanitized runtime execution proof', async () => {
  assert.equal(typeof closeoutAudit.recordRuntimeExecutionSummary, 'function');
  closeoutAudit.resetForTests();
  const env = { CLOSEOUT_QUERY_AUDIT_ENABLED: '1', NODE_ENV: 'test' };
  const req = { requestId: 'req-g5a', method: 'POST', originalUrl: '/api/new/delivery-today/closeout' };
  const res = { statusCode: 200 };
  await closeoutAudit.withCloseoutAuditRequest(req, res, async () => {
    closeoutAudit.recordRuntimeExecutionSummary({
      arBulk: { enabled: true, intentCount: 63, arPreflightReadCommands: 1, arBulkWriteCommands: 1, arReadbackCommands: 1, legacyArWriteCommands: 0, bulkOperationCount: 63, wholeTransactionRaceRetries: 0, transactionCount: 1, idempotencyKey: 'SECRET' },
      allocationPostedRefsBatch: { enabled: true, planned: 21, commandCount: 1, operationCount: 21, customerCode: 'C001' },
      arBalanceBatch: { enabled: true, scopeCount: 21, rawQueryCount: 21, canonicalQueryCount: 1 },
      orderIds: ['must-not-leak']
    });
    const summary = closeoutAudit.getCurrentAuditSummary();
    assert.deepEqual(summary.runtimeExecution.arBulk, {
      enabled: true,
      intentCount: 63,
      arPreflightReadCommands: 1,
      arBulkWriteCommands: 1,
      arReadbackCommands: 1,
      legacyArWriteCommands: 0,
      bulkOperationCount: 63,
      wholeTransactionRaceRetries: 0,
      transactionCount: 1
    });
    assert.deepEqual(summary.runtimeExecution.allocationPostedRefsBatch, { enabled: true, planned: 21, commandCount: 1, operationCount: 21 });
    assert.deepEqual(summary.runtimeExecution.arBalanceBatch, { enabled: true, scopeCount: 21, rawQueryCount: 21, canonicalQueryCount: 1 });
    assert.ok(!JSON.stringify(summary.runtimeExecution).includes('SECRET'));
    assert.ok(!JSON.stringify(summary.runtimeExecution).includes('C001'));
    assert.ok(!JSON.stringify(summary.runtimeExecution).includes('must-not-leak'));
  }, env);
});

test('G5A OBS-GAP-04 path proof distinguishes AR bulk ON from OFF/all-existing', () => {
  assert.equal(typeof closeoutAudit.runtimePathProof, 'function');
  assert.equal(closeoutAudit.runtimePathProof({ enabled: true, intentCount: 63, arPreflightReadCommands: 1, arBulkWriteCommands: 1, arReadbackCommands: 1, legacyArWriteCommands: 0 }).mode, 'AR_BULK_NEW_INTENTS');
  assert.equal(closeoutAudit.runtimePathProof({ enabled: true, intentCount: 10, arPreflightReadCommands: 1, arBulkWriteCommands: 0, arReadbackCommands: 1, legacyArWriteCommands: 0 }).mode, 'AR_BULK_ALL_EXISTING');
  assert.equal(closeoutAudit.runtimePathProof({ enabled: false, arBulkWriteCommands: 0, arReadbackCommands: 0, legacyArWriteCommands: 30 }).mode, 'LEGACY_AR_PER_ENTRY');
});

test('G5A OBS-GAP-05: writer safety map includes guarded transactional ArLedger.bulkWrite owner', () => {
  const map = closeoutAudit.writerSafetyMap();
  assert.ok(map.writers.some((row) => row.model === 'arLedgers' && row.operation === 'bulkWrite' && row.owner === 'CloseoutArBatchPostingService.postEligibleArIntentsBatch' && row.transactionScoped === true));
});

test('G5A middleware integration: 21 selectedOrderIds and physical counters survive request -> export', () => {
  const { EventEmitter } = require('node:events');
  store._testing.resetForTest();
  const window = store.startWindow('middleware-integration', { productionMode: false, allowUnknown: true });
  const ids = Array.from({ length: 21 }, (_, i) => `order-${i + 1}`);
  const req = {
    method: 'POST',
    path: '/api/new/delivery-today/closeout',
    originalUrl: '/api/new/delivery-today/closeout',
    body: { selectedOrderIds: ids },
    query: {},
    user: { id: 'scope-user' },
    log: { info() {}, warn() {} }
  };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  res.headers = {};
  res.set = (key, value) => { res.headers[String(key).toLowerCase()] = String(value); return res; };
  res.getHeader = (key) => res.headers[String(key).toLowerCase()];
  res.json = (body) => body;
  monitor.apiMonitor(req, res, () => {
    monitor._private.recordPhysicalMongoCommand('queryExec');
    monitor._private.recordPhysicalMongoCommand('bulkWrite', { bulkOperationCount: 63 });
    monitor._private.recordPhysicalMongoCommand('modelCreateSave');
    res.json({ ok: true });
    res.emit('finish');
  });
  store.closeWindow();
  const exported = store.exportWindow(window.id);
  assert.equal(exported.sampleCount, 1);
  assert.equal(exported.records[0].orderCount, 21);
  assert.equal(exported.records[0].queryCount, 1);
  assert.equal(exported.records[0].bulkWriteCommandCount, 1);
  assert.equal(exported.records[0].bulkOperationCount, 63);
  assert.equal(exported.records[0].modelCreateSaveCommandCount, 1);
  assert.equal(exported.records[0].physicalMongoCommandCount, 3);
  assert.equal(exported.groups[0].orderCountAvg, 21);
  assert.equal(exported.groups[0].physicalMongoCommandCountAvg, 3);
});

test('G5A sample windows make AR bulk OFF and ON separately attributable', () => {
  store._testing.resetForTest();
  const off = store.startWindow('ar-bulk-off', { productionMode: false, allowUnknown: true, env: envWithCloseoutFlags('0') });
  store.completeMeasurement(store.beginMeasurement({ endpoint: '/api/new/delivery-today/closeout', httpMethod: 'POST', orderCount: 5 }), { durationMs: 10, statusCode: 200 });
  store.closeWindow();
  const on = store.startWindow('ar-bulk-on', { productionMode: false, allowUnknown: true, env: envWithCloseoutFlags('1') });
  store.completeMeasurement(store.beginMeasurement({ endpoint: '/api/new/delivery-today/closeout', httpMethod: 'POST', orderCount: 5 }), { durationMs: 8, statusCode: 200 });
  store.closeWindow();
  const offExport = store.exportWindow(off.id);
  const onExport = store.exportWindow(on.id);
  assert.equal(offExport.groups[0].featureFlags.PERF_CLOSEOUT_AR_WRITE_BULK_V1, '0');
  assert.equal(onExport.groups[0].featureFlags.PERF_CLOSEOUT_AR_WRITE_BULK_V1, '1');
  assert.notEqual(offExport.groups[0].sampleWindowId, onExport.groups[0].sampleWindowId);
});

// G5A-R1 actual-service attribution matrix. Uses the production G4 batch service telemetry.
const r1BatchService = require('../../../src/services/accounting/closeout/CloseoutArBatchPostingService');

function r1Row(key, amount = 100, category = 'AR-SALE', overrides = {}) {
  const suffix = key.replace(/[^A-Za-z0-9]/g, '-');
  const debit = category === 'AR-SALE' ? amount : 0;
  const credit = category === 'AR-SALE' ? 0 : amount;
  return {
    id: `${category}-${suffix}`, code: `${category}-${suffix}`, account: 'AR', category,
    ledgerType: category, entryType: 'normal', type: category.toLowerCase(),
    direction: debit ? 'debit' : 'credit', amountField: debit ? 'debit' : 'credit',
    customerCode: 'C001', orderId: 'O001', orderCode: 'O001', salesOrderId: 'O001', salesOrderCode: 'O001',
    sourceType: 'ORDER_PAYMENT_ALLOCATION', sourceId: 'O001', sourceCode: 'O001',
    refType: 'ORDER_PAYMENT_ALLOCATION', refId: 'OPA-O001-v1', refCode: 'OPA-O001-v1',
    amount, debit, credit, accountingConfirmed: true, accountingStatus: 'confirmed', active: true, reversed: false,
    idempotencyKey: key, ...overrides
  };
}

function r1Repository(initialRows = []) {
  const state = initialRows.map((item) => ({ ...item }));
  const calls = { reads: 0, bulks: 0, bulkRows: 0 };
  return {
    calls,
    async findByIdempotencyKeys(keys) {
      calls.reads += 1;
      return state.filter((item) => keys.includes(item.idempotencyKey)).map((item) => ({ ...item }));
    },
    async bulkUpsert(rows) {
      calls.bulks += 1;
      calls.bulkRows += rows.length;
      for (const item of rows) if (!state.some((existing) => existing.idempotencyKey === item.idempotencyKey)) state.push({ ...item, _id: `mongo-${item.id}` });
      return { upsertedCount: rows.length };
    }
  };
}

function r1Proof(intentCount, telemetry) {
  return closeoutAudit.runtimePathProof({ enabled: true, intentCount, ...telemetry });
}

test('G5A-R1 actual service: ALL_EXISTING preflight=1/bulk=0/readback=0 is attributable', async () => {
  const intents = [r1Row('R1-E1'), r1Row('R1-E2', 50, 'AR-RECEIPT-CASH'), r1Row('R1-E3', 25, 'AR-REWARD-ALLOWANCE')];
  const repository = r1Repository(intents);
  const out = await r1BatchService.postEligibleArIntentsBatch(intents, { repository, session: { id: 'r1-existing' }, suppressConflictAuditForTest: true });
  assert.deepEqual(out.telemetry, { arPreflightReadCommands: 1, arBulkWriteCommands: 0, arReadbackCommands: 0, legacyArWriteCommands: 0, bulkOperationCount: 0 });
  assert.deepEqual(r1Proof(intents.length, out.telemetry), { mode: 'AR_BULK_ALL_EXISTING', attributable: true });
  assert.equal(repository.calls.reads, 1);
  assert.equal(repository.calls.bulks, 0);
});

test('G5A-R1 actual service: 3 NEW intents classify AR_BULK_NEW_INTENTS', async () => {
  const intents = [r1Row('R1-N1'), r1Row('R1-N2', 50, 'AR-RECEIPT-CASH'), r1Row('R1-N3', 25, 'AR-REWARD-ALLOWANCE')];
  const repository = r1Repository();
  const out = await r1BatchService.postEligibleArIntentsBatch(intents, { repository, session: { id: 'r1-new' }, suppressConflictAuditForTest: true });
  assert.deepEqual(out.telemetry, { arPreflightReadCommands: 1, arBulkWriteCommands: 1, arReadbackCommands: 1, legacyArWriteCommands: 0, bulkOperationCount: 3 });
  assert.deepEqual(r1Proof(intents.length, out.telemetry), { mode: 'AR_BULK_NEW_INTENTS', attributable: true });
});

test('G5A-R1 actual service: mixed existing/new remains attributable optimized path', async () => {
  const intents = [r1Row('R1-M1'), r1Row('R1-M2', 50, 'AR-RECEIPT-CASH'), r1Row('R1-M3', 25, 'AR-REWARD-ALLOWANCE')];
  const repository = r1Repository([intents[1]]);
  const out = await r1BatchService.postEligibleArIntentsBatch(intents, { repository, session: { id: 'r1-mixed' }, suppressConflictAuditForTest: true });
  assert.deepEqual({ preflight: out.telemetry.arPreflightReadCommands, bulk: out.telemetry.arBulkWriteCommands, readback: out.telemetry.arReadbackCommands, legacy: out.telemetry.legacyArWriteCommands, ops: out.telemetry.bulkOperationCount }, { preflight: 1, bulk: 1, readback: 1, legacy: 0, ops: 2 });
  assert.deepEqual(r1Proof(intents.length, out.telemetry), { mode: 'AR_BULK_NEW_INTENTS', attributable: true });
});

test('G5A-R1 actual service: zero intents classify AR_BULK_NO_INTENTS', async () => {
  const out = await r1BatchService.postEligibleArIntentsBatch([], { repository: r1Repository(), session: { id: 'r1-zero' } });
  assert.deepEqual(r1Proof(0, out.telemetry), { mode: 'AR_BULK_NO_INTENTS', attributable: true });
});

test('G5A-R1 impossible runtime shapes remain AR_BULK_UNKNOWN', () => {
  assert.deepEqual(closeoutAudit.runtimePathProof({ enabled: true, intentCount: 3, arPreflightReadCommands: 0, arBulkWriteCommands: 1, arReadbackCommands: 0, legacyArWriteCommands: 0 }), { mode: 'AR_BULK_UNKNOWN', attributable: false });
  assert.deepEqual(closeoutAudit.runtimePathProof({ enabled: true, intentCount: 3, arPreflightReadCommands: 1, arBulkWriteCommands: 0, arReadbackCommands: 2, legacyArWriteCommands: 0 }), { mode: 'AR_BULK_UNKNOWN', attributable: false });
  assert.deepEqual(closeoutAudit.runtimePathProof({ enabled: true, intentCount: 3, arPreflightReadCommands: 1, arBulkWriteCommands: 0, arReadbackCommands: 0, legacyArWriteCommands: 1 }), { mode: 'AR_BULK_UNKNOWN', attributable: false });
});
