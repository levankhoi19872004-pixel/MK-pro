'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canProjectCanonicalAccountingLedgerToDebtReadModel, validateArLedgerContract } = require('../src/domain/ar/arLedgerValidator');
const { ACTIVE_DEBT_READ_MODEL_CATEGORIES } = require('../src/domain/ar/arDebtCategoryRegistry');

function adjustment(sourceType) {
  return {
    id: `AR-ADJ-${sourceType}`, code: `AR-ADJ-${sourceType}`,
    account: 'AR', category: 'AR-ADJUSTMENT', ledgerType: 'AR-ADJUSTMENT', entryType: 'normal', type: 'ar_adjustment',
    sourceType, sourceId: 'SO-1', sourceCode: 'B-1', refType: sourceType, refId: 'REF-1', refCode: 'REF-1',
    orderId: 'SO-1', orderCode: 'B-1', salesOrderId: 'SO-1', salesOrderCode: 'B-1', customerCode: 'C-1',
    debit: 0, credit: 1000, amount: 1000, direction: 'credit', amountField: 'credit',
    accountingStatus: 'confirmed', accountingConfirmed: true, active: true, reversed: false, status: 'posted',
    idempotencyKey: `AR-ADJUSTMENT:${sourceType}:SO-1:REF-1:v1`
  };
}

test('R1 AR-ADJUSTMENT is an active debt category only with canonical correction provenance', () => {
  assert.equal(ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes('AR-ADJUSTMENT'), true);
  const canonicalCorrection = adjustment('DELIVERY_CLOSEOUT_CORRECTION');
  assert.equal(validateArLedgerContract(canonicalCorrection).ok, true);
  assert.equal(canProjectCanonicalAccountingLedgerToDebtReadModel(canonicalCorrection), true);

  const historicalAdminAdjustment = adjustment('ADMIN_CORRECTION');
  assert.equal(validateArLedgerContract(historicalAdminAdjustment).ok, true, 'accounting ledger can be structurally valid');
  assert.equal(canProjectCanonicalAccountingLedgerToDebtReadModel(historicalAdminAdjustment), false, 'legacy/admin AR-ADJUSTMENT must stay out of Debt New');
});
