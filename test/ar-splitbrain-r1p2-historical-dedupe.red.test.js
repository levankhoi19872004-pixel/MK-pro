'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../scripts/audit-closeout-ar-splitbrain');

function correction() {
  return {
    id: 'DCOC-AUDIT-1', code: 'DCOC-AUDIT-1', correctionId: 'DCOC-AUDIT-1', correctionCode: 'DCOC-AUDIT-1',
    orderId: 'SO-AUDIT-1', salesOrderId: 'SO-AUDIT-1', orderCode: 'AUDIT-HEALTHY-001', salesOrderCode: 'AUDIT-HEALTHY-001',
    customerCode: 'C-AUDIT', cashDeltaAmount: 2000, newCloseoutVersion: 2
  };
}
function opening() {
  return { id:'AR-OPEN-1', _id:'AR-OPEN-1', account:'AR', category:'AR-SALE', debit:10000, credit:0,
    orderId:'SO-AUDIT-1', salesOrderId:'SO-AUDIT-1', orderCode:'AUDIT-HEALTHY-001', salesOrderCode:'AUDIT-HEALTHY-001',
    sourceType:'ORDER', active:true, status:'posted' };
}
function correctionLedger() {
  return { id:'AR-CORR-1', _id:'AR-CORR-1', account:'AR', category:'AR-ADJUSTMENT', debit:0, credit:2000,
    sourceType:'DELIVERY_CLOSEOUT_CORRECTION', refType:'DELIVERY_CLOSEOUT_CORRECTION',
    correctionId:'DCOC-AUDIT-1', correctionCode:'DCOC-AUDIT-1', refId:'DCOC-AUDIT-1', refCode:'DCOC-AUDIT-1',
    orderId:'SO-AUDIT-1', salesOrderId:'SO-AUDIT-1', orderCode:'AUDIT-HEALTHY-001', salesOrderCode:'AUDIT-HEALTHY-001',
    sourceVersion:2, idempotencyKey:'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-AUDIT-1:DCOC-AUDIT-1:v2', active:true, status:'posted',
    metadata:{ correctionId:'DCOC-AUDIT-1', correctionCode:'DCOC-AUDIT-1', closeoutVersion:2 }
  };
}

test('RED R1P2: duplicate ingestion of same stable ledger must count once', () => {
  const c = correction();
  const one = correctionLedger();
  const clone = JSON.parse(JSON.stringify(one));
  const row = audit.classifyTimeline({
    correction:c,
    canonicalOrderRows:[opening(), one],
    allArRows:[opening(), one, clone],
    snapshot:{ok:true,debtRaw:8000,allocationRef:'ALLOC-1',closeoutVersionRef:'V2'}
  });
  assert.equal(row.canonicalCorrectionEventCount, 1);
  assert.equal(row.canonicalCorrectionEventEffect, -2000);
  assert.equal(row.classification, 'no_mismatch');
  assert.equal(row.issues.includes('DUPLICATE_CANONICAL_CORRECTION_EVENTS'), false);
});

test('R1P2 audit dedupe: two different persisted ledgers with same amount/category remain two events', () => {
  const a = correctionLedger();
  const b = {...correctionLedger(), id:'AR-CORR-2', _id:'AR-CORR-2', idempotencyKey:'AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-AUDIT-1:DCOC-AUDIT-1:v2:other'};
  const deduped = audit.dedupeLedgerRows([a,b]);
  assert.equal(deduped.length, 2);
});

test('R1P2 audit dedupe: same idempotency identity without persisted id is one ingestion', () => {
  const a = correctionLedger(); delete a.id; delete a._id;
  const b = JSON.parse(JSON.stringify(a));
  const deduped = audit.dedupeLedgerRows([a,b]);
  assert.equal(deduped.length, 1);
});
