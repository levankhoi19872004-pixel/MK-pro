'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Timeline = require('../src/services/accounting/HistoricalCorrectionTimelineService');
const Detector = require('../src/services/accounting/HistoricalCorrectionMissingEventDetector');
const Planner = require('../src/services/accounting/HistoricalCorrectionRepairPlanner');
const EventDelta = require('../src/services/accounting/CloseoutCorrectionArEventDeltaPostingService');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ar-splitbrain-r1p4-b0041181.fixture.json'), 'utf8'));
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function transitions(input = FIXTURE) { return Timeline.reconstructHistoricalTransitions(input); }
function historical(input = FIXTURE) { return transitions(input).find((row) => row.correctionId === 'DCOC-B0041181-v2'); }
function eventLedgerFor(transition) {
  return EventDelta.buildEventDeltaLedger({ order: transition.syntheticOrder, correction: transition.syntheticCorrection, version: transition.version }, { actor: 'test', now: '2026-08-10T00:00:00.000Z' });
}

test('R1P4 planner: B0041181 finds exactly one missing historical event, ignores current no-op', () => {
  const input = clone(FIXTURE);
  const rows = transitions(input);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fromVersion, 1);
  assert.equal(rows[0].toVersion, 2);
  assert.equal(rows[0].correctionOwnedDebtDelta, -23800000);
  assert.equal(rows[0].classification, 'RECONSTRUCTED');
  assert.equal(rows[1].fromVersion, 2);
  assert.equal(rows[1].toVersion, 3);
  assert.equal(rows[1].correctionOwnedDebtDelta, 0);
  assert.equal(rows[1].classification, 'NO_EFFECT');

  const plan = Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T00:00:00.000Z' });
  assert.equal(plan.proposedRepairCount, 1);
  assert.equal(plan.items[0].correctionId, 'DCOC-B0041181-v2');
  assert.equal(plan.items[0].expectedMissingEventDelta, -23800000);
  assert.equal(plan.items[0].expectedCredit, 23800000);
  assert.equal(plan.items[0].expectedDebit, 0);
  assert.equal(plan.items[0].expectedCurrentArAfterIfAppliedNow, 85);
  assert.equal(plan.items[0].canonicalCategory, 'AR-ADJUSTMENT');
  assert.equal(plan.items[0].sourceType, 'DELIVERY_CLOSEOUT_CORRECTION');
  assert.equal(plan.items[0].idempotencyIdentity, 'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-B0041181:DCOC-B0041181-v2:v2');
  assert.equal(Planner.verifyPlanHash(plan).ok, true);
  assert.equal(Planner.verifyPlanItemHash(plan.items[0]).ok, true);
});

test('R1P4 detector: already-posted exact canonical event is never planned again', () => {
  const input = clone(FIXTURE);
  const t = historical(input);
  input.arLedgers.push(eventLedgerFor(t));
  const detection = Detector.detectMissingCanonicalEvent(t, input.arLedgers);
  assert.equal(detection.classification, 'ALREADY_POSTED');
  assert.equal(detection.safeToApply, false);
  assert.equal(Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T00:00:00.000Z' }).proposedRepairCount, 0);
});

test('R1P4 detector: duplicate existing correction event fails closed', () => {
  const input = clone(FIXTURE);
  const t = historical(input);
  const a = eventLedgerFor(t);
  const b = { ...clone(a), id: `${a.id}-DUP`, code: `${a.code}-DUP` };
  input.arLedgers.push(a, b);
  const detection = Detector.detectMissingCanonicalEvent(t, input.arLedgers);
  assert.equal(detection.classification, 'DUPLICATE_EXISTING_EVENT');
  assert.equal(detection.safeToApply, false);
});

test('R1P4 detector: existing correction event with wrong amount fails closed', () => {
  const input = clone(FIXTURE);
  const t = historical(input);
  const wrong = eventLedgerFor(t);
  wrong.credit = 10000000; wrong.amount = 10000000;
  input.arLedgers.push(wrong);
  const detection = Detector.detectMissingCanonicalEvent(t, input.arLedgers);
  assert.equal(detection.classification, 'EVENT_AMOUNT_MISMATCH');
  assert.equal(detection.expectedEffect, -23800000);
  assert.equal(detection.actualEffect, -10000000);
  assert.equal(detection.safeToApply, false);
});

test('R1P4 timeline: missing previous immutable state is AMBIGUOUS, never safe to plan', () => {
  const input = clone(FIXTURE);
  input.order.deliveryCloseout = { ...input.order.deliveryCloseout, closeoutVersion: 3, cashAmount: 22140000, rewardAmount: 1660000, debtAmount: 85 };
  input.versions = [];
  input.corrections = [clone(input.corrections[0])];
  for (const key of ['previousCashAmount','previousBankAmount','previousRewardAmount','previousReturnAmount','previousDebtAmount']) delete input.corrections[0][key];
  const row = transitions(input)[0];
  assert.equal(row.classification, 'AMBIGUOUS_TIMELINE');
  assert.equal(Detector.detectMissingCanonicalEvent(row, input.arLedgers).classification, 'AMBIGUOUS_TIMELINE');
  assert.equal(Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T00:00:00.000Z' }).proposedRepairCount, 0);
});

test('R1P4 timeline: correction/version immutable conflict is DATA_CONFLICT', () => {
  const input = clone(FIXTURE);
  input.versions[0].cashAmount = 20000000;
  const row = historical(input);
  assert.equal(row.classification, 'DATA_CONFLICT');
  assert.ok(row.immutableConflicts.some((x) => x.field === 'newCashAmount'));
  assert.equal(Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T00:00:00.000Z' }).proposedRepairCount, 0);
});

test('R1P4 timeline: multiple corrections reconcile independently and later payment decrease creates debit delta', () => {
  const input = clone(FIXTURE);
  input.corrections.push({
    id:'DCOC-B0041181-v4', code:'DCOC-B0041181-v4', correctionId:'DCOC-B0041181-v4', correctionCode:'DCOC-B0041181-v4',
    orderId:'SO-B0041181', orderCode:'B0041181', salesOrderId:'SO-B0041181', salesOrderCode:'B0041181', customerCode:'4499499',
    originalCloseoutVersion:3, newCloseoutVersion:4,
    previousCashAmount:22140000, previousBankAmount:0, previousRewardAmount:1660000, previousReturnAmount:0, previousDebtAmount:85,
    newCashAmount:20000000, newBankAmount:0, newRewardAmount:1000000, newReturnAmount:0, newDebtAmount:2800085,
    cashDeltaAmount:-2140000, bankDeltaAmount:0, rewardDeltaAmount:-660000, returnAdjustmentAmount:0,
    sourceType:'DELIVERY_CLOSEOUT_CORRECTION', status:'confirmed', createdAt:'2026-08-10T01:00:00.000Z'
  });
  const rows = transitions(input);
  const later = rows.find((r) => r.correctionId === 'DCOC-B0041181-v4');
  assert.equal(later.correctionOwnedDebtDelta, 2800000);
  assert.equal(later.classification, 'RECONSTRUCTED');
  const plan = Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T02:00:00.000Z' });
  assert.equal(plan.proposedRepairCount, 2);
  const item = plan.items.find((x) => x.correctionId === 'DCOC-B0041181-v4');
  assert.equal(item.expectedDebit, 2800000);
  assert.equal(item.expectedCredit, 0);
});

test('R1P4 planner: when one of several correction events already exists, only missing transition is planned', () => {
  const input = clone(FIXTURE);
  const t = historical(input);
  input.arLedgers.push(eventLedgerFor(t));
  // Add another non-zero correction that is missing.
  input.corrections.push({
    id:'DCOC-B0041181-v4', code:'DCOC-B0041181-v4', correctionId:'DCOC-B0041181-v4', correctionCode:'DCOC-B0041181-v4',
    orderId:'SO-B0041181', orderCode:'B0041181', salesOrderId:'SO-B0041181', salesOrderCode:'B0041181', customerCode:'4499499',
    originalCloseoutVersion:3, newCloseoutVersion:4,
    previousCashAmount:22140000, previousBankAmount:0, previousRewardAmount:1660000, previousReturnAmount:0,
    newCashAmount:21140000, newBankAmount:0, newRewardAmount:1660000, newReturnAmount:0,
    cashDeltaAmount:-1000000, bankDeltaAmount:0, rewardDeltaAmount:0, returnAdjustmentAmount:0,
    sourceType:'DELIVERY_CLOSEOUT_CORRECTION', status:'confirmed', createdAt:'2026-08-10T01:00:00.000Z'
  });
  const plan = Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T02:00:00.000Z' });
  assert.equal(plan.proposedRepairCount, 1);
  assert.equal(plan.items[0].correctionId, 'DCOC-B0041181-v4');
  assert.equal(plan.items[0].expectedMissingEventDelta, 1000000);
});

test('R1P4 return-only historical correction remains externally owned and is never generic-repaired', () => {
  const input = clone(FIXTURE);
  input.corrections = [{
    id:'DCOC-RETURN-ONLY', code:'DCOC-RETURN-ONLY', correctionId:'DCOC-RETURN-ONLY', correctionCode:'DCOC-RETURN-ONLY',
    orderId:'SO-B0041181', orderCode:'B0041181', salesOrderId:'SO-B0041181', salesOrderCode:'B0041181', customerCode:'4499499',
    originalCloseoutVersion:1, newCloseoutVersion:2,
    previousCashAmount:0, previousBankAmount:0, previousRewardAmount:0, previousReturnAmount:0,
    newCashAmount:0, newBankAmount:0, newRewardAmount:0, newReturnAmount:2000,
    cashDeltaAmount:0, bankDeltaAmount:0, rewardDeltaAmount:0, returnAdjustmentAmount:2000,
    sourceType:'DELIVERY_CLOSEOUT_CORRECTION', status:'confirmed', createdAt:'2026-08-10T01:00:00.000Z'
  }];
  input.versions = [];
  const row = transitions(input)[0];
  assert.equal(row.correctionOwnedDebtDelta, 0);
  assert.equal(row.returnDeltaObserved, 2000);
  assert.equal(row.classification, 'RETURN_OWNED_EXTERNALLY');
  assert.equal(Detector.detectMissingCanonicalEvent(row, input.arLedgers).classification, 'RETURN_OWNED_EXTERNALLY');
  assert.equal(Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T02:00:00.000Z' }).proposedRepairCount, 0);
});

test('R1P4 planner: current AR/subsequent receipts are evidence only and never change historical missing delta', () => {
  const input = clone(FIXTURE);
  const receipt = { id:'AR-RECEIPT-AFTER', category:'AR-RECEIPT-CASH', debit:0, credit:5000000, createdAt:'2026-08-05T00:00:00.000Z' };
  input.currentArBeforeObserved = 18800085;
  input.subsequentEvents = [receipt];
  const plan = Planner.createRepairPlan({ ...input, generatedAt: '2026-08-10T02:00:00.000Z' });
  assert.equal(plan.items[0].expectedMissingEventDelta, -23800000);
  assert.equal(plan.items[0].currentArBeforeObserved, 18800085);
  assert.equal(plan.items[0].expectedCurrentArAfterIfAppliedNow, -4999915);
  assert.equal(plan.items[0].subsequentEventSummary[0].effect, -5000000);
});

test('R1P4 plan hash and item hash fail closed after tampering', () => {
  const plan = Planner.createRepairPlan({ ...clone(FIXTURE), generatedAt: '2026-08-10T02:00:00.000Z' });
  const tamperedPlan = clone(plan); tamperedPlan.currentArBeforeObserved += 1;
  assert.equal(Planner.verifyPlanHash(tamperedPlan).ok, false);
  const tamperedItem = clone(plan.items[0]); tamperedItem.expectedMissingEventDelta += 1;
  assert.equal(Planner.verifyPlanItemHash(tamperedItem).ok, false);
});
