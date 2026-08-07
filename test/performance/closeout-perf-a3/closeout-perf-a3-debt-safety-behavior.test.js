'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function withPatchedLoad(stubs, loadFn) {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return loadFn(); } finally { Module._load = originalLoad; }
}

function loadDebtHarness(options = {}) {
  const target = require.resolve('../../../src/services/accounting/OrderPaymentDebtReconcileService');
  delete require.cache[target];
  const previousDedup = process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
  process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = '1';
  const counters = { balanceReads: 0, idempotencyReads: 0, posts: 0 };
  let currentBalance = Number(options.freshBalance || 0);
  const service = withPatchedLoad({
    '../arLedgerRead.service': {
      inspectActiveDebtReadModelLedgersByOrderKeys: async () => {
        counters.balanceReads += 1;
        return {
          lookupKeys: ['SO-A3'], rawMatchedLedgerCount: currentBalance ? 1 : 0,
          rawActiveConfirmedLedgerCount: currentBalance ? 1 : 0,
          canonicalMatchedLedgerCount: currentBalance ? 1 : 0, excludedLedgerCount: 0,
          canonicalLedgers: currentBalance ? [{ debit: currentBalance, credit: 0, active: true, accountingConfirmed: true, accountingStatus: 'confirmed' }] : [],
          rawActiveConfirmedLedgers: [], excludedLedgers: []
        };
      },
      getCanonicalLedgersByRawMatch: async () => {
        counters.idempotencyReads += 1;
        return [];
      },
      mergeActiveDebtInspectionWithRows: (inspection) => inspection
    },
    '../arPosting.service': {
      postArLedgerEntry: async (row) => {
        counters.posts += 1;
        currentBalance += Number(row.debit || 0) - Number(row.credit || 0);
        return { ...row };
      }
    },
    './OrderPaymentAllocationService': {
      computeDebtBreakdown(allocation = {}, opts = {}) {
        const tolerance = Number(opts.zeroTolerance ?? 1000);
        const raw = Math.round(Number(allocation.receivableAmount || 0)
          - Number(allocation.cashAmount || 0) - Number(allocation.bankAmount || 0)
          - Number(allocation.rewardAmount || 0) - Number(allocation.returnAmount || 0));
        const normalized = Math.abs(raw) <= tolerance ? 0 : Math.max(0, raw);
        return { rawDebtAmount: raw, normalizedDebtAmount: normalized, debtAmount: normalized,
          zeroTolerance: tolerance, zeroToleranceApplied: raw !== normalized,
          zeroToleranceAdjustmentAmount: raw - normalized };
      }
    },
    '../../observability/closeoutQueryAudit': {
      withCloseoutAuditStage: (_name, fn) => fn(), updateCardinality: () => {}
    }
  }, () => require(target));
  return {
    service, counters,
    restore() {
      delete require.cache[target];
      if (previousDedup === undefined) delete process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1;
      else process.env.PERF_CLOSEOUT_QUERY_DEDUP_V1 = previousDedup;
    }
  };
}

const order = { id: 'SO-A3', _id: 'SO-A3', orderCode: 'SO-A3', customerCode: 'C-A3', deliveryDate: '2026-08-07' };
function allocation(overrides = {}) {
  return { allocationCode: 'OPA-A3', idempotencyKey: 'OPA-A3-IDEM', orderId: 'SO-A3', orderCode: 'SO-A3',
    customerCode: 'C-A3', sourceVersion: 1, receivableAmount: 688113, cashAmount: 503000,
    bankAmount: 0, rewardAmount: 185000, returnAmount: 0, deliveryDate: '2026-08-07', ...overrides };
}
function prefetched(balance) {
  return { identity: { orderId: 'SO-A3', orderCode: 'SO-A3', lookupKeys: ['SO-A3'] }, lookupKeys: ['SO-A3'],
    rawMatchedLedgerCount: balance ? 1 : 0, rawActiveConfirmedLedgerCount: balance ? 1 : 0,
    canonicalMatchedLedgerCount: balance ? 1 : 0, excludedLedgerCount: 0,
    canonicalLedgers: balance ? [{ debit: balance, credit: 0 }] : [], rawActiveConfirmedLedgers: [], excludedLedgers: [], currentArBalance: balance };
}

test('CL-A3-REQ-007/008: valid prefetched no-debt context removes both per-order initial balance reads', async () => {
  const h = loadDebtHarness({ freshBalance: 0 });
  try {
    const result = await h.service.reconcileOneOrder({ order, allocation: allocation(), apply: true,
      prefetchedArBalanceResolved: true, prefetchedArBalanceDetails: prefetched(0) });
    assert.equal(result.skipReason, 'NO_DEBT_DELTA');
    assert.equal(h.counters.balanceReads, 0);
    assert.equal(h.counters.idempotencyReads, 0);
    assert.equal(h.counters.posts, 0);
  } finally { h.restore(); }
});

test('CL-A3-REQ-008/012: actual debt adjustment uses prefetched initial state but keeps fresh safety + after-write reads and pre-post idempotency', async () => {
  const h = loadDebtHarness({ freshBalance: 0 });
  try {
    const result = await h.service.reconcileOneOrder({ order,
      allocation: allocation({ receivableAmount: 5000, cashAmount: 0, rewardAmount: 0 }), apply: true,
      prefetchedArBalanceResolved: true, prefetchedArBalanceDetails: prefetched(0) });
    assert.equal(result.posted, true);
    assert.equal(h.counters.balanceReads, 2, 'safety + after-write only');
    assert.equal(h.counters.idempotencyReads, 1, 'fresh pre-post idempotency guard remains');
    assert.equal(h.counters.posts, 1);
    assert.equal(result.afterBalance, 5000);
  } finally { h.restore(); }
});

test('CL-A3-REQ-012: cash/bank/reward/return financial breakdown matrix stays at zero deviation', () => {
  const h = loadDebtHarness({ freshBalance: 0 });
  try {
    const cases = [
      ['cash-only', { receivableAmount: 5000, cashAmount: 5000, bankAmount: 0, rewardAmount: 0, returnAmount: 0 }, 0],
      ['bank-only', { receivableAmount: 5000, cashAmount: 0, bankAmount: 5000, rewardAmount: 0, returnAmount: 0 }, 0],
      ['cash-bank', { receivableAmount: 5000, cashAmount: 2000, bankAmount: 3000, rewardAmount: 0, returnAmount: 0 }, 0],
      ['reward-only', { receivableAmount: 185000, cashAmount: 0, bankAmount: 0, rewardAmount: 185000, returnAmount: 0 }, 0],
      ['cash-reward-tolerance', { receivableAmount: 688113, cashAmount: 503000, bankAmount: 0, rewardAmount: 185000, returnAmount: 0 }, 0],
      ['return-only', { receivableAmount: 5000, cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 5000 }, 0],
      ['payment-return', { receivableAmount: 5000, cashAmount: 2000, bankAmount: 0, rewardAmount: 0, returnAmount: 3000 }, 0],
      ['positive-debt', { receivableAmount: 5000, cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 0 }, 5000]
    ];
    for (const [name, values, expected] of cases) {
      const result = h.service.computeExpectedDebtFromAllocation(values, { zeroTolerance: 1000 });
      assert.equal(result.expectedDebtAmount, expected, name);
    }
  } finally { h.restore(); }
});

test('CL-A3-REQ-012: credit adjustment still posts signed credit and verifies after-write balance', async () => {
  const h = loadDebtHarness({ freshBalance: 5000 });
  try {
    const result = await h.service.reconcileOneOrder({ order,
      allocation: allocation({ receivableAmount: 0, cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 0 }), apply: true,
      prefetchedArBalanceResolved: true, prefetchedArBalanceDetails: prefetched(5000) });
    assert.equal(result.posted, true);
    assert.equal(result.action, 'create-credit');
    assert.equal(result.ledger.credit, 5000);
    assert.equal(result.afterBalance, 0);
    assert.equal(h.counters.balanceReads, 2);
    assert.equal(h.counters.idempotencyReads, 1);
    assert.equal(h.counters.posts, 1);
  } finally { h.restore(); }
});
