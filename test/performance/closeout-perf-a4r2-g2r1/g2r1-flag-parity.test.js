'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadService({ forceMatchedCount = null } = {}) {
  const target = require.resolve('../../../src/services/accounting/OrderPaymentAllocationService');
  delete require.cache[target];
  const state = new Map();
  const calls = { initial: 0, final: 0, bulk: 0, sessions: [] };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const model = {
    findOneAndUpdate(filter, update, options = {}) {
      const key = String(filter.idempotencyKey || '');
      calls.sessions.push(options.session);
      const existing = state.get(key) || {};
      let doc;
      if (update.$setOnInsert) {
        calls.initial += 1;
        doc = { ...existing, ...clone(update.$setOnInsert), ...clone(update.$set || {}) };
      } else {
        calls.final += 1;
        doc = { ...existing, ...clone(update.$set || {}) };
      }
      state.set(key, doc);
      return { lean: async () => clone(doc), then: (resolve, reject) => Promise.resolve(clone(doc)).then(resolve, reject) };
    },
    async bulkWrite(ops, options = {}) {
      calls.bulk += 1;
      calls.sessions.push(options.session);
      for (const op of ops) {
        const { filter, update } = op.updateOne;
        const key = String(filter.idempotencyKey || '');
        if (!state.has(key)) continue;
        state.set(key, { ...state.get(key), ...clone(update.$set || {}) });
      }
      const matchedCount = forceMatchedCount == null ? ops.filter((op) => state.has(String(op.updateOne.filter.idempotencyKey || ''))).length : forceMatchedCount;
      return { acknowledged: true, matchedCount, modifiedCount: matchedCount };
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../models/OrderPaymentAllocation') return model;
    if (request === '../../repositories/paymentRepository') return { findAll: async () => [] };
    if (request === '../arPosting.service') return {
      postArLedgerEntry: async (row) => ({ ...clone(row), id: `AR:${row.idempotencyKey}` })
    };
    if (request === '../fundService') return {};
    if (request === '../../observability/closeoutQueryAudit') return { withCloseoutAuditStage: (_n, fn) => fn(), updateCardinality: () => {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return { service: require(target), state, calls }; }
  finally { Module._load = originalLoad; }
}

function allocation() {
  return {
    allocationCode: 'OPA-SO1-v1', orderId: 'SO1', orderCode: 'B1', customerCode: 'C1',
    sourceId: 'SO1', sourceCode: 'B1', sourceVersion: 1, sourceType: 'delivery_closeout',
    deliveryDate: '2026-08-08', receivableAmount: 200, cashAmount: 100, bankAmount: 0,
    rewardAmount: 100, returnAmount: 0, rawDebtAmount: 0, normalizedDebtAmount: 0, debtAmount: 0,
    zeroTolerance: 1000, zeroToleranceApplied: false, zeroToleranceAdjustmentAmount: 0,
    status: 'posted', idempotencyKey: 'OPA:SO1:delivery_closeout:scope:v1', createdBy: 'accountant', updatedBy: 'accountant'
  };
}

function comparable(value) {
  const v = JSON.parse(JSON.stringify(value));
  return v;
}

test('G2R1 flag OFF and ON produce identical final allocation state and AR rows', async () => {
  const now = '2026-08-08T01:23:45.000Z';
  const sessionOff = { id: 'tx-off' };
  const off = loadService();
  const offResult = await off.service.postAllocation(allocation(), { session: sessionOff, now, actor: 'accountant' });
  const offState = comparable(off.state.get(allocation().idempotencyKey));
  assert.equal(off.calls.initial, 1);
  assert.equal(off.calls.final, 1);
  assert.equal(off.calls.bulk, 0);

  const sessionOn = { id: 'tx-on' };
  const on = loadService();
  const plans = [];
  const onResult = await on.service.postAllocation(allocation(), {
    session: sessionOn, now, actor: 'accountant', deferFinalAllocationUpdate: true,
    collectFinalAllocationUpdatePlan: (plan) => plans.push(plan)
  });
  assert.equal(on.calls.initial, 1);
  assert.equal(on.calls.final, 0);
  assert.equal(on.calls.bulk, 0);
  assert.deepEqual(comparable(onResult.allocation), offState, 'projected in-memory final state matches flag OFF persisted result before flush');
  await on.service.flushFinalAllocationUpdatePlans(plans, { session: sessionOn });
  const onState = comparable(on.state.get(allocation().idempotencyKey));
  assert.equal(on.calls.bulk, 1);
  assert.deepEqual(onState, offState);
  assert.deepEqual(comparable(onResult.arLedgers), comparable(offResult.arLedgers));
  assert.equal(onState.status, 'posted');
  assert.deepEqual(onState.postedArLedgerIds, offState.postedArLedgerIds);
});

test('G2R1 batch uses the supplied transaction session and matched-count guard aborts mismatch', async () => {
  const h = loadService({ forceMatchedCount: 0 });
  const session = { id: 'same-session' };
  const plans = [];
  await h.service.postAllocation(allocation(), { session, now: '2026-08-08T01:23:45.000Z', deferFinalAllocationUpdate: true, collectFinalAllocationUpdatePlan: (plan) => plans.push(plan) });
  await assert.rejects(() => h.service.flushFinalAllocationUpdatePlans(plans, { session }), (err) => err && err.code === 'ORDER_PAYMENT_ALLOCATION_BATCH_MATCH_MISMATCH');
  assert.equal(h.calls.sessions.at(-1), session);
});

test('G2R1 duplicate allocation identity is rejected before sending bulkWrite', async () => {
  const h = loadService();
  const plan = h.service.buildFinalAllocationUpdatePlan(allocation(), [{ id: 'AR1' }], [], { now: '2026-08-08T01:23:45.000Z' });
  await assert.rejects(() => h.service.flushFinalAllocationUpdatePlans([plan, plan], { session: { id: 'tx' } }), (err) => err && err.code === 'ORDER_PAYMENT_ALLOCATION_BATCH_IDENTITY_DUPLICATE');
  assert.equal(h.calls.bulk, 0);
});
