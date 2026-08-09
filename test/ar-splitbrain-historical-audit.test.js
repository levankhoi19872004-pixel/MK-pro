'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/ar-splitbrain-b0041181.fixture.json');
const audit = require('../scripts/audit-closeout-ar-splitbrain');

test('R1 historical dry-run flags missing B0041181 correction event without snapshot-to-current-AR reconciliation', () => {
  const result = audit.auditRows(fixture);
  assert.equal(result.readOnly, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.snapshotFinalStateComparisonUsed, false);
  assert.equal(result.checkedCorrections, 1);
  assert.equal(result.findingCount, 1);
  assert.equal(result.findings[0].orderCode, 'B0041181');
  assert.equal(result.findings[0].expectedEventDelta, -23800000);
  assert.equal(result.findings[0].returnDeltaExcluded, true);
  assert.match(result.findings[0].issues, /MISSING_CANONICAL_CORRECTION_EVENT/);
  assert.equal(result.findings[0].proposedAction, 'REVIEW_EVENT_HISTORY_ONLY_NO_AUTO_REPAIR');
  assert.deepEqual(audit.parseArgs(['--apply', '--fix']), { fixture: '', out: '', json: false, limit: 20000 });
});

test('R1 audit accepts matching AR-ADJUSTMENT correction event and preserves return ownership separation', () => {
  const correction = {
    id: 'DCOC-1', correctionCode: 'DCOC-1', orderId: 'SO-1', orderCode: 'B1', customerCode: 'KH1',
    cashDeltaAmount: 2000000, rewardDeltaAmount: 500000, returnAdjustmentAmount: 1000000
  };
  const result = audit.auditRows({
    corrections: [correction],
    arLedgers: [{
      id: 'AR-ADJ-1', account: 'AR', category: 'AR-ADJUSTMENT', ledgerType: 'AR-ADJUSTMENT',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', sourceId: 'SO-1', sourceCode: 'B1', orderId: 'SO-1', orderCode: 'B1',
      correctionId: 'DCOC-1', refId: 'DCOC-1', debit: 0, credit: 2500000,
      active: true, reversed: false, status: 'posted'
    }]
  });
  assert.equal(result.findingCount, 0);
  assert.equal(audit.correctionOwnedEventDelta(correction), -2500000);
});

test('R1 audit never silently accepts retired AR-DEBT-ADJUSTMENT for a correction', () => {
  const correction = { id: 'DCOC-LEGACY', orderId: 'SO-L', orderCode: 'BL', cashDeltaAmount: 1000 };
  const result = audit.auditRows({
    corrections: [correction],
    arLedgers: [{
      id: 'LEGACY-1', account: 'AR', category: 'AR-DEBT-ADJUSTMENT', ledgerType: 'AR-DEBT-ADJUSTMENT',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', sourceId: 'SO-L', sourceCode: 'BL', refId: 'DCOC-LEGACY',
      debit: 0, credit: 1000, active: true, reversed: false, status: 'posted'
    }]
  });
  assert.equal(result.findingCount, 1);
  assert.match(result.findings[0].issues, /MISSING_CANONICAL_CORRECTION_EVENT/);
  assert.match(result.findings[0].issues, /LEGACY_AR_DEBT_ADJUSTMENT_REQUIRES_REVIEW/);
});
