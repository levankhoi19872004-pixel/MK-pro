'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const correctionService = fs.readFileSync(path.join(root, 'src/services/deliveryCloseoutCorrection.service.js'), 'utf8');
const deliveryTodayService = fs.readFileSync(path.join(root, 'src/services/v2/deliveryTodayNew.service.js'), 'utf8');
const deliveryTodayUi = fs.readFileSync(path.join(root, 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('manual delivery adjustment integrates corrected reward final state into orderPaymentAllocations', () => {
  assert.match(correctionService, /OrderPaymentAllocationService\s*=\s*require\('\.\/accounting\/OrderPaymentAllocationService'\)/);
  assert.match(correctionService, /async function upsertCorrectionPaymentAllocation/);
  assert.match(correctionService, /OrderPaymentAllocationService\.buildAllocationFromCloseout\(order, version/);
  assert.match(correctionService, /sourceType:\s*'DELIVERY_CLOSEOUT_CORRECTION'/);
  assert.match(correctionService, /OrderPaymentAllocationService\.upsertAllocation\(allocation, options\)/);
  assert.match(correctionService, /paymentAllocationIntegrated:\s*Boolean\(paymentAllocation\)/);
  assert.match(correctionService, /postingPolicy:\s*'mirror_final_state_only; AR delta handled by AR-DEBT-ADJUSTMENT reconcile'/);
});

test('payment allocation mirror is written before AR debt reconcile so read source is not stale', () => {
  const allocationCall = correctionService.indexOf('const paymentAllocation = await upsertCorrectionPaymentAllocation');
  const arCall = correctionService.indexOf('const adjustment = await ArDebtAdjustmentPostingService.postAdjustment');
  assert.ok(allocationCall > 0, 'missing correction allocation upsert call');
  assert.ok(arCall > allocationCall, 'AR reconcile should run after allocation final-state mirror is available');
});

test('delivery today list ignores stale orderPaymentAllocation when a newer closeout correction version exists', () => {
  assert.match(deliveryTodayService, /function allocationIsCurrentForVersion/);
  assert.match(deliveryTodayService, /latestCorrectionVersion > allocationVersion/);
  assert.match(deliveryTodayService, /stalePaymentAllocationIgnored/);
  assert.match(deliveryTodayService, /deliveryCloseoutVersions\(latest correction; stale orderPaymentAllocation ignored\)/);
});

test('frontend sends reward final state in manual adjustment payload', () => {
  assert.match(deliveryTodayUi, /correctedRewardAmount:\s*totals\.newReward/);
  assert.match(deliveryTodayUi, /rewardDeltaAmount:\s*totals\.rewardDeltaAmount/);
  assert.match(deliveryTodayUi, /paymentMethod:\s*'reward'/);
});


test('delivery closeout correction version debt is server-calculated, not copied from frontend/stale payload', () => {
  const fnStart = correctionService.indexOf('function buildVersionSnapshot');
  assert.ok(fnStart >= 0, 'missing buildVersionSnapshot');
  const fn = correctionService.slice(fnStart, correctionService.indexOf('function correctionAllocationIdempotencyKey', fnStart));
  assert.match(fn, /const debtCalculation = calculateDeliveryDebtAmount\(\{/);
  assert.match(fn, /const newDebt = money\(debtCalculation\.debtAmount\)/);
  assert.doesNotMatch(fn, /const newDebt = money\(correction\.debtAmount \?\? correction\.newDebtAmount \?\? debtCalculation\.debtAmount\)/);
  assert.match(fn, /Debt for a closeout correction version is server-calculated from final-state amounts/);
});
