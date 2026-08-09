'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../scripts/audit-closeout-ar-splitbrain');

function correction({ id, orderId, orderCode, customerCode, cash = 0, reward = 0, receivable = 0 }) {
  return { id, code: id, correctionId: id, correctionCode: id, salesOrderId: orderId, salesOrderCode: orderCode,
    orderId, orderCode, customerCode, receivableDeltaAmount: receivable, cashDeltaAmount: cash, rewardDeltaAmount: reward,
    bankDeltaAmount: 0, returnAdjustmentAmount: 0, newCloseoutVersion: 2 };
}
function ledger({ id, category, orderId, orderCode, customerCode, debit = 0, credit = 0, sourceType, correctionId = '', source = '' }) {
  const isReceipt = category.startsWith('AR-RECEIPT');
  const row = {
    id, code: id, account: 'AR', category, ledgerType: category, entryType: 'normal',
    sourceType: sourceType || (isReceipt ? 'DEBTCOLLECTION' : 'ORDER_PAYMENT_ALLOCATION'),
    sourceId: orderId, sourceCode: orderCode, refType: isReceipt ? 'DEBTCOLLECTION' : 'ORDER_PAYMENT_ALLOCATION',
    refId: isReceipt ? `DC-${id}` : `REF-${id}`, refCode: isReceipt ? `DC-${id}` : `REF-${id}`,
    orderId, orderCode, salesOrderId: orderId, salesOrderCode: orderCode, customerCode,
    debit, credit, amount: Math.max(debit, credit), direction: debit > 0 ? 'debit' : 'credit', amountField: debit > 0 ? 'debit' : 'credit',
    active: true, reversed: false, status: 'posted', accountingConfirmed: true, accountingStatus: 'confirmed',
    idempotencyKey: isReceipt ? `AR-RECEIPT:DC${id}:${orderId}` : `${category}:${id}`,
    source: source || (isReceipt ? 'DebtCollectionPostingService' : 'fixture')
  };
  if (correctionId) {
    row.sourceType = 'DELIVERY_CLOSEOUT_CORRECTION'; row.refType = 'DELIVERY_CLOSEOUT_CORRECTION';
    row.correctionId = correctionId; row.correctionCode = correctionId; row.refId = correctionId; row.refCode = correctionId;
    row.idempotencyKey = `AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:${orderId}:${correctionId}:v2`;
    row.metadata = { correctionId, correctionCode: correctionId, contractVersion: 'R1_EVENT_DELTA_V1' };
  }
  return row;
}
function snapshot(orderId, orderCode, receivableAmount, cashAmount, debtAmount) {
  return {
    versions: [{ id: `DCOV-${orderId}`, orderId, salesOrderId: orderId, orderCode, salesOrderCode: orderCode,
      closeoutVersion: 2, sourceVersion: 2, version: 2, status: 'posted', active: true,
      receivableAmount, cashAmount, bankAmount: 0, rewardAmount: 0, returnAmount: 0, rawDebtAmount: debtAmount, debtAmount }],
    allocations: [{ id: `OPA-${orderId}`, allocationCode: `OPA-${orderId}`, orderId, salesOrderId: orderId, orderCode, salesOrderCode: orderCode,
      sourceVersion: 2, version: 2, status: 'posted', active: true,
      receivableAmount, cashAmount, bankAmount: 0, rewardAmount: 0, returnAmount: 0, rawDebtAmount: debtAmount, debtAmount }]
  };
}

test('R1P1 audit v2 classifies confirmed receipt as explained_by_subsequent_events', () => {
  const c = correction({ id: 'DCOC-REC-1', orderId: 'SO-REC-1', orderCode: 'B-REC-1', customerCode: 'C-REC-1', cash: 2000000 });
  const s = snapshot('SO-REC-1', 'B-REC-1', 10000000, 2000000, 8000000);
  const result = audit.auditRows({ corrections: [c], closeoutVersions: s.versions, allocations: s.allocations, arLedgers: [
    ledger({ id: 'SALE', category: 'AR-SALE', orderId: 'SO-REC-1', orderCode: 'B-REC-1', customerCode: 'C-REC-1', debit: 10000000 }),
    ledger({ id: 'RECEIPT', category: 'AR-RECEIPT-CASH', orderId: 'SO-REC-1', orderCode: 'B-REC-1', customerCode: 'C-REC-1', credit: 4000000 }),
    ledger({ id: 'CORR', category: 'AR-ADJUSTMENT', orderId: 'SO-REC-1', orderCode: 'B-REC-1', customerCode: 'C-REC-1', credit: 2000000, correctionId: 'DCOC-REC-1' })
  ]});
  assert.equal(result.findings[0].canonicalArDebt, 4000000);
  assert.equal(result.findings[0].expectedArFromEventTimeline, 4000000);
  assert.equal(result.findings[0].classification, 'explained_by_subsequent_events');
});

test('R1P1 audit v2 detects B0041181 pre-repair as true_splitbrain', () => {
  const c = correction({ id: 'DCOC-B0041181-2', orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499', cash: 22140000, reward: 1660000 });
  const s = snapshot('SO-B0041181', 'B0041181', 23800085, 23800085, 0);
  const result = audit.auditRows({ corrections: [c], closeoutVersions: s.versions, allocations: s.allocations, arLedgers: [
    ledger({ id: 'SALE-B0041181', category: 'AR-SALE', orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499', debit: 23800085 })
  ]});
  assert.equal(result.findings[0].classification, 'true_splitbrain');
});

test('R1P1 audit v2 treats B0041181 post-R1 raw 85 as no_mismatch by Debt Zero Tolerance', () => {
  const c = correction({ id: 'DCOC-B0041181-2', orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499', cash: 22140000, reward: 1660000 });
  const s = snapshot('SO-B0041181', 'B0041181', 23800085, 23800085, 0);
  const result = audit.auditRows({ corrections: [c], closeoutVersions: s.versions, allocations: s.allocations, arLedgers: [
    ledger({ id: 'SALE-B0041181', category: 'AR-SALE', orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499', debit: 23800085 }),
    ledger({ id: 'CORR-B0041181', category: 'AR-ADJUSTMENT', orderId: 'SO-B0041181', orderCode: 'B0041181', customerCode: '4499499', credit: 23800000, correctionId: 'DCOC-B0041181-2' })
  ]});
  assert.equal(result.findings[0].canonicalArDebt, 85);
  assert.equal(result.findings[0].classification, 'no_mismatch');
});
