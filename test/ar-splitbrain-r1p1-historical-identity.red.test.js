'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../scripts/audit-closeout-ar-splitbrain');

function correction(overrides = {}) {
  return {
    id: 'DCOC-1', code: 'DCOC-1', correctionId: 'DCOC-1', correctionCode: 'DCOC-1',
    salesOrderId: 'SO-1', salesOrderCode: 'B00411', orderId: 'SO-1', orderCode: 'B00411',
    customerCode: 'C-1', cashDeltaAmount: 1000,
    ...overrides
  };
}
function ledger(overrides = {}) {
  return {
    id: 'L-1', code: 'L-1', account: 'AR', category: 'AR-ADJUSTMENT', ledgerType: 'AR-ADJUSTMENT',
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', sourceId: 'SO-1', sourceCode: 'B00411',
    orderId: 'SO-1', orderCode: 'B00411', salesOrderId: 'SO-1', salesOrderCode: 'B00411',
    customerCode: 'C-1', debit: 0, credit: 1000, active: true, reversed: false,
    accountingConfirmed: true, accountingStatus: 'confirmed', status: 'posted',
    ...overrides
  };
}

test('RED R1P1: DCOC-1 must not match unrelated DCOC-10 from idempotency substring', () => {
  const row = ledger({
    correctionId: '', correctionCode: '', refId: '', refCode: '',
    idempotencyKey: 'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-1:DCOC-10:v1'
  });
  assert.equal(audit.isCanonicalCorrectionEvent(row, correction()), false);
});

test('contract: exact structured correction identity matches', () => {
  const row = ledger({
    correctionId: 'DCOC-1', correctionCode: 'DCOC-1', refId: 'DCOC-1', refCode: 'DCOC-1',
    idempotencyKey: 'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-1:DCOC-1:v1'
  });
  assert.equal(audit.isCanonicalCorrectionEvent(row, correction()), true);
});

test('contract: order prefix B00411 must not match B0041181', () => {
  const row = ledger({
    correctionId: 'DCOC-1', correctionCode: 'DCOC-1', refId: 'DCOC-1', refCode: 'DCOC-1',
    sourceId: 'SO-1181', sourceCode: 'B0041181', orderId: 'SO-1181', orderCode: 'B0041181',
    salesOrderId: 'SO-1181', salesOrderCode: 'B0041181',
    idempotencyKey: 'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-1181:DCOC-1:v1'
  });
  assert.equal(audit.isCanonicalCorrectionEvent(row, correction()), false);
});

test('RED R1P1: direct correction refs must still recover canonical version from structured idempotency key', () => {
  const row = ledger({
    correctionId: 'DCOC-1', correctionCode: 'DCOC-1', refId: 'DCOC-1', refCode: 'DCOC-1',
    idempotencyKey: 'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-1:DCOC-1:v2',
    metadata: { correctionId: 'DCOC-1', correctionCode: 'DCOC-1', closeoutVersion: 2 }
  });
  assert.equal(audit.isCanonicalCorrectionEvent(row, correction({ newCloseoutVersion: 2 })), true);
});
