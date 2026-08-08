'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadAllocationService() {
  const target = require.resolve('../../../src/services/accounting/OrderPaymentAllocationService');
  delete require.cache[target];
  const calls = { findOneAndUpdate: 0, bulkWrite: 0, bulkOps: 0, arPost: 0 };
  const model = {
    findOneAndUpdate(filter, update) {
      calls.findOneAndUpdate += 1;
      const doc = { id: `ALLOC-${calls.findOneAndUpdate}`, allocationCode: 'OPA-SO1-v1', orderId: 'SO1', orderCode: 'B1', customerCode: 'C1', idempotencyKey: filter.idempotencyKey, ...update.$set, ...update.$setOnInsert };
      return { lean: async () => doc, then: (r, j) => Promise.resolve(doc).then(r, j) };
    },
    async bulkWrite(ops) {
      calls.bulkWrite += 1;
      calls.bulkOps += ops.length;
      return { acknowledged: true, matchedCount: ops.length, modifiedCount: ops.length };
    }
  };
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../models/OrderPaymentAllocation') return model;
    if (request === '../../repositories/paymentRepository') return { findAll: async () => [] };
    if (request === '../arPosting.service') return { postArLedgerEntry: async (row) => { calls.arPost += 1; return { ...row }; } };
    if (request === '../fundService') return {};
    if (request === '../../observability/closeoutQueryAudit') return { withCloseoutAuditStage: (_n, fn) => fn(), updateCardinality: () => {} };
    return original.call(this, request, parent, isMain);
  };
  try { return { service: require(target), calls }; } finally { Module._load = original; }
}

function allocation(i = 1) {
  return {
    allocationCode: `OPA-SO${i}-v1`, orderId: `SO${i}`, orderCode: `B${i}`, customerCode: `C${i}`,
    sourceId: `SO${i}`, sourceCode: `B${i}`, sourceVersion: 1, sourceType: 'delivery_closeout',
    deliveryDate: '2026-08-08', receivableAmount: 200, cashAmount: 100, bankAmount: 0,
    rewardAmount: 100, returnAmount: 0, rawDebtAmount: 0, normalizedDebtAmount: 0, debtAmount: 0,
    zeroTolerance: 1000, zeroToleranceApplied: false, zeroToleranceAdjustmentAmount: 0,
    status: 'posted', idempotencyKey: `OPA:SO${i}:delivery_closeout:scope:v1`, createdBy: 'test', updatedBy: 'test'
  };
}

test('G2R1 allocation service builds immutable final update plan and flushes one bulk command', async () => {
  const { service, calls } = loadAllocationService();
  assert.equal(typeof service.buildFinalAllocationUpdatePlan, 'function');
  assert.equal(typeof service.flushFinalAllocationUpdatePlans, 'function');
  const plans = [];
  const result = await service.postAllocation(allocation(1), {
    session: { id: 'tx' },
    deferFinalAllocationUpdate: true,
    collectFinalAllocationUpdatePlan: (plan) => plans.push(plan)
  });
  assert.equal(calls.findOneAndUpdate, 1, 'initial allocation upsert remains per order');
  assert.equal(calls.bulkWrite, 0, 'flush is request/transaction scoped, not per order');
  assert.equal(calls.arPost, 3, 'AR writer remains per-entry');
  assert.equal(plans.length, 1);
  assert.ok(Object.isFrozen(plans[0]));
  assert.deepEqual(result.allocation.postedArLedgerIds.length, 3);
  await service.flushFinalAllocationUpdatePlans(plans, { session: { id: 'tx' } });
  assert.equal(calls.bulkWrite, 1);
  assert.equal(calls.bulkOps, 1);
  assert.equal(calls.findOneAndUpdate, 1);
});

test('G2R1 N final allocation updates become one bounded bulkWrite command', async () => {
  const { service, calls } = loadAllocationService();
  const plans = [];
  for (let i = 1; i <= 5; i += 1) {
    await service.postAllocation(allocation(i), {
      session: { id: 'tx' }, deferFinalAllocationUpdate: true,
      collectFinalAllocationUpdatePlan: (plan) => plans.push(plan)
    });
  }
  assert.equal(calls.findOneAndUpdate, 5);
  assert.equal(plans.length, 5);
  await service.flushFinalAllocationUpdatePlans(plans, { session: { id: 'tx' } });
  assert.equal(calls.bulkWrite, 1);
  assert.equal(calls.bulkOps, 5);
});

test('G2R1 invalid final allocation identity fails before bulkWrite', async () => {
  const { service, calls } = loadAllocationService();
  assert.throws(() => service.buildFinalAllocationUpdatePlan({ ...allocation(1), idempotencyKey: '' }, [], [], {}), /idempotency/i);
  assert.equal(calls.bulkWrite, 0);
});
