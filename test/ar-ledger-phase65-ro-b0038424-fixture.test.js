'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { auditArLedgerIntegrity, ledgerEffect } = require('../scripts/audit-ar-ledger-integrity');
const { buildRepairPlan } = require('../scripts/plan-ar-ledger-repair');
const { applyRepairPlanToRows } = require('../scripts/apply-ar-ledger-repair-plan');
const { isActiveLedgerDoc } = require('../src/utils/arLedgerStatus.util');

function fixtureRows() {
  return [
    {
      _id: '111111111111111111111111',
      id: 'AR-RETURN-REV-AR-RETURN-RO-B0038424',
      code: 'AR-RETURN-REV-AR-RETURN-RO-B0038424',
      tenantId: 'T1',
      category: 'AR-RETURN',
      ledgerType: 'AR-RETURN',
      type: 'ar_return',
      source: 'returnOrders',
      sourceModel: 'returnOrders',
      sourceType: 'returnOrder',
      sourceId: 'RO-B0038424',
      sourceCode: 'RO-B0038424',
      returnOrderId: 'RO-B0038424',
      returnOrderCode: 'RO-B0038424',
      orderId: 'SO-B0038424',
      orderCode: 'SO-B0038424',
      salesOrderId: 'SO-B0038424',
      customerCode: 'B0038424',
      idempotencyKey: 'AR-RETURN:RO-B0038424',
      accountingBatchId: 'REV-SO178255038016695-1782739092338',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      status: 'posted',
      amount: 276632,
      debit: 0,
      credit: 276632,
      direction: 'credit',
      auditTrail: [],
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z'
    },
    {
      _id: '222222222222222222222222',
      id: 'AR-RETURN-REV-WRONG-RO-B0038424',
      code: 'AR-RETURN-REV-WRONG-RO-B0038424',
      tenantId: 'T1',
      category: 'AR-RETURN',
      ledgerType: 'AR-RETURN',
      type: 'ar_return',
      source: 'returnOrders',
      sourceModel: 'returnOrders',
      sourceType: 'returnOrder',
      sourceId: 'RO-B0038424',
      sourceCode: 'RO-B0038424',
      returnOrderId: 'RO-B0038424',
      returnOrderCode: 'RO-B0038424',
      orderId: 'SO-B0038424',
      orderCode: 'SO-B0038424',
      salesOrderId: 'SO-B0038424',
      customerCode: 'B0038424',
      idempotencyKey: 'AR-RETURN:RO-B0038424',
      accountingBatchId: 'REV-SO178255038016695-1782739092338-2',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      status: 'posted',
      amount: 276632,
      debit: 276632,
      credit: 0,
      direction: 'credit',
      auditTrail: [],
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z'
    },
    {
      _id: '333333333333333333333333',
      id: 'AR-RETURN-RO-B0038424',
      code: 'AR-RETURN-RO-B0038424',
      tenantId: 'T1',
      category: 'AR-RETURN',
      ledgerType: 'AR-RETURN',
      type: 'ar_return',
      source: 'returnOrders',
      sourceModel: 'returnOrders',
      sourceType: 'returnOrder',
      sourceId: 'RO-B0038424',
      sourceCode: 'RO-B0038424',
      returnOrderId: 'RO-B0038424',
      returnOrderCode: 'RO-B0038424',
      orderId: 'SO-B0038424',
      orderCode: 'SO-B0038424',
      salesOrderId: 'SO-B0038424',
      customerCode: 'B0038424',
      idempotencyKey: 'AR-RETURN:RO-B0038424',
      accountingBatchId: 'ACC-SO178255038016695-1782739092338',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      status: 'posted',
      amount: 276632,
      debit: 0,
      credit: 276632,
      direction: 'credit',
      auditTrail: [],
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z'
    }
  ];
}

const returnOrders = [{
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  id: 'RO-B0038424',
  code: 'RO-B0038424',
  returnOrderId: 'RO-B0038424',
  returnOrderCode: 'RO-B0038424',
  sourceId: 'RO-B0038424',
  sourceCode: 'RO-B0038424',
  customerCode: 'B0038424',
  salesOrderId: 'SO-B0038424',
  amount: 276632
}];

test('Phase65 RO-B0038424 fixture: audit detects P0 and plan keeps ACC canonical', () => {
  const rows = fixtureRows();
  const audit = auditArLedgerIntegrity(rows);
  const issueTypes = new Set(audit.issues.map((item) => item.issue));

  assert.equal(audit.totals.duplicateActiveIdempotencyGroups, 1);
  assert.equal(audit.totals.duplicateActiveArReturnGroups, 1);
  assert.ok(issueTypes.has('DUPLICATE_ACTIVE_IDEMPOTENCY'));
  assert.ok(issueTypes.has('DUPLICATE_ACTIVE_AR_RETURN'));
  assert.ok(issueTypes.has('AR_RETURN_DEBIT_POSITIVE'));
  assert.ok(issueTypes.has('DEBIT_DIRECTION_CONFLICT'));
  assert.ok(issueTypes.has('AR_RETURN_CODE_CONTAINS_REV'));
  assert.ok(issueTypes.has('REV_BATCH_STILL_CONFIRMED'));

  const plan = buildRepairPlan(rows, returnOrders, { createdAt: '2026-06-29T00:00:00.000Z' });
  assert.equal(plan.totals.repairItems, 1);
  assert.equal(plan.totals.autoRepairable, 1);

  const item = plan.repairItems[0];
  assert.equal(item.manualReviewRequired, false);
  assert.equal(item.canonicalLedgerObjectId, '333333333333333333333333');
  assert.equal(item.canonicalReason.selected.accountingBatchId.startsWith('ACC'), true);
  assert.equal(item.ledgersToVoid.length, 2);
  assert.deepEqual(item.ledgersToVoid.map((row) => row._id).sort(), ['111111111111111111111111', '222222222222222222222222']);
  assert.equal(item.expectedAfter.netImpact, -276632);
});

test('Phase65 RO-B0038424 fixture: dry-run does not mutate, apply voids REV rows only', () => {
  const rows = fixtureRows();
  const plan = buildRepairPlan(rows, returnOrders, { createdAt: '2026-06-29T00:00:00.000Z' });

  const dryRun = applyRepairPlanToRows(plan, rows, { apply: false, repairBatchId: 'PHASE65-FIXTURE', now: '2026-06-29T00:00:00.000Z' });
  assert.deepEqual(dryRun.rows, rows);

  const applied = applyRepairPlanToRows(plan, rows, { apply: true, repairBatchId: 'PHASE65-FIXTURE', now: '2026-06-29T00:00:00.000Z' });
  const activeRows = applied.rows.filter((row) => isActiveLedgerDoc(row, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] }));
  assert.equal(activeRows.length, 1);
  assert.equal(activeRows[0]._id, '333333333333333333333333');
  assert.equal(activeRows.reduce((sum, row) => sum + ledgerEffect(row), 0), -276632);

  const voidedRows = applied.rows.filter((row) => row.status === 'voided');
  assert.equal(voidedRows.length, 2);
  assert.deepEqual(voidedRows.map((row) => row._id).sort(), ['111111111111111111111111', '222222222222222222222222']);
  for (const row of voidedRows) {
    assert.equal(row.accountingStatus, 'voided');
    assert.equal(row.accountingConfirmed, false);
    assert.equal(row.voidedBy, 'ledger-repair-script');
    assert.equal(row.supersededBy, '333333333333333333333333');
    assert.equal(row.repairBatchId, 'PHASE65-FIXTURE');
    assert.ok(Array.isArray(row.auditTrail));
    assert.ok(row.auditTrail.some((entry) => entry.action === 'ledger_repair_void_duplicate'));
  }

  const canonical = applied.rows.find((row) => row._id === '333333333333333333333333');
  assert.equal(canonical.status, 'posted');
  assert.equal(canonical.accountingStatus, 'confirmed');
  assert.equal(canonical.credit, 276632);
});

const { validateArLedgerEntry } = require('../src/utils/arLedgerValidation.util');

test('Phase65 helpers: voided/superseded are inactive and validator blocks AR-RETURN corruption', () => {
  assert.equal(isActiveLedgerDoc({ status: 'voided' }), false);
  assert.equal(isActiveLedgerDoc({ accountingStatus: 'superseded' }), false);
  assert.equal(isActiveLedgerDoc({ status: 'posted', accountingStatus: 'confirmed' }), true);

  const invalidReturn = validateArLedgerEntry({ category: 'AR-RETURN', id: 'AR-RETURN-REV-X', code: 'AR-RETURN-REV-X', amount: 10, debit: 10, credit: 0, direction: 'credit' });
  const codes = new Set(invalidReturn.errors.map((item) => item.code));
  assert.ok(codes.has('AR_RETURN_DEBIT_POSITIVE'));
  assert.ok(codes.has('AR_RETURN_CODE_CONTAINS_REV'));
  assert.ok(codes.has('DEBIT_DIRECTION_CONFLICT'));

  const invalidReversal = validateArLedgerEntry({ category: 'AR-RETURN-REVERSAL', amount: 10, debit: 0, credit: 10, direction: 'credit' });
  assert.ok(invalidReversal.errors.some((item) => item.code === 'AR_RETURN_REVERSAL_MUST_BE_DEBIT_ONLY'));
});
