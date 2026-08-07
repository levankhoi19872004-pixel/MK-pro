'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBarrier } = require('./deterministic-race-repository');
const arPostingService = require('../../../src/services/arPosting.service');
const {
  normalizeIdempotencyKey,
  buildFinancialPayload,
  assertNonNegativeLedgerAmounts
} = require('../../../src/domain/ar/arLedgerIdempotencyGuard');
const { summarizeRows } = require('../../../scripts/lib/arLedgerIdempotencyAudit');
const { applyDebtZeroTolerance } = require('../../../src/services/accounting/deliveryCloseoutCalculator');
const { AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX } = require('../../../src/domain/ar/arLedgerIdempotencyIndexContract');
const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function query(executor) {
  let currentSession = null;
  return {
    session(session) { currentSession = session; return this; },
    lean() { return this; },
    exec() { return executor(currentSession); },
    then(resolve, reject) { return executor(currentSession).then(resolve, reject); }
  };
}

function sameKey(row, filter) {
  return row && row.idempotencyKey === filter.idempotencyKey;
}

function createModels(options = {}) {
  const rows = [];
  const audits = [];
  const barrier = options.concurrentBarrier ? createBarrier(2) : null;
  let unknownCommitThrown = false;

  function visibleRows(session = null) {
    return session?.stagedRows ? rows.concat(session.stagedRows) : rows;
  }

  const ArLedger = {
    findOne(filter) {
      return query(async (session) => clone(visibleRows(session).find((row) => sameKey(row, filter)) || null));
    },
    find() {
      return query(async (session) => clone(visibleRows(session)));
    },
    findOneAndUpdate(filter, update, opts = {}) {
      return query(async () => {
        const targetRows = opts.session?.stagedRows || rows;
        const existingBefore = visibleRows(opts.session).find((row) => sameKey(row, filter));
        if (existingBefore) return clone(existingBefore);
        if (barrier) await barrier();
        const existingAfter = visibleRows(opts.session).find((row) => sameKey(row, filter));
        if (existingAfter) {
          const error = new Error('E11000 duplicate key error collection: arLedgers');
          error.code = 11000;
          throw error;
        }
        if (options.failBeforeInsert) throw new Error('simulated write failure');
        const inserted = { ...clone(update.$setOnInsert), _id: `ledger-${rows.length + targetRows.length + 1}` };
        targetRows.push(inserted);
        if (options.unknownCommitOnce && !unknownCommitThrown) {
          unknownCommitThrown = true;
          const error = new Error('unknown transaction commit result');
          error.errorLabels = ['UnknownTransactionCommitResult'];
          throw error;
        }
        return clone(inserted);
      });
    },
    updateOne: async () => ({ acknowledged: true })
  };

  const AuditLog = {
    async create(items) {
      audits.push(...clone(items));
      return clone(items);
    }
  };

  function createSession() {
    return {
      stagedRows: [],
      async withTransaction(work) {
        try {
          const result = await work();
          rows.push(...this.stagedRows);
          this.stagedRows = [];
          return result;
        } catch (error) {
          this.stagedRows = [];
          throw error;
        }
      }
    };
  }

  return {
    models: { ArLedger, AuditLog, SalesOrder: {} },
    rows,
    audits,
    createSession
  };
}

function ledger(overrides = {}) {
  return {
    id: 'AR-ADJ-ORDER-1',
    code: 'AR-ADJ-ORDER-1',
    idempotencyKey: 'AR-DEBT-ADJUSTMENT:ORDER-1:ALLOC-1:5000:v1',
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    entryType: 'normal',
    type: 'ar_debt_reconcile',
    sourceType: 'ORDER_PAYMENT_DEBT_RECONCILE',
    sourceId: 'ALLOC-1',
    sourceCode: 'ORDER-1',
    sourceModel: 'orderPaymentAllocations',
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: 'ALLOC-1',
    refCode: 'ALLOC-1',
    orderId: 'ORDER-1',
    orderCode: 'ORDER-1',
    salesOrderId: 'ORDER-1',
    salesOrderCode: 'ORDER-1',
    customerCode: 'C001',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    active: true,
    reversed: false,
    debit: 5000,
    credit: 0,
    amount: 5000,
    direction: 'debit',
    amountField: 'debit',
    ...overrides
  };
}

test.afterEach(() => arPostingService.setModelsForTest(null));

test('concurrent same-key post creates exactly one ledger and maps loser to existing result', async () => {
  const state = createModels({ concurrentBarrier: true });
  arPostingService.setModelsForTest(state.models);
  const incoming = ledger();
  const [left, right] = await Promise.all([
    arPostingService.postArLedgerEntry(incoming),
    arPostingService.postArLedgerEntry(clone(incoming))
  ]);
  assert.equal(state.rows.length, 1);
  assert.equal(left._id, right._id);
  assert.equal(state.audits.length, 0);
});

test('concurrent same-key different-payload race creates one ledger and fails the conflicting worker', async () => {
  const state = createModels({ concurrentBarrier: true });
  arPostingService.setModelsForTest(state.models);
  const settled = await Promise.allSettled([
    arPostingService.postArLedgerEntry(ledger()),
    arPostingService.postArLedgerEntry(ledger({ debit: 7000, amount: 7000 }))
  ]);
  assert.equal(state.rows.length, 1);
  assert.equal(settled.filter((item) => item.status === 'fulfilled').length, 1);
  const rejected = settled.find((item) => item.status === 'rejected');
  assert.equal(rejected.reason.code, 'AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT');
  assert.equal(state.audits.length, 1);
});

test('same key and same financial payload returns idempotent existing result', async () => {
  const state = createModels();
  arPostingService.setModelsForTest(state.models);
  const first = await arPostingService.postArLedgerEntry(ledger({ note: 'first note' }));
  const second = await arPostingService.postArLedgerEntry(ledger({ note: 'changed non-financial note', updatedAt: 'later' }));
  assert.equal(state.rows.length, 1);
  assert.equal(first._id, second._id);
});

test('same key with different financial payload fails hard and writes P0 audit', async () => {
  const state = createModels();
  arPostingService.setModelsForTest(state.models);
  await arPostingService.postArLedgerEntry(ledger());
  await assert.rejects(
    () => arPostingService.postArLedgerEntry(ledger({ debit: 6000, amount: 6000 })),
    (error) => error.code === 'AR_LEDGER_IDEMPOTENCY_PAYLOAD_CONFLICT'
      && error.details.existingHash !== error.details.incomingHash
  );
  assert.equal(state.rows.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, 'ar_ledger_idempotency_payload_conflict');
  assert.equal(state.audits[0].severity, 'P0');
});

test('retry after unknown commit result does not create a duplicate ledger', async () => {
  const state = createModels({ unknownCommitOnce: true });
  arPostingService.setModelsForTest(state.models);
  await assert.rejects(() => arPostingService.postArLedgerEntry(ledger()), /unknown transaction commit result/);
  const retryResult = await arPostingService.postArLedgerEntry(ledger());
  assert.equal(state.rows.length, 1);
  assert.equal(retryResult._id, 'ledger-1');
});

test('idempotency key normalization rejects empty/unstable keys', () => {
  assert.equal(normalizeIdempotencyKey('  AR-DEBT-PAYMENT:PAY-1  '), 'AR-DEBT-PAYMENT:PAY-1');
  assert.throws(() => normalizeIdempotencyKey('   '), { code: 'AR_LEDGER_IDEMPOTENCY_REQUIRED' });
  assert.throws(() => normalizeIdempotencyKey('AR KEY'), { code: 'AR_LEDGER_IDEMPOTENCY_UNSTABLE' });
});

test('zero money values are preserved and do not fallback to another field', () => {
  const payload = buildFinancialPayload(ledger({ debit: 0, credit: 5000, amount: 5000, direction: 'credit', amountField: 'credit' }));
  assert.equal(payload.debit, 0);
  assert.equal(payload.credit, 5000);
  assert.equal(payload.amount, 5000);
});

test('negative money is rejected before repository write', async () => {
  const state = createModels();
  arPostingService.setModelsForTest(state.models);
  assert.throws(() => assertNonNegativeLedgerAmounts({ debit: -1, credit: 0, amount: 1 }), { code: 'AR_LEDGER_NEGATIVE_MONEY' });
  await assert.rejects(() => arPostingService.postArLedgerEntry(ledger({ debit: -1, amount: -1 })), { code: 'AR_LEDGER_NEGATIVE_MONEY' });
  assert.equal(state.rows.length, 0);
});

test('Debt Zero Tolerance keeps ±1000 at zero and posts only outside tolerance', () => {
  assert.equal(applyDebtZeroTolerance(1000, 1000), 0);
  assert.equal(applyDebtZeroTolerance(-1000, 1000), 0);
  assert.equal(applyDebtZeroTolerance(1001, 1000), 1001);
  assert.equal(applyDebtZeroTolerance(-1001, 1000), -1001);
});

test('transaction rollback discards a staged ledger and leaves no half-created row', async () => {
  const state = createModels();
  const session = state.createSession();
  arPostingService.setModelsForTest(state.models);
  await assert.rejects(
    () => session.withTransaction(async () => {
      await arPostingService.postArLedgerEntry(ledger(), { session });
      assert.equal(session.stagedRows.length, 1);
      throw new Error('simulated business failure after ledger write');
    }),
    /simulated business failure/
  );
  assert.equal(session.stagedRows.length, 0);
  assert.equal(state.rows.length, 0);
});

test('duplicate audit reports duplicate, normalized variants and payload conflicts without mutation', () => {
  const rows = [
    ledger({ _id: '1' }),
    ledger({ _id: '2' }),
    ledger({ _id: '3', idempotencyKey: '  AR-DEBT-ADJUSTMENT:ORDER-1:ALLOC-1:5000:v1  ', debit: 6000, amount: 6000 })
  ];
  const before = JSON.stringify(rows);
  const audit = summarizeRows(rows);
  assert.equal(audit.clean, false);
  assert.equal(audit.totals.duplicateGroups, 1);
  assert.equal(audit.totals.conflictingPayloadGroups, 1);
  assert.equal(audit.totals.normalizedVariantGroups, 1);
  assert.equal(JSON.stringify(rows), before);
});

test('managed registry exposes unique desired state as pending and never auto-applies it', () => {
  assert.equal(AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX.options.name, 'uniq_arledger_idempotency_key_v1');
  assert.equal(AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX.options.unique, true);
  assert.equal(AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX.autoApply, false);
  assert.equal(AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX.deploymentState, 'PENDING_PRODUCTION_APPLY');
  const source = fs.readFileSync(path.resolve(__dirname, '../../../src/services/mongoIndexService.js'), 'utf8');
  assert.match(source, /const PENDING_INDEX_DEFINITIONS/);
  assert.match(source, /autoApply: false/);
  assert.match(source, /getManagedIndexDesiredState/);
});
