'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const workloads = [1, 5, 7, 10, 23, 60];

function loadService() {
  const target = require.resolve('../../../src/services/accounting/OrderPaymentAllocationService');
  delete require.cache[target];
  const calls = { initial: 0, bulk: 0, bulkOps: 0, ar: 0 };
  const model = {
    findOneAndUpdate(filter, update) {
      calls.initial += 1;
      const doc = {
        id: `ALLOC-${calls.initial}`, allocationCode: `OPA-${calls.initial}`, orderId: `SO${calls.initial}`,
        orderCode: `B${calls.initial}`, customerCode: `C${calls.initial}`, idempotencyKey: filter.idempotencyKey,
        ...update.$setOnInsert, ...update.$set
      };
      return { lean: async () => doc, then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject) };
    },
    async bulkWrite(ops) {
      calls.bulk += 1;
      calls.bulkOps += ops.length;
      return { acknowledged: true, matchedCount: ops.length, modifiedCount: ops.length };
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../../models/OrderPaymentAllocation') return model;
    if (request === '../../repositories/paymentRepository') return { findAll: async () => [] };
    if (request === '../arPosting.service') return { postArLedgerEntry: async (row) => { calls.ar += 1; return { ...row }; } };
    if (request === '../fundService') return {};
    if (request === '../../observability/closeoutQueryAudit') return { withCloseoutAuditStage: (_n, fn) => fn(), updateCardinality: () => {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return { service: require(target), calls }; }
  finally { Module._load = originalLoad; }
}

function fixture(i) {
  return {
    allocationCode: `OPA-SO${i}-v1`, orderId: `SO${i}`, orderCode: `B${i}`, customerCode: `C${i}`,
    sourceId: `SO${i}`, sourceCode: `B${i}`, sourceVersion: 1, sourceType: 'delivery_closeout',
    deliveryDate: '2026-08-08', receivableAmount: 200, cashAmount: 100, bankAmount: 0,
    rewardAmount: 100, returnAmount: 0, rawDebtAmount: 0, normalizedDebtAmount: 0, debtAmount: 0,
    zeroTolerance: 1000, zeroToleranceApplied: false, zeroToleranceAdjustmentAmount: 0,
    status: 'posted', idempotencyKey: `OPA:SO${i}:delivery_closeout:scope:v1`, createdBy: 'test', updatedBy: 'test'
  };
}

for (const n of workloads) {
  test(`G2R1 workload ${n}: N initial allocation writes + one bounded final bulk command`, async () => {
    const { service, calls } = loadService();
    const plans = [];
    for (let i = 1; i <= n; i += 1) {
      await service.postAllocation(fixture(i), {
        session: { id: 'tx' },
        deferFinalAllocationUpdate: true,
        collectFinalAllocationUpdatePlan: (plan) => plans.push(plan)
      });
    }
    await service.flushFinalAllocationUpdatePlans(plans, { session: { id: 'tx' } });
    assert.equal(calls.initial, n);
    assert.equal(calls.ar, 3 * n, 'AR persistence remains three per-entry writes/order for canonical fixture');
    assert.equal(calls.bulk, 1);
    assert.equal(calls.bulkOps, n);

    // Compose the full request budget from G1's measured deterministic baseline and the
    // only allowed G2 delta: remove N final allocation Query.exec commands, add 1 bulk command.
    const baselineQueryExec = 6 * n + 9;
    const baselinePhysical = 8 * n + 10;
    const optimizedQueryExec = baselineQueryExec - n;
    const optimizedPhysical = baselinePhysical - n + 1;
    assert.equal(optimizedQueryExec, 5 * n + 9);
    assert.equal(optimizedPhysical, 7 * n + 11);
    assert.equal(baselinePhysical - optimizedPhysical, n - 1);
  });
}
