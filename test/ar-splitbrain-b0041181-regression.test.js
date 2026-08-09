'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function resolved(relativePath) { return require.resolve(path.join(ROOT, relativePath)); }
function installStub(relativePath, exportsValue) {
  const filename = resolved(relativePath);
  const previous = require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsValue };
  return () => { if (previous) require.cache[filename] = previous; else delete require.cache[filename]; };
}
function queryResult(value) {
  return {
    select() { return this; }, sort() { return this; }, limit() { return this; }, lean() { return this; }, session() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function createHarness({ eventMode = 'success' } = {}) {
  const counters = { correctionWrite: 0, versionWrite: 0, allocationWrite: 0, eventDeltaPost: 0, arRead: 0 };
  const corrections = new Map();
  const versions = [];
  const allocations = [];
  const arState = { debt: 23800085 };
  const order = {
    id: 'SO-B0041181', code: 'B0041181', orderCode: 'B0041181',
    customerCode: '4499499', customerName: 'Đinh Mười',
    salesStaffCode: 'NVBH-TEST', deliveryStaffCode: 'NVGH-TEST',
    status: 'accounting_confirmed', accountingStatus: 'confirmed', accountingConfirmed: true,
    totalAmount: 23800085,
    deliveryCloseout: {
      id: 'DCO-B0041181-v1', code: 'DCO-B0041181-v1', closeoutVersion: 1, status: 'confirmed',
      originalAmount: 23800085, receivableAmount: 23800085,
      cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 0,
      rawDebtAmount: 23800085, finalDebtAmount: 23800085, debtAmount: 23800085
    },
    items: []
  };

  const DeliveryCloseoutCorrection = {
    findOne(filter) { return queryResult(corrections.get(filter.idempotencyKey) || null); },
    async findOneAndUpdate(filter, update) {
      counters.correctionWrite += 1;
      if (!corrections.has(filter.idempotencyKey)) corrections.set(filter.idempotencyKey, { ...update.$setOnInsert });
      return corrections.get(filter.idempotencyKey);
    },
    async updateOne() { return { matchedCount: 1, modifiedCount: 1 }; }
  };
  const DeliveryCloseoutVersion = {
    find() { return queryResult([]); },
    findOne(filter = {}) { return queryResult(versions.find((row) => row.correctionId === filter.correctionId) || null); },
    async findOneAndUpdate(_filter, update) {
      counters.versionWrite += 1;
      const row = { ...update.$setOnInsert };
      versions.push(row);
      return row;
    }
  };
  const allocationService = {
    buildAllocationFromCloseout(currentOrder, version, options = {}) {
      return {
        allocationCode: options.allocationCode,
        idempotencyKey: options.idempotencyKey,
        orderId: currentOrder.id,
        orderCode: currentOrder.code,
        customerCode: currentOrder.customerCode,
        customerName: currentOrder.customerName,
        salesStaffCode: currentOrder.salesStaffCode,
        deliveryStaffCode: currentOrder.deliveryStaffCode,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        sourceCode: options.sourceCode,
        sourceVersion: options.sourceVersion,
        receivableAmount: version.receivableAmount ?? version.originalAmount,
        cashAmount: version.cashAmount,
        bankAmount: version.bankAmount,
        rewardAmount: version.rewardAmount,
        returnAmount: version.returnAmount,
        rawDebtAmount: version.rawDebtAmount,
        normalizedDebtAmount: version.finalDebtAmount,
        debtAmount: version.finalDebtAmount,
        zeroTolerance: 1000,
        status: 'posted'
      };
    },
    computeDebtBreakdown(allocation, { zeroTolerance = 1000 } = {}) {
      const rawDebtAmount = Math.round(Number(allocation.receivableAmount || 0) - Number(allocation.cashAmount || 0) - Number(allocation.bankAmount || 0) - Number(allocation.rewardAmount || 0) - Number(allocation.returnAmount || 0));
      const normalizedDebtAmount = Math.abs(rawDebtAmount) <= zeroTolerance ? 0 : Math.max(0, rawDebtAmount);
      return { rawDebtAmount, normalizedDebtAmount, debtAmount: normalizedDebtAmount, zeroTolerance, zeroToleranceApplied: rawDebtAmount !== normalizedDebtAmount };
    },
    async upsertAllocation(allocation) {
      counters.allocationWrite += 1;
      allocations.push({ ...allocation });
      return { ...allocation };
    }
  };
  const eventDeltaWriter = {
    async postCorrectionEventDelta({ correction }, { session } = {}) {
      counters.eventDeltaPost += 1;
      assert.equal(session && session.id, 'TEST-SESSION');
      if (eventMode === 'throw') {
        const error = new Error('Injected canonical EVENT_DELTA failure');
        error.code = 'TEST_EVENT_DELTA_FAILURE';
        throw error;
      }
      const delta = Math.round(-Number(correction.cashDeltaAmount || 0) - Number(correction.bankDeltaAmount || 0) - Number(correction.rewardDeltaAmount || 0));
      const before = arState.debt;
      const expectedArAfter = before + delta;
      if (eventMode === 'mismatch') {
        const error = new Error('Injected EVENT_DELTA read-after-write mismatch');
        error.code = 'CORRECTION_EVENT_DELTA_AR_INVARIANT_FAILED';
        error.data = { arBefore: before, expectedArAfter, actualArAfter: before, correctionOwnedDebtDelta: delta };
        throw error;
      }
      arState.debt = expectedArAfter;
      const amount = Math.abs(delta);
      const ledger = amount ? {
        id: 'AR-ADJ-DCOC-B0041181', code: 'AR-ADJ-DCOC-B0041181', category: 'AR-ADJUSTMENT', ledgerType: 'AR-ADJUSTMENT',
        debit: delta > 0 ? amount : 0, credit: delta < 0 ? amount : 0, amount,
        direction: delta > 0 ? 'debit' : 'credit', amountField: delta > 0 ? 'debit' : 'credit',
        idempotencyKey: 'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-B0041181:DCOC-B0041181:v2'
      } : null;
      return { posted: Boolean(ledger), correctionOwnedDebtDelta: delta, arBefore: before, expectedArAfter, arAfter: arState.debt, ledger, returnDeltaExcluded: true };
    }
  };


  const transactionUtil = {
    async withOptionalMongoTransaction(_options, work) {
      const snapshot = {
        corrections: Array.from(corrections.entries()).map(([key, value]) => [key, { ...value }]),
        versions: versions.map((row) => ({ ...row })),
        allocations: allocations.map((row) => ({ ...row })),
        arDebt: arState.debt
      };
      try {
        return await work({ id: 'TEST-SESSION' });
      } catch (error) {
        corrections.clear();
        snapshot.corrections.forEach(([key, value]) => corrections.set(key, value));
        versions.splice(0, versions.length, ...snapshot.versions);
        allocations.splice(0, allocations.length, ...snapshot.allocations);
        arState.debt = snapshot.arDebt;
        throw error;
      }
    }
  };

  const restores = [
    installStub('src/utils/transaction.util.js', transactionUtil),
    installStub('src/models/SalesOrder.js', {}),
    installStub('src/models/ReturnOrder.js', { find() { return queryResult([]); } }),
    installStub('src/models/DeliveryCloseoutCorrection.js', DeliveryCloseoutCorrection),
    installStub('src/models/DeliveryCloseoutVersion.js', DeliveryCloseoutVersion),
    installStub('src/repositories/returnOrderRepository.js', { async upsert(payload) { return payload; } }),
    installStub('src/services/accounting/OrderPaymentAllocationService.js', allocationService),
    installStub('src/services/accounting/CloseoutCorrectionArEventDeltaPostingService.js', eventDeltaWriter),
    installStub('src/services/events/domainEventBus.js', { async emitDomainEventSafe() {} }),
    installStub('src/services/events/domainEventTypes.js', { EVENT_TYPES: { DELIVERY_CLOSEOUT_ADJUSTED: 'DELIVERY_CLOSEOUT_ADJUSTED' } }),
    installStub('src/domain/returns/ReturnMutationGuard.js', { async loadReturnMutationContext() { return {}; }, assertReturnMutationAllowed() { return true; } })
  ];

  const servicePath = resolved('src/services/deliveryCloseoutCorrection.service.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);

  return {
    service, order, counters, corrections, versions, allocations, arState,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      restores.reverse().forEach((fn) => fn());
    }
  };
}

test('post-closeout correction posts canonical EVENT_DELTA — B0041181 regression', async (t) => {
  const h = createHarness();
  t.after(h.restore);

  const result = await h.service.createCorrection({
    orderId: 'SO-B0041181',
    orderCode: 'B0041181',
    changeType: 'POST_CLOSEOUT_CORRECTION',
    paymentCorrection: {
      correctedCashAmount: 22140000,
      correctedBankAmount: 0,
      correctedRewardAmount: 1660000
    },
    reason: 'B0041181 canonical AR split-brain regression',
    idempotencyKey: 'AR-SB-A:B0041181:v2'
  }, {
    now: '2026-08-09T02:30:00.000Z',
    actor: 'test-accountant',
    batchContextItem: { complete: true, orderLoaded: true, order: h.order, latestVersionLoaded: true, latestVersion: null }
  });

  assert.equal(result.success, true);
  assert.equal(result.newCloseoutVersion.rawDebtAmount, 85);
  assert.equal(result.newCloseoutVersion.finalDebtAmount, 0);
  assert.equal(result.paymentAllocation.rawDebtAmount, 85);
  assert.equal(result.paymentAllocation.debtAmount, 0);
  assert.equal(h.allocations.length, 1);

  // R1 event-delta invariant: raw canonical AR becomes 85; Debt New normalizes ±1,000 to zero.
  assert.equal(h.arState.debt, 85);
  assert.equal(Math.abs(h.arState.debt) <= 1000 ? 0 : h.arState.debt, 0);
  assert.equal(result.arEventDeltaLedger.category, 'AR-ADJUSTMENT');
  assert.equal(h.counters.eventDeltaPost, 1);
});


test('retry cùng B0041181 business event không nhân đôi canonical AR effect', async (t) => {
  const h = createHarness();
  t.after(h.restore);
  const input = {
    orderId: 'SO-B0041181', orderCode: 'B0041181', changeType: 'POST_CLOSEOUT_CORRECTION',
    paymentCorrection: { correctedCashAmount: 22140000, correctedBankAmount: 0, correctedRewardAmount: 1660000 },
    reason: 'B0041181 canonical AR split-brain regression', idempotencyKey: 'AR-SB-A:B0041181:RETRY'
  };
  const options = { now: '2026-08-09T02:31:00.000Z', actor: 'test-accountant', batchContextItem: { complete: true, orderLoaded: true, order: h.order, latestVersionLoaded: true, latestVersion: null } };
  const first = await h.service.createCorrection(input, options);
  const second = await h.service.createCorrection(input, options);
  assert.equal(first.success, true);
  assert.equal(second.idempotent, true);
  assert.equal(h.arState.debt, 85);
  assert.equal(h.counters.eventDeltaPost, 1);
  assert.equal(h.corrections.size, 1);
  assert.equal(h.versions.length, 1);
  assert.equal(h.allocations.length, 1);
});

test('AR EVENT_DELTA posting throw làm rollback correction/version/allocation', async (t) => {
  const h = createHarness({ eventMode: 'throw' });
  t.after(h.restore);
  await assert.rejects(() => h.service.createCorrection({
    orderId: 'SO-B0041181', orderCode: 'B0041181', changeType: 'POST_CLOSEOUT_CORRECTION',
    paymentCorrection: { correctedCashAmount: 22140000, correctedBankAmount: 0, correctedRewardAmount: 1660000 },
    reason: 'rollback test', idempotencyKey: 'AR-SB-A:B0041181:ROLLBACK-THROW'
  }, { now: '2026-08-09T02:32:00.000Z', actor: 'test-accountant', batchContextItem: { complete: true, orderLoaded: true, order: h.order, latestVersionLoaded: true, latestVersion: null } }),
  (error) => error && error.code === 'TEST_EVENT_DELTA_FAILURE');
  assert.equal(h.corrections.size, 0);
  assert.equal(h.versions.length, 0);
  assert.equal(h.allocations.length, 0);
  assert.equal(h.arState.debt, 23800085);
});

test('AR EVENT_DELTA read-after-write mismatch chặn success và rollback transaction', async (t) => {
  const h = createHarness({ eventMode: 'mismatch' });
  t.after(h.restore);
  await assert.rejects(() => h.service.createCorrection({
    orderId: 'SO-B0041181', orderCode: 'B0041181', changeType: 'POST_CLOSEOUT_CORRECTION',
    paymentCorrection: { correctedCashAmount: 22140000, correctedBankAmount: 0, correctedRewardAmount: 1660000 },
    reason: 'invariant mismatch test', idempotencyKey: 'AR-SB-A:B0041181:ROLLBACK-MISMATCH'
  }, { now: '2026-08-09T02:33:00.000Z', actor: 'test-accountant', batchContextItem: { complete: true, orderLoaded: true, order: h.order, latestVersionLoaded: true, latestVersion: null } }),
  (error) => error && error.code === 'CORRECTION_EVENT_DELTA_AR_INVARIANT_FAILED' && error.data.actualArAfter === 23800085 && error.data.expectedArAfter === 85);
  assert.equal(h.corrections.size, 0);
  assert.equal(h.versions.length, 0);
  assert.equal(h.allocations.length, 0);
  assert.equal(h.arState.debt, 23800085);
});
