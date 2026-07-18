'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveDebtLedgerOwnership } = require('../src/domain/ar/DebtLedgerOwnershipResolver');
const auditScript = require('../scripts/phase260d/audit-mixed-ledger-ownership');
const planner = require('../scripts/phase260d/plan-duplicate-business-event-repair');
const applyScript = require('../scripts/phase260d/apply-duplicate-business-event-repair');

test('Phase260D audit classifies mixed AR-SALE and AR-DEBT-OPEN as projection shadow only', () => {
  const ownership = resolveDebtLedgerOwnership([
    { id: 'sale-1', category: 'AR-SALE', orderId: 'SO-1', orderCode: 'B001', debit: 100000 },
    { id: 'open-1', category: 'AR-DEBT-OPEN', orderId: 'SO-1', orderCode: 'B001', debit: 100000 }
  ]);
  const rows = auditScript.decisionRows(ownership);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classification, 'PROJECTION_SHADOW');
  assert.equal(rows[0].proposedAction, 'PROJECTION_EXCLUDE_ONLY');
  const plan = planner.buildPlan({ status: 'AUDIT_EXECUTED', rows });
  assert.equal(plan.summary.projectionShadowOnly, 1);
  assert.equal(plan.items[0].mutationAllowed, false);
  assert.equal(plan.items[0].proposedAction, 'PROJECTION_EXCLUDE_ONLY');
});

test('Phase260D planner separates actual duplicate financial effect from projection shadow', () => {
  const plan = planner.buildPlan({
    status: 'AUDIT_EXECUTED',
    rows: [{
      orderCode: 'B002',
      customerCode: 'C001',
      semanticRole: 'OPENING_OBLIGATION',
      businessEventIdentity: 'order:SO-2',
      classification: 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT',
      reasonCode: 'MULTIPLE_ACTIVE_LEDGER_SAME_BUSINESS_EVENT',
      actualDuplicateLedgerIds: ['dup-2'],
      currentNetEffect: 200000,
      expectedNetEffect: 100000
    }]
  });
  assert.equal(plan.status, 'PLAN_READY');
  assert.equal(plan.summary.actualDuplicateFinancialEffect, 1);
  assert.equal(plan.items[0].mutationAllowed, true);
  assert.equal(plan.items[0].autoApplicable, false);
  assert.equal(plan.items[0].proposedAction, 'CONTROLLED_REVERSAL_MANUAL_REVIEW_REQUIRED');
});

test('Phase260D apply guard requires apply flag, env flag and explicit confirmation token', () => {
  assert.deepEqual(applyScript.assertApplyAllowed([], {}), { apply: false, dryRun: true });
  assert.throws(
    () => applyScript.assertApplyAllowed(['--apply', '--confirmation-token=PHASE260D_APPLY'], {}),
    /AR_DEBT_DUPLICATE_REPAIR_ENABLED=true/
  );
  assert.throws(
    () => applyScript.assertApplyAllowed(['--apply', '--confirmation-token=WRONG'], { AR_DEBT_DUPLICATE_REPAIR_ENABLED: 'true' }),
    /--confirmation-token=PHASE260D_APPLY/
  );
  assert.deepEqual(
    applyScript.assertApplyAllowed(['--apply', '--confirmation-token=PHASE260D_APPLY'], { AR_DEBT_DUPLICATE_REPAIR_ENABLED: 'true' }),
    { apply: true, dryRun: false }
  );
});

test('Phase260D disconnected production audit report is explicit and non-mutating', () => {
  const report = auditScript.disconnectedReport(new Error('network unavailable'), ['--order-codes=B0039284,B0038752']);
  assert.equal(report.status, 'PRODUCTION_AUDIT_NOT_EXECUTED');
  assert.equal(report.mutation, false);
  assert.equal(report.scannedCount, 0);
  assert.deepEqual(report.orderCodes, ['B0039284', 'B0038752']);
});

test('Phase260D dry run never mutates projection shadow items', async () => {
  const results = await applyScript.applyPlan({
    items: [{
      repairItemId: 'PHASE260D-R3-0001',
      classification: 'PROJECTION_SHADOW',
      businessEventIdentity: 'order:SO-1',
      actualDuplicateLedgerIds: []
    }]
  }, { apply: false, repairRunId: 'TEST-RUN' });
  assert.equal(results[0].dryRun, true);
  assert.equal(results[0].skipped, true);
  assert.equal(results[0].reason, 'projection_shadow_only_no_mutation');
});
