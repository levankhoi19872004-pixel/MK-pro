'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

function loadBatchService() {
  return require(path.join(root, 'src/services/accounting/closeout/CloseoutArBatchPostingService'));
}

function queryOf(rows, capture = {}) {
  return {
    session(value) { capture.session = value; return this; },
    lean() { capture.lean = true; return this; },
    exec: async () => rows
  };
}

function makeRepository(initialRows = [], hooks = {}) {
  const state = initialRows.map((row) => ({ ...row }));
  const calls = { reads: [], bulks: [] };
  return {
    calls,
    state,
    async findByIdempotencyKeys(keys, options = {}) {
      calls.reads.push({ keys: [...keys], session: options.session });
      return state.filter((row) => keys.includes(row.idempotencyKey)).map((row) => ({ ...row }));
    },
    async bulkUpsert(rows, options = {}) {
      calls.bulks.push({ rows: rows.map((row) => ({ ...row })), session: options.session, ordered: options.ordered });
      if (hooks.bulkError) throw hooks.bulkError;
      for (const row of rows) {
        if (!state.some((item) => item.idempotencyKey === row.idempotencyKey)) state.push({ ...row, _id: `mongo-${row.id}` });
      }
      return { matchedCount: 0, upsertedCount: rows.length };
    }
  };
}

function row(key, amount = 100, category = 'AR-SALE', overrides = {}) {
  const suffix = key.replace(/[^A-Za-z0-9]/g, '-');
  const debit = category === 'AR-SALE' ? amount : 0;
  const credit = category === 'AR-SALE' ? 0 : amount;
  return {
    id: `${category}-${suffix}`,
    code: `${category}-${suffix}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    type: category.toLowerCase(),
    direction: debit ? 'debit' : 'credit',
    amountField: debit ? 'debit' : 'credit',
    customerCode: 'C001',
    orderId: 'O001',
    orderCode: 'O001',
    salesOrderId: 'O001',
    salesOrderCode: 'O001',
    sourceType: 'ORDER_PAYMENT_ALLOCATION',
    sourceId: 'O001',
    sourceCode: 'O001',
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: 'OPA-O001-v1',
    refCode: 'OPA-O001-v1',
    amount,
    debit,
    credit,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    idempotencyKey: key,
    ...overrides
  };
}

test('G4 RED/GREEN: feature flag PERF_CLOSEOUT_AR_WRITE_BULK_V1 exists and defaults OFF', () => {
  const featureFlags = require(path.join(root, 'src/config/featureFlags'));
  assert.equal(typeof featureFlags.FLAGS.closeoutArWriteBulkV1, 'function');
  const old = process.env.PERF_CLOSEOUT_AR_WRITE_BULK_V1;
  delete process.env.PERF_CLOSEOUT_AR_WRITE_BULK_V1;
  try { assert.equal(featureFlags.FLAGS.closeoutArWriteBulkV1(), false); }
  finally { if (old === undefined) delete process.env.PERF_CLOSEOUT_AR_WRITE_BULK_V1; else process.env.PERF_CLOSEOUT_AR_WRITE_BULK_V1 = old; }
});

test('G4 RED/GREEN: 3 NEW intents use one preflight + one bulk + one readback, same session', async () => {
  const service = loadBatchService();
  const repository = makeRepository();
  const session = { id: 'tx-1' };
  const rows = [row('K1', 100), row('K2', 50, 'AR-RECEIPT-CASH'), row('K3', 25, 'AR-REWARD-ALLOWANCE')];
  const result = await service.postEligibleArIntentsBatch(rows, { session, repository });
  assert.equal(repository.calls.reads.length, 2);
  assert.equal(repository.calls.bulks.length, 1);
  assert.equal(repository.calls.bulks[0].rows.length, 3);
  assert.equal(repository.calls.bulks[0].session, session);
  assert.equal(repository.calls.reads[0].session, session);
  assert.equal(repository.calls.reads[1].session, session);
  assert.deepEqual(result.entries.map((entry) => entry.idempotencyKey), ['K1', 'K2', 'K3']);
  assert.equal(result.telemetry.arPreflightReadCommands, 1);
  assert.equal(result.telemetry.arBulkWriteCommands, 1);
  assert.equal(result.telemetry.arReadbackCommands, 1);
  assert.equal(result.telemetry.bulkOperationCount, 3);
});

test('G4 RED/GREEN: all EXISTING equivalent intents are idempotent and create no bulk writes', async () => {
  const service = loadBatchService();
  const rows = [row('K1'), row('K2', 50, 'AR-RECEIPT-CASH')];
  const repository = makeRepository(rows);
  const result = await service.postEligibleArIntentsBatch(rows, { session: { id: 'tx' }, repository });
  assert.equal(repository.calls.bulks.length, 0);
  assert.equal(repository.calls.reads.length, 1);
  assert.equal(result.postingResults.every((item) => item.alreadyExists), true);
});

test('G4 RED/GREEN: mixed existing/new persists only NEW intents and returns original intent ordering', async () => {
  const service = loadBatchService();
  const rows = [row('K1'), row('K2', 50, 'AR-RECEIPT-CASH'), row('K3', 25, 'AR-REWARD-ALLOWANCE')];
  const repository = makeRepository([rows[1]]);
  const result = await service.postEligibleArIntentsBatch(rows, { session: { id: 'tx' }, repository });
  assert.deepEqual(repository.calls.bulks[0].rows.map((item) => item.idempotencyKey), ['K1', 'K3']);
  assert.deepEqual(result.entries.map((item) => item.idempotencyKey), ['K1', 'K2', 'K3']);
});

test('G4 RED/GREEN: conflicting existing payload fails with legacy P0 code', async () => {
  const service = loadBatchService();
  const incoming = row('K1', 100);
  const repository = makeRepository([row('K1', 101)]);
  await assert.rejects(
    service.postEligibleArIntentsBatch([incoming], { session: { id: 'tx' }, repository, suppressConflictAuditForTest: true }),
    (err) => err && err.code === 'AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT' && err.severity === 'P0'
  );
  assert.equal(repository.calls.bulks.length, 0);
});

test('G4 RED/GREEN: duplicate idempotencyKey inside request batch fails closed before Mongo', async () => {
  const service = loadBatchService();
  const repository = makeRepository();
  await assert.rejects(
    service.postEligibleArIntentsBatch([row('K1'), row('K1')], { repository, session: { id: 'tx' } }),
    (err) => err && err.code === 'AR_BATCH_DUPLICATE_IDEMPOTENCY_KEY'
  );
  assert.equal(repository.calls.reads.length, 0);
  assert.equal(repository.calls.bulks.length, 0);
});

test('G4 RED/GREEN: deterministic id/code collision inside batch fails closed', async () => {
  const service = loadBatchService();
  const repository = makeRepository();
  const a = row('K1');
  const b = row('K2', 50, 'AR-RECEIPT-CASH', { id: a.id });
  await assert.rejects(service.postEligibleArIntentsBatch([a, b], { repository }), (err) => err && err.code === 'AR_BATCH_DETERMINISTIC_ID_COLLISION');
  assert.equal(repository.calls.reads.length, 0);
});

test('G4 RED/GREEN: E11000 on idempotency unique guard is marked for whole-transaction retry and no readback occurs', async () => {
  const service = loadBatchService();
  const error = Object.assign(new Error('E11000 duplicate key index: uniq_arledger_idempotency_key_v1'), {
    code: 11000,
    keyPattern: { idempotencyKey: 1 },
    index: 'uniq_arledger_idempotency_key_v1'
  });
  const repository = makeRepository([], { bulkError: error });
  await assert.rejects(service.postEligibleArIntentsBatch([row('K1')], { repository, session: { id: 'tx' } }), (err) => {
    assert.equal(err.code, 11000);
    assert.equal(err.arBatchRetryWholeTransaction, true);
    return true;
  });
  assert.equal(repository.calls.reads.length, 1, 'must not readback in failed transaction');
});

test('G4 RED/GREEN: readback missing expected row is P0', async () => {
  const service = loadBatchService();
  let readCount = 0;
  const repository = {
    async findByIdempotencyKeys() { readCount += 1; return []; },
    async bulkUpsert() { return { upsertedCount: 1 }; }
  };
  await assert.rejects(service.postEligibleArIntentsBatch([row('K1')], { repository, session: { id: 'tx' } }), (err) => err && err.code === 'AR_BATCH_READBACK_MISSING');
  assert.equal(readCount, 2);
});

test('G4 RED/GREEN: production batch service uses bulkWrite updateOne+$setOnInsert+upsert and never Promise.all', () => {
  const file = path.join(root, 'src/services/accounting/closeout/CloseoutArBatchPostingService.js');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /bulkWrite/);
  assert.match(source, /\$setOnInsert/);
  assert.match(source, /upsert:\s*true/);
  assert.doesNotMatch(source, /Promise\.all\s*\(/);
});

test('G4 RED/GREEN: runner integrates request-level AR batch before debt finalization and keeps allocation batch after', () => {
  const source = fs.readFileSync(path.join(root, 'src/services/accounting/closeout/CloseoutTransactionRunner.js'), 'utf8');
  assert.match(source, /closeoutArWriteBulkV1/);
  assert.match(source, /prepareOneOrderForArBulk/);
  assert.match(source, /postEligibleArIntentsBatch/);
  assert.match(source, /finalizePreparedOrderAfterArBulk/);
  const arPos = source.indexOf('.postEligibleArIntentsBatch(');
  const finalPos = source.indexOf('() => finalizePreparedOrderAfterArBulk(');
  const allocationPos = source.indexOf('.flushFinalAllocationUpdatePlans(');
  assert.ok(arPos >= 0 && finalPos > arPos && allocationPos > finalPos);
});
