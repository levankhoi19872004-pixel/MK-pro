'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const DebtReconcile = require('../src/services/accounting/OrderPaymentDebtReconcileService');
const BatchRepair = require('../scripts/backfill-order-payment-allocations');

function b0038734Allocation() {
  return {
    allocationCode: 'OPA-B0038734-v2',
    idempotencyKey: 'OPA:B0038734:delivery_closeout_version:DCV-B0038734:v2',
    orderId: 'SO-B0038734',
    orderCode: 'B0038734',
    customerCode: '4499586',
    customerName: 'Tuấn Yên',
    salesStaffCode: '35095',
    deliveryStaffCode: 'ghth',
    deliveryDate: '2026-07-03',
    sourceVersion: 2,
    receivableAmount: 9668695,
    cashAmount: 561000,
    bankAmount: 5807000,
    rewardAmount: 3300000,
    returnAmount: 0,
    rawDebtAmount: 695,
    normalizedDebtAmount: 0,
    debtAmount: 0,
    zeroTolerance: 1000,
    zeroToleranceApplied: true,
    zeroToleranceAdjustmentAmount: 695,
    status: 'posted'
  };
}

function b0038757Allocation() {
  return {
    allocationCode: 'OPA-B0038757-v1',
    idempotencyKey: 'OPA:B0038757:delivery_closeout:SO-B0038757:v1',
    orderId: 'SO-B0038757',
    orderCode: 'B0038757',
    customerCode: '4501102',
    customerName: 'Tuấn Anh',
    salesStaffCode: '33955',
    deliveryStaffCode: 'ghth',
    deliveryDate: '2026-07-03',
    sourceVersion: 1,
    receivableAmount: 50552883,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 1855000,
    returnAmount: 0,
    debtAmount: 48697883,
    status: 'posted'
  };
}

test('debt reconcile computes expected debt with zero tolerance for B0038734', () => {
  const expected = DebtReconcile.computeExpectedDebtFromAllocation(b0038734Allocation(), { zeroTolerance: 1000 });
  assert.equal(expected.rawDebtAmount, 695);
  assert.equal(expected.expectedDebtAmount, 0);
  assert.equal(expected.zeroToleranceApplied, true);
});



test('new closeout flow creates only 695 AR-DEBT-ADJUSTMENT after detailed allocation ledgers are posted', () => {
  const allocation = b0038734Allocation();
  const expected = DebtReconcile.computeExpectedDebtFromAllocation(allocation, { zeroTolerance: 1000 });
  assert.equal(expected.rawDebtAmount, 695);
  assert.equal(expected.expectedDebtAmount, 0);
  assert.equal(expected.zeroToleranceAdjustmentAmount, 695);

  const currentArBalanceAfterAllocationRows = 695;
  const diff = currentArBalanceAfterAllocationRows - expected.expectedDebtAmount;
  const ledger = DebtReconcile.buildDebtAdjustmentLedger({
    allocation,
    currentArBalance: currentArBalanceAfterAllocationRows,
    expectedDebtAmount: expected.expectedDebtAmount,
    diff
  }, { zeroTolerance: 1000, actor: 'test', rawDebtAmount: expected.rawDebtAmount });

  assert.equal(ledger.category, 'AR-DEBT-ADJUSTMENT');
  assert.equal(ledger.credit, 695);
  assert.equal(ledger.debit, 0);
  assert.equal(ledger.metadata.rawDebtAmount, 695);
  assert.equal(ledger.metadata.zeroToleranceAdjustmentAmount, 695);
});
test('debt reconcile builds AR-DEBT-ADJUSTMENT credit when current AR is higher than expected', () => {
  const allocation = b0038734Allocation();
  const expected = DebtReconcile.computeExpectedDebtFromAllocation(allocation, { zeroTolerance: 1000 });
  const ledger = DebtReconcile.buildDebtAdjustmentLedger({
    allocation,
    currentArBalance: 3300695,
    expectedDebtAmount: expected.expectedDebtAmount,
    diff: 3300695
  }, { zeroTolerance: 1000, actor: 'test' });

  assert.equal(ledger.category, 'AR-DEBT-ADJUSTMENT');
  assert.equal(ledger.credit, 3300695);
  assert.equal(ledger.debit, 0);
  assert.equal(ledger.direction, 'credit');
  assert.match(ledger.idempotencyKey, /^AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:B0038734:/);
});

test('debt reconcile idempotency key is stable so apply reruns cannot create a second adjustment', () => {
  const allocation = b0038734Allocation();
  const key1 = DebtReconcile.debtAdjustmentIdempotencyKey(allocation, 0);
  const key2 = DebtReconcile.debtAdjustmentIdempotencyKey({ ...allocation }, 0);
  assert.equal(key1, key2);
});

test('debt reconcile keeps reward deduction for B0038757 and creates credit diff if AR ignored reward', () => {
  const allocation = b0038757Allocation();
  const expected = DebtReconcile.computeExpectedDebtFromAllocation(allocation, { zeroTolerance: 1000 });
  assert.equal(expected.expectedDebtAmount, 48697883);

  const currentArBalance = 50552883;
  const diff = currentArBalance - expected.expectedDebtAmount;
  assert.equal(diff, 1855000);

  const ledger = DebtReconcile.buildDebtAdjustmentLedger({ allocation, currentArBalance, expectedDebtAmount: expected.expectedDebtAmount, diff }, { actor: 'test' });
  assert.equal(ledger.credit, 1855000);
  assert.equal(ledger.debit, 0);
});

test('batch repair CLI supports debt audit/repair options', () => {
  const audit = BatchRepair.parseArgs(['--only-debt-diff', '--from', '2026-07-01', '--to', '2026-07-07', '--zero-tolerance', '1000']);
  assert.equal(audit.onlyDebtDiff, true);
  assert.equal(audit.apply, false);
  assert.equal(audit.zeroTolerance, 1000);

  const apply = BatchRepair.parseArgs(['--apply', '--fix-debt-balance', '--delivery', 'ghth']);
  assert.equal(apply.apply, true);
  assert.equal(apply.fixDebtBalance, true);
  assert.equal(apply.deliveryStaffCode, 'ghth');
});
