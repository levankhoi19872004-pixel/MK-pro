'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const audit = require('../scripts/phase260c/audit-post-closeout-debt-correction');
const planner = require('../scripts/phase260c/plan-post-closeout-debt-repair');
const apply = require('../scripts/phase260c/apply-post-closeout-debt-repair');

const wrongLedger = {
  id: 'AR-DEBT-ADJUSTMENT-WRONG-B0039602',
  code: 'AR-DEBT-ADJUSTMENT-WRONG-B0039602',
  category: 'AR-DEBT-ADJUSTMENT',
  sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
  sourceId: 'DCOC-B0039602',
  correctionId: 'DCOC-B0039602',
  orderId: 'SO-B0039602',
  orderCode: 'B0039602',
  customerCode: '4501189',
  debit: 7696479,
  credit: 0,
  active: true,
  accountingStatus: 'confirmed'
};

const correction = {
  id: 'DCOC-B0039602',
  correctionCode: 'DCOC-B0039602',
  orderId: 'SO-B0039602',
  orderCode: 'B0039602',
  customerCode: '4501189',
  returnAdjustmentAmount: 92211,
  cashDeltaAmount: 0,
  bankDeltaAmount: 0,
  rewardDeltaAmount: 0,
  newCloseoutVersion: 2
};

test('Phase260C-R2 audit classifies B0039602 wrong debit as debt recreated after payment', () => {
  const row = audit.publicRow({
    ledger: wrongLedger,
    correction,
    receipt: { id: 'DC202607150546446561', category: 'AR-DEBT-PAYMENT', credit: 7788690 }
  });
  assert.equal(row.actualDebtEffect, 7696479);
  assert.equal(row.expectedDebtDelta, -92211);
  assert.equal(row.classification, 'DEBT_RECREATED_AFTER_PAYMENT');
  assert.equal(row.reasonCode, 'DEBT_RECREATED_AFTER_PAYMENT');
  assert.equal(row.autoApplicable, true);
});

test('Phase260C-R2 planner creates reversal plus correct credit entry', () => {
  const plan = planner.buildPlan({
    status: 'AUDIT_EXECUTED',
    rows: [audit.publicRow({ ledger: wrongLedger, correction, receipt: { id: 'R1', category: 'AR-DEBT-PAYMENT', credit: 7788690 } })]
  });
  const item = plan.items[0];
  assert.equal(plan.status, 'PLAN_READY');
  assert.equal(item.autoApplicable, true);
  assert.equal(item.reverseOriginal.credit, 7696479);
  assert.equal(item.correctDeltaEntry.credit, 92211);
  assert.equal(item.correctDeltaEntry.debit, 0);
});

test('Phase260C-R2 apply is guarded by env flag and confirmation token', () => {
  assert.deepEqual(apply.assertApplyAllowed([]), { apply: false, dryRun: true });
  assert.throws(
    () => apply.assertApplyAllowed(['--apply', '--confirm-token=PHASE260C_APPLY'], {}),
    /PHASE260C_REPAIR_ENABLE/
  );
  assert.throws(
    () => apply.assertApplyAllowed(['--apply', '--confirm-token=WRONG'], { PHASE260C_REPAIR_ENABLE: 'YES' }),
    /confirm-token/
  );
  assert.deepEqual(
    apply.assertApplyAllowed(['--apply', '--confirm-token=PHASE260C_APPLY'], { PHASE260C_REPAIR_ENABLE: 'YES' }),
    { apply: true, dryRun: false }
  );
});

test('Phase260C-R2 dry run does not mutate and builds auditable rows', async () => {
  const plan = planner.buildPlan({
    status: 'AUDIT_EXECUTED',
    rows: [audit.publicRow({ ledger: wrongLedger, correction, receipt: { id: 'R1', category: 'AR-DEBT-PAYMENT', credit: 7788690 } })]
  });
  const results = await apply.applyPlan(plan, { apply: false, repairRunId: 'TEST-RUN' });
  assert.equal(results.length, 1);
  assert.equal(results[0].dryRun, true);
  assert.equal(results[0].skipped, false);
  assert.equal(results[0].reversal.credit, 7696479);
  assert.equal(results[0].correct.credit, 92211);
  assert.equal(results[0].reversal.metadata.controlledReversal, true);
  assert.equal(results[0].correct.metadata.adjustmentPolicy, 'EVENT_DELTA_ONLY');
});

test('Phase260C-R2 audit-not-executed propagates into plan status', () => {
  const plan = planner.buildPlan(audit.disconnectedReport(new Error('atlas whitelist')));
  assert.equal(plan.status, 'AUDIT_NOT_EXECUTED');
  assert.equal(plan.summary.total, 0);
});
