'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Planner = require('../src/services/accounting/HistoricalCorrectionRepairPlanner');
const Executor = require('../src/services/accounting/HistoricalCorrectionRepairExecutor');

function evidence() {
  const order = {
    id: 'SO1785834570204388', code: 'B0041181', orderId: 'SO1785834570204388', orderCode: 'B0041181',
    customerCode: '4499499', customerName: 'fixture', totalAmount: 23800085,
    deliveryCloseout: {
      id: 'DCOA-SO1785834570204388-b00deac1ae6d', code: 'DCOA-SO1785834570204388-b00deac1ae6d',
      closeoutVersion: 1, receivableAmount: 23800085, cashAmount: 0, bankAmount: 0, rewardAmount: 0,
      returnAmount: 0, debtAmount: 23800085
    }
  };
  const corrections = [
    {
      id:'DCOC-SO1785834570204388-2-32bce04cc9f9', code:'DCOC-SO1785834570204388-2-32bce04cc9f9', correctionCode:'DCOC-SO1785834570204388-2-32bce04cc9f9',
      orderId:order.id, orderCode:order.code, salesOrderId:order.id, salesOrderCode:order.code, customerCode:order.customerCode,
      originalCloseoutVersion:1, newCloseoutVersion:2,
      previousCashAmount:0, previousBankAmount:0, previousRewardAmount:0, previousReturnAmount:0, previousDebtAmount:23800085,
      newCashAmount:22200085, newBankAmount:0, newRewardAmount:1600000, newReturnAmount:0, newDebtAmount:0,
      createdAt:'2026-08-07T10:00:00.000Z'
    },
    {
      id:'DCOC-SO1785834570204388-3-347f125ae955', code:'DCOC-SO1785834570204388-3-347f125ae955', correctionCode:'DCOC-SO1785834570204388-3-347f125ae955',
      orderId:order.id, orderCode:order.code, salesOrderId:order.id, salesOrderCode:order.code, customerCode:order.customerCode,
      originalCloseoutVersion:1, newCloseoutVersion:3,
      previousCashAmount:22200085, previousBankAmount:0, previousRewardAmount:1600000, previousReturnAmount:0, previousDebtAmount:0,
      newCashAmount:22140000, newBankAmount:0, newRewardAmount:1660000, newReturnAmount:0, newDebtAmount:0,
      createdAt:'2026-08-08T10:00:00.000Z'
    },
    {
      id:'DCOC-SO1785834570204388-4-9680b15aab02', code:'DCOC-SO1785834570204388-4-9680b15aab02', correctionCode:'DCOC-SO1785834570204388-4-9680b15aab02',
      orderId:order.id, orderCode:order.code, salesOrderId:order.id, salesOrderCode:order.code, customerCode:order.customerCode,
      originalCloseoutVersion:1, newCloseoutVersion:4,
      previousCashAmount:22140000, previousBankAmount:0, previousRewardAmount:1660000, previousReturnAmount:0, previousDebtAmount:0,
      newCashAmount:22140000, newBankAmount:0, newRewardAmount:1660000, newReturnAmount:0, newDebtAmount:0,
      createdAt:'2026-08-09T10:00:00.000Z'
    }
  ];
  const versions = corrections.map((c) => ({
    id:`DCOV-${order.id}-v${c.newCloseoutVersion}`,
    code:`DCOV-${order.id}-v${c.newCloseoutVersion}`,
    correctionId:c.id, correctionCode:c.code, orderId:order.id, orderCode:order.code,
    salesOrderId:order.id, salesOrderCode:order.code, customerCode:order.customerCode,
    originalCloseoutVersion:1, closeoutVersion:c.newCloseoutVersion,
    saleAmount:23800085, cashAmount:c.newCashAmount, bankAmount:c.newBankAmount, rewardAmount:c.newRewardAmount,
    returnAmount:c.newReturnAmount, debtAmount:c.newDebtAmount,
    previousCashAmount:c.previousCashAmount, previousBankAmount:c.previousBankAmount, previousRewardAmount:c.previousRewardAmount,
    previousReturnAmount:c.previousReturnAmount, previousDebtAmount:c.previousDebtAmount,
    createdAt:c.createdAt
  }));
  return { order, corrections, versions, arLedgers:[], currentArBeforeObserved:23800085, subsequentEvents:[], generatedAt:'2026-08-12T00:00:00.000Z' };
}

test('RED R1P4A: v3 actual predecessor must be v2, not source original version v1', () => {
  const plan = Planner.createRepairPlan(evidence());
  const v3 = plan.items.find((item) => item.toVersion === 3);
  assert.ok(v3);
  assert.equal(v3.sourceOriginalVersion, 1);
  assert.equal(v3.fromVersion, 2);
  assert.equal(v3.predecessorVersionId, 'DCOV-SO1785834570204388-v2');
});

test('RED R1P4A: plan must model deterministic sequential AR 23800085 -> 0 -> 85', () => {
  const plan = Planner.createRepairPlan(evidence());
  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].sequenceIndex, 1);
  assert.equal(plan.items[0].expectedArBeforeSequentialApply, 23800085);
  assert.equal(plan.items[0].expectedArAfterSequentialApply, 0);
  assert.equal(plan.items[1].sequenceIndex, 2);
  assert.equal(plan.items[1].fromVersion, 2);
  assert.equal(plan.items[1].expectedArBeforeSequentialApply, 0);
  assert.equal(plan.items[1].expectedArAfterSequentialApply, 85);
  assert.equal(plan.expectedFinalArRaw, 85);
  assert.equal(plan.expectedFinalDebtNormalized, 0);
});

test('RED R1P4A: stale R1.4 plan may have valid hash but must fail lineage revalidation', async () => {
  assert.equal(typeof Executor.revalidateRepairPlan, 'function');
  const fresh = Planner.createRepairPlan(evidence());
  const stale = JSON.parse(JSON.stringify(fresh));
  const v3 = stale.items.find((item) => item.toVersion === 3);
  v3.fromVersion = 1;
  delete v3.planItemHash;
  v3.planItemHash = Planner.sha256({ ...v3, planItemHash: undefined });
  stale.transitions.find((row) => row.toVersion === 3).fromVersion = 1;
  delete stale.planHash;
  stale.planHash = Planner.sha256({ ...stale, planHash: undefined });
  assert.equal(Planner.verifyPlanHash(stale).ok, true);
  const result = await Executor.revalidateRepairPlan({ plan: stale, orderCode:'B0041181' }, {
    reloadEvidence: async () => evidence()
  });
  assert.equal(result.planHashValid, true);
  assert.equal(result.dbRevalidated, true);
  assert.equal(result.safeToApply, false);
  assert.ok(result.abortReasons.some((reason) => /lineage/i.test(String(reason.code || reason))));
});

test('RED R1P4A: multi-item apply is atomic when second event fails', async () => {
  assert.equal(typeof Executor.executePlan, 'function');
  const plan = Planner.createRepairPlan(evidence());
  let balance = 23800085;
  const writes = [];
  await assert.rejects(
    Executor.executePlan({ plan, planHash:plan.planHash, orderCode:'B0041181', apply:true, actor:'test' }, {
      reloadEvidence: async () => evidence(),
      withTransaction: async (work) => {
        const beforeBalance = balance;
        const beforeWrites = writes.slice();
        try { return await work({ id:'tx' }); }
        catch (error) { balance = beforeBalance; writes.splice(0, writes.length, ...beforeWrites); throw error; }
      },
      readCurrentAr: async () => balance,
      postCorrectionEvent: async ({ transition }) => {
        if (transition.toVersion === 3) throw Object.assign(new Error('second item failed'), { code:'TEST_SECOND_ITEM_FAIL' });
        const arBefore = balance;
        balance += transition.correctionOwnedDebtDelta;
        writes.push(transition.toVersion);
        return { posted:true, idempotent:false, arBefore, arAfter:balance, ledger:{ id:`L-${transition.toVersion}` } };
      }
    }),
    (error) => error && error.code === 'TEST_SECOND_ITEM_FAIL'
  );
  assert.equal(balance, 23800085);
  assert.deepEqual(writes, []);
});
