'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDebtBusinessEventIdentity } = require('../src/domain/ar/debtBusinessEventIdentity');
const { SEMANTIC_ROLES } = require('../src/domain/ar/debtLedgerSemanticRegistry');

test('RED R1P2: closeout correction AR-ADJUSTMENT with generic ref must resolve as correction, not return', () => {
  const result = buildDebtBusinessEventIdentity({
    category:'AR-ADJUSTMENT', ledgerType:'AR-ADJUSTMENT', sourceType:'DELIVERY_CLOSEOUT_CORRECTION', refType:'DELIVERY_CLOSEOUT_CORRECTION',
    correctionId:'DCOC-1', correctionCode:'DCOC-1', refId:'DCOC-1', sourceId:'DCOC-1',
    orderId:'SO-1', orderCode:'B1', sourceVersion:2
  });
  assert.equal(result.ok, true);
  assert.equal(result.semanticRole, SEMANTIC_ROLES.CORRECTION_DELTA);
  assert.equal(result.sourceKind, 'correction');
  assert.equal(result.businessEventIdentity.includes('RETURN_REDUCTION'), false);
});

test('R1P2 identity control: explicit returnOrderId still resolves as return', () => {
  const result = buildDebtBusinessEventIdentity({
    category:'AR-RETURN', ledgerType:'AR-RETURN', sourceType:'RETURN_ORDER', returnOrderId:'RET-1', refId:'RET-1', orderId:'SO-1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.sourceKind, 'return');
});

test('R1P2 ownership: CORRECTION_DELTA is not grouped as RETURN_REDUCTION', () => {
  const { resolveDebtLedgerOwnership } = require('../src/domain/ar/DebtLedgerOwnershipResolver');
  const result = resolveDebtLedgerOwnership([{
    id:'LEDGER-CORR-1', account:'AR', category:'AR-ADJUSTMENT', ledgerType:'AR-ADJUSTMENT',
    sourceType:'DELIVERY_CLOSEOUT_CORRECTION', refType:'DELIVERY_CLOSEOUT_CORRECTION', correctionId:'DCOC-1',
    refId:'DCOC-1', sourceId:'DCOC-1', orderId:'SO-1', orderCode:'B1', sourceVersion:2,
    debit:0, credit:2000, status:'posted', active:true
  }]);
  assert.equal(result.selectedEntries.length, 1);
  assert.equal(result.selectedEntries[0].semanticRole, SEMANTIC_ROLES.CORRECTION_DELTA);
  assert.equal(result.selectedEntries[0].businessEventSourceKind, 'correction');
  assert.equal(result.ownershipDecisions[0].groupKey.startsWith('RETURN_REDUCTION::'), false);
});
