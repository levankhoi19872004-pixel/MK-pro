'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateCorrectionDebtDelta,
  assertCorrectionDebtDeltaPolicy
} = require('../src/domain/accounting/correctionDebtDelta');
const ArDebtAdjustmentPostingService = require('../src/services/accounting/ArDebtAdjustmentPostingService');
const paymentRepository = require('../src/repositories/paymentRepository');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function order() {
  return {
    id: 'SO-B0039602',
    code: 'B0039602',
    customerCode: '4501189',
    customerName: 'Chi Thuy Tuong'
  };
}

function side(deltaDebt) {
  return ArDebtAdjustmentPostingService.buildAdjustmentLedger(order(), {
    correctionId: 'DCOC-B0039602-R1',
    correctionCode: 'DCOC-B0039602-R1',
    version: 2,
    deltaDebt,
    debtAdjustmentAmount: deltaDebt
  }, { now: '2026-07-17T00:00:00.000Z' });
}

test('Phase260C-R1 event delta formula maps every component to debt delta', () => {
  assert.equal(calculateCorrectionDebtDelta({ returnDelta: 92211 }), -92211);
  assert.equal(calculateCorrectionDebtDelta({ returnDelta: -92211 }), 92211);
  assert.equal(calculateCorrectionDebtDelta({ cashDelta: 10000 }), -10000);
  assert.equal(calculateCorrectionDebtDelta({ cashDelta: -10000 }), 10000);
  assert.equal(calculateCorrectionDebtDelta({ bankDelta: 20000 }), -20000);
  assert.equal(calculateCorrectionDebtDelta({ bankDelta: -20000 }), 20000);
  assert.equal(calculateCorrectionDebtDelta({ rewardDelta: 30000 }), -30000);
  assert.equal(calculateCorrectionDebtDelta({ rewardDelta: -30000 }), 30000);
  assert.equal(calculateCorrectionDebtDelta({ receivableDelta: 40000 }), 40000);
  assert.equal(calculateCorrectionDebtDelta({ receivableDelta: -40000 }), -40000);
  assert.equal(calculateCorrectionDebtDelta({ returnDelta: 92211, cashDelta: 5000 }), -97211);
  assert.equal(calculateCorrectionDebtDelta({}), 0);
});

test('Phase260C-R1 adjustment side follows event delta only', () => {
  assert.deepEqual({ debit: side(92211).debit, credit: side(92211).credit }, { debit: 92211, credit: 0 });
  assert.deepEqual({ debit: side(-92211).debit, credit: side(-92211).credit }, { debit: 0, credit: 92211 });
  assert.equal(side(0), null);
});

test('Phase260C-R1 return increase cannot create debit and B0039602 posts credit 92211', () => {
  assert.throws(
    () => assertCorrectionDebtDeltaPolicy({ returnDelta: 92211 }, { debtDelta: 1 }),
    /POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT|Post-closeout return/
  );
  const debtDelta = assertCorrectionDebtDeltaPolicy(
    { receivableDelta: 0, cashDelta: 0, bankDelta: 0, rewardDelta: 0, returnDelta: 92211 },
    { debtDelta: calculateCorrectionDebtDelta({ returnDelta: 92211 }) }
  );
  const ledger = side(debtDelta);
  assert.equal(debtDelta, -92211);
  assert.equal(ledger.debit, 0);
  assert.equal(ledger.credit, 92211);
  assert.notEqual(ledger.debit, 7696479);
});

test('Phase260C-R1 ledger metadata documents event-delta-only policy', () => {
  const ledger = ArDebtAdjustmentPostingService.buildAdjustmentLedger(order(), {
    correctionId: 'DCOC-B0039602-R1',
    correctionCode: 'DCOC-B0039602-R1',
    version: 2,
    deltaDebt: -92211,
    returnDelta: 92211,
    receivableDelta: 0,
    cashDelta: 0,
    bankDelta: 0,
    rewardDelta: 0
  }, { now: '2026-07-17T00:00:00.000Z' });
  assert.equal(ledger.metadata.adjustmentPolicy, 'EVENT_DELTA_ONLY');
  assert.equal(ledger.metadata.returnDelta, 92211);
  assert.equal(ledger.metadata.debtDelta, -92211);
  assert.equal(ledger.metadata.excludesConfirmedDebtReceipts, true);
  assert.equal(ledger.metadata.excludesCurrentDebtBalanceRecalculation, true);
});

test('Phase260C-R1/260E replay and concurrent adjustment post is retired without financial effect', async () => {
  const originalFindAll = paymentRepository.findAll;
  const originalUpsert = paymentRepository.upsert;
  const originalRebuild = arDebtReadModel.rebuildDebtForSource;
  const rows = [];
  let upserts = 0;
  paymentRepository.findAll = async (filter) => rows.filter((row) => row.idempotencyKey === filter.idempotencyKey);
  paymentRepository.upsert = async (entry) => {
    upserts += 1;
    const existing = rows.find((row) => row.idempotencyKey === entry.idempotencyKey);
    if (existing) return existing;
    rows.push(entry);
    return entry;
  };
  arDebtReadModel.rebuildDebtForSource = async () => null;
  try {
    const context = {
      correctionId: 'DCOC-B0039602-R1',
      correctionCode: 'DCOC-B0039602-R1',
      version: 2,
      deltaDebt: -92211,
      debtAdjustmentAmount: -92211,
      returnDelta: 92211
    };
    const first = await ArDebtAdjustmentPostingService.postAdjustment(order(), context, { skipReadModelRebuild: true });
    const replay = await ArDebtAdjustmentPostingService.postAdjustment(order(), context, { skipReadModelRebuild: true });
    const [a, b] = await Promise.all([
      ArDebtAdjustmentPostingService.postAdjustment(order(), context, { skipReadModelRebuild: true }),
      ArDebtAdjustmentPostingService.postAdjustment(order(), context, { skipReadModelRebuild: true })
    ]);
    assert.equal(first.posted, false);
    assert.equal(first.skipped, true);
    assert.equal(first.reason, 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED');
    assert.equal(replay.reason, 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED');
    assert.equal(a.reason, 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED');
    assert.equal(b.reason, 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED');
    assert.equal(upserts, 0);
    assert.equal(rows.length, 0);
  } finally {
    paymentRepository.findAll = originalFindAll;
    paymentRepository.upsert = originalUpsert;
    arDebtReadModel.rebuildDebtForSource = originalRebuild;
  }
});

test('Phase260C-R1/260E same idempotency key does not write because adjustment posting is retired', async () => {
  const originalFindAll = paymentRepository.findAll;
  paymentRepository.findAll = async () => [{
    id: 'AR-DEBT-ADJUSTMENT-OLD',
    code: 'AR-DEBT-ADJUSTMENT-OLD',
    idempotencyKey: 'AR-DEBT-ADJUSTMENT:DCOC-B0039602-R1:SO-B0039602:2:-92211:fixed',
    debit: 0,
    credit: 92211,
    amount: 92211
  }];
  try {
    const result = await ArDebtAdjustmentPostingService.postAdjustment(order(), {
        idempotencyKey: 'AR-DEBT-ADJUSTMENT:DCOC-B0039602-R1:SO-B0039602:2:-92211:fixed',
        correctionId: 'DCOC-B0039602-R1',
        correctionCode: 'DCOC-B0039602-R1',
        version: 2,
        deltaDebt: 100,
        debtAdjustmentAmount: 100
      }, { skipReadModelRebuild: true });
    assert.equal(result.reason, 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED');
  } finally {
    paymentRepository.findAll = originalFindAll;
  }
});
