'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const debtNew = require('../src/services/v2/debtNew.service');
const {
  classifyLegacyAdjustmentProjection,
  _private: policyPrivate
} = require('../src/domain/ar/legacyAdjustmentProjectionPolicy');

function ledger(category, debit, credit, overrides = {}) {
  const amount = Math.max(debit, credit);
  const side = debit > 0 ? 'debit' : 'credit';
  const id = overrides.id || `${category}-${amount}-${side}`;
  return {
    id,
    code: overrides.code || id,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    active: overrides.active ?? true,
    reversed: overrides.reversed ?? false,
    accountingConfirmed: overrides.accountingConfirmed ?? true,
    accountingStatus: overrides.accountingStatus || 'confirmed',
    status: overrides.status || 'confirmed',
    sourceType: overrides.sourceType || (category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'ORDER_PAYMENT_ALLOCATION'),
    sourceId: overrides.sourceId ?? 'SO-B0038754',
    sourceCode: overrides.sourceCode ?? 'B0038754',
    orderId: overrides.orderId ?? 'SO-B0038754',
    orderCode: overrides.orderCode ?? 'B0038754',
    salesOrderId: overrides.orderId ?? 'SO-B0038754',
    salesOrderCode: overrides.orderCode ?? 'B0038754',
    customerCode: overrides.customerCode ?? '5052861',
    customerName: overrides.customerName ?? 'Co Lan',
    debit,
    credit,
    amount,
    direction: side,
    amountField: side,
    receiptId: overrides.receiptId,
    allocationId: overrides.allocationId,
    returnOrderId: overrides.returnOrderId,
    correctionId: overrides.correctionId,
    sourceVersion: overrides.sourceVersion,
    idempotencyKey: overrides.idempotencyKey || `${category}:${id}`,
    metadata: overrides.metadata || {}
  };
}

test('Phase260F B0038754 before backfill keeps valid legacy adjustment fallback in order balance', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-DEBT-OPEN', 1329232, 0, { id: 'OPEN-B0038754', idempotencyKey: 'AR-DEBT-OPEN:SO-B0038754' }),
    ledger('AR-DEBT-ADJUSTMENT', 0, 150000, {
      id: 'ADJ-B0038754-150',
      sourceType: 'MANUAL_ADJUSTMENT',
      sourceId: 'MANUAL-CREDIT-B0038754',
      idempotencyKey: 'AR-DEBT-ADJUSTMENT:SO-B0038754:MANUAL-CREDIT-B0038754'
    }),
    ledger('AR-RECEIPT', 0, 1179232, {
      id: 'RECEIPT-B0038754-1179232',
      sourceType: 'DEBTCOLLECTION',
      sourceId: 'DC-B0038754-1179232',
      receiptId: 'DC-B0038754-1179232',
      idempotencyKey: 'AR-RECEIPT:DC-B0038754-1179232:SO-B0038754'
    })
  ], { status: 'all' });

  assert.equal(result.summary.totalDebit, 1329232);
  assert.equal(result.summary.totalCredit, 1329232);
  assert.equal(result.summary.totalDebt, 0);
  assert.equal(result.orders[0].rawBalance, 0);
  assert.equal(result.orders[0].debtAmount, 0);
  assert.equal(result.orders[0].creditBalance, 0);
  const adjustment = result.ledgers.find((row) => row.id === 'ADJ-B0038754-150');
  assert.equal(adjustment.projectionIncluded, true);
  assert.equal(adjustment.legacyFallback, true);
  assert.equal(adjustment.warningCode, 'LEGACY_ADJUSTMENT_INCLUDED_UNTIL_CANONICAL_BACKFILL');
});

test('Phase260F B0038754 after backfill excludes only adjustment with verified canonical replacement', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-DEBT-OPEN', 1329232, 0, { id: 'OPEN-B0038754', idempotencyKey: 'AR-DEBT-OPEN:SO-B0038754' }),
    ledger('AR-DEBT-ADJUSTMENT', 0, 150000, {
      id: 'ADJ-B0038754-150',
      sourceType: 'MANUAL_ADJUSTMENT',
      sourceId: 'MANUAL-CREDIT-B0038754',
      idempotencyKey: 'AR-DEBT-ADJUSTMENT:SO-B0038754:MANUAL-CREDIT-B0038754'
    }),
    ledger('AR-DEBT-PAYMENT', 0, 150000, {
      id: 'PAY-B0038754-150',
      sourceType: 'DEBT_RECEIPT',
      sourceId: 'DC-B0038754-150',
      receiptId: 'DC-B0038754-150',
      idempotencyKey: 'AR-DEBT-PAYMENT:DC-B0038754-150:SO-B0038754',
      metadata: {
        backfillPolicy: 'PHASE260F_CANONICAL_SOURCE_V1',
        backfillType: 'PAYMENT',
        replacesLegacyAdjustmentLedgerId: 'ADJ-B0038754-150',
        generatedFromConfirmedSource: true,
        evidenceHash: 'fixture-evidence'
      }
    }),
    ledger('AR-RECEIPT', 0, 1179232, {
      id: 'RECEIPT-B0038754-1179232',
      sourceType: 'DEBTCOLLECTION',
      sourceId: 'DC-B0038754-1179232',
      receiptId: 'DC-B0038754-1179232',
      idempotencyKey: 'AR-RECEIPT:DC-B0038754-1179232:SO-B0038754'
    })
  ], { status: 'all' });

  assert.equal(result.summary.totalDebit, 1329232);
  assert.equal(result.summary.totalCredit, 1329232);
  assert.equal(result.summary.totalDebt, 0);
  assert.equal(result.ledgers.some((row) => row.id === 'ADJ-B0038754-150'), false);
  const adjustment = result.allLedgers.find((row) => row.id === 'ADJ-B0038754-150');
  assert.equal(adjustment.projectionIncluded, false);
  assert.equal(adjustment.exclusionReason, 'CANONICAL_REPLACEMENT_VERIFIED');
  assert.equal(adjustment.replacedByLedgerId, 'PAY-B0038754-150');
});

test('Phase260F unresolved adjustment is included with warning instead of category-only exclusion', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-DEBT-OPEN', 100000, 0, { id: 'OPEN-UNRESOLVED', sourceId: 'SO-UNRESOLVED', sourceCode: 'B-UNRESOLVED', orderId: 'SO-UNRESOLVED', orderCode: 'B-UNRESOLVED' }),
    ledger('AR-DEBT-ADJUSTMENT', 0, 30000, {
      id: 'ADJ-UNRESOLVED',
      sourceType: '',
      sourceId: '',
      sourceCode: '',
      orderId: 'SO-UNRESOLVED',
      orderCode: 'B-UNRESOLVED',
      idempotencyKey: 'AR-DEBT-ADJUSTMENT:UNRESOLVED'
    })
  ], { status: 'all' });

  const adjustment = result.ledgers.find((row) => row.id === 'ADJ-UNRESOLVED');
  assert.equal(result.summary.totalDebt, 70000);
  assert.equal(adjustment.projectionStatus, 'UNRESOLVED');
  assert.equal(adjustment.warningCode, 'LEGACY_ADJUSTMENT_SOURCE_UNRESOLVED');
  assert.equal(result.orders.some((row) => row.hasUnresolvedProjection), true);
});

test('Phase260F duplicate/final-state adjustment is excluded only with explicit evidence classification', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-DEBT-OPEN', 100000, 0, { id: 'OPEN-DUP', sourceId: 'SO-DUP', sourceCode: 'B-DUP' }),
    ledger('AR-DEBT-ADJUSTMENT', 100000, 0, {
      id: 'ADJ-DUP',
      sourceType: 'REPAIR',
      sourceId: 'REPAIR-DUP',
      sourceCode: 'B-DUP',
      metadata: { classification: 'DUPLICATE_OPENING_ADJUSTMENT' }
    })
  ], { status: 'all' });

  assert.equal(result.summary.totalDebt, 100000);
  const adjustment = result.allLedgers.find((row) => row.id === 'ADJ-DUP');
  assert.equal(adjustment.projectionIncluded, false);
  assert.equal(adjustment.exclusionReason, 'DUPLICATE_OPENING_ADJUSTMENT');
});

test('Phase260F policy does not classify source by amount-only/date/name heuristic', () => {
  assert.equal(policyPrivate.hasImmutableSourceEvidence({ debit: 0, credit: 150000, customerName: 'Co Lan', date: '2026-07-18' }), false);
  const decision = classifyLegacyAdjustmentProjection({ category: 'AR-DEBT-ADJUSTMENT', debit: 0, credit: 150000 });
  assert.equal(decision.projectionStatus, 'UNRESOLVED');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/domain/ar/legacyAdjustmentProjectionPolicy.js'), 'utf8');
  assert.doesNotMatch(source, /credit\s*={2,3}\s*receipt|amount\s*={2,3}\s*receipt|createdAt.*createdAt|customerName.*customerName/);
});
