'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const debtNew = require('../src/services/v2/debtNew.service');
const { buildDebtBusinessEventIdentity } = require('../src/domain/ar/debtBusinessEventIdentity');
const { resolveDebtLedgerOwnership } = require('../src/domain/ar/DebtLedgerOwnershipResolver');

function sideFor(category, debit, credit) {
  if (debit > 0) return 'debit';
  if (credit > 0) return 'credit';
  return category === 'AR-DEBT-ADJUSTMENT' ? 'credit' : 'debit';
}

function ledger(category, amount, overrides = {}) {
  const debit = overrides.debit ?? (overrides.side === 'debit' ? amount : 0);
  const credit = overrides.credit ?? (overrides.side === 'credit' ? amount : 0);
  const side = sideFor(category, debit, credit);
  const orderId = overrides.orderId || 'SO-P260D-1';
  const orderCode = overrides.orderCode || 'B-P260D-1';
  const id = overrides.id || `${category}-${orderCode}-${amount}-${side}`;
  return {
    id,
    code: overrides.code || id,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    active: true,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'confirmed',
    sourceType: overrides.sourceType || (category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'ORDER_PAYMENT_ALLOCATION'),
    sourceId: overrides.sourceId || orderId,
    sourceCode: overrides.sourceCode || orderCode,
    sourceVersion: overrides.sourceVersion,
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    customerCode: overrides.customerCode || 'C-P260D',
    customerName: overrides.customerName || 'Customer P260D',
    debit,
    credit,
    amount: Math.max(debit, credit),
    direction: side,
    amountField: side,
    idempotencyKey: overrides.idempotencyKey || defaultIdempotency(category, id, orderId),
    receiptId: overrides.receiptId,
    allocationId: overrides.allocationId,
    returnOrderId: overrides.returnOrderId,
    correctionId: overrides.correctionId,
    originalLedgerId: overrides.originalLedgerId,
    metadata: overrides.metadata || {}
  };
}

function defaultIdempotency(category, id, orderId) {
  if (category === 'AR-DEBT-OPEN') return `AR-DEBT-OPEN:${orderId}`;
  if (category === 'AR-DEBT-PAYMENT') return `AR-DEBT-PAYMENT:${id}`;
  if (category === 'AR-DEBT-ADJUSTMENT') return `AR-DEBT-ADJUSTMENT:${orderId}:${id}`;
  return `${category}:${id}`;
}

test('Phase260D identity builder does not use amount or createdAt', () => {
  const a = buildDebtBusinessEventIdentity(ledger('AR-DEBT-OPEN', 1000, { createdAt: '2026-07-01' }));
  const b = buildDebtBusinessEventIdentity(ledger('AR-DEBT-OPEN', 9999, { createdAt: '2026-07-02' }));
  assert.equal(a.businessEventIdentity, b.businessEventIdentity);
  assert.equal(a.code, 'OK');
});

test('Phase260D mixed opening family selects AR-DEBT-OPEN and shadows AR-SALE', () => {
  const rows = [
    ledger('AR-SALE', 100000, { side: 'debit', id: 'AR-SALE-SO1', sourceType: 'ORDER_PAYMENT_ALLOCATION' }),
    ledger('AR-DEBT-OPEN', 100000, { side: 'debit', id: 'AR-DEBT-OPEN-SO1' })
  ];
  const result = debtNew.groupLedgers(rows, { status: 'all' });
  assert.deepEqual(result.ledgers.map((row) => row.category), ['AR-DEBT-OPEN']);
  assert.deepEqual(result.shadowedLedgers.map((row) => row.category), ['AR-SALE']);
  assert.equal(result.summary.totalDebt, 100000);
  assert.equal(result.summary.shadowedLedgerCount, 1);
});

test('Phase260D mixed payment family selects AR-DEBT-PAYMENT and shadows AR-RECEIPT', () => {
  const rows = [
    ledger('AR-DEBT-OPEN', 100000, { side: 'debit', id: 'OPEN-PAY' }),
    ledger('AR-RECEIPT', 40000, { side: 'credit', id: 'AR-RECEIPT-DC1', sourceType: 'DEBTCOLLECTION', sourceId: 'DC1', receiptId: 'DC1' }),
    ledger('AR-DEBT-PAYMENT', 40000, { side: 'credit', id: 'AR-DEBT-PAYMENT-DC1', sourceType: 'DEBT_RECEIPT', sourceId: 'DC1', receiptId: 'DC1' })
  ];
  const result = debtNew.groupLedgers(rows, { status: 'all' });
  assert.equal(result.summary.totalDebt, 60000);
  assert.deepEqual(result.shadowedLedgers.map((row) => row.category), ['AR-RECEIPT']);
});

test('Phase260D same amount but distinct immutable payment source is not deduplicated', () => {
  const rows = [
    ledger('AR-DEBT-OPEN', 100000, { side: 'debit', id: 'OPEN-DISTINCT' }),
    ledger('AR-DEBT-PAYMENT', 20000, { side: 'credit', id: 'PAY-1', sourceId: 'DC1', receiptId: 'DC1' }),
    ledger('AR-DEBT-PAYMENT', 20000, { side: 'credit', id: 'PAY-2', sourceId: 'DC2', receiptId: 'DC2' })
  ];
  const result = debtNew.groupLedgers(rows, { status: 'all' });
  assert.equal(result.summary.totalDebt, 60000);
  assert.equal(result.summary.shadowedLedgerCount, 0);
  assert.equal(result.summary.duplicateLedgerCount, 0);
});

test('Phase260D/260E return effect keeps AR-RETURN and excludes retired correction adjustment', () => {
  const rows = [
    ledger('AR-DEBT-OPEN', 100000, { side: 'debit', id: 'OPEN-RETURN' }),
    ledger('AR-RETURN', 15000, { side: 'credit', id: 'AR-RETURN-RO1', sourceType: 'RETURN_ORDER', sourceId: 'RO1', returnOrderId: 'RO1' }),
    ledger('AR-DEBT-ADJUSTMENT', 15000, { side: 'credit', id: 'ADJ-RO1', sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', sourceId: 'DCOC-RO1', returnOrderId: 'RO1', correctionId: 'DCOC-RO1' })
  ];
  const result = debtNew.groupLedgers(rows, { status: 'all' });
  assert.equal(result.summary.totalDebt, 85000);
  assert.deepEqual(result.ledgers.map((row) => row.category).sort(), ['AR-DEBT-OPEN', 'AR-RETURN'].sort());
  assert.equal(result.ledgers.some((row) => row.category === 'AR-DEBT-ADJUSTMENT'), false);
});

test('Phase260F credit adjustment remains document credit and projects as fallback when no replacement exists', () => {
  const adjustment = ledger('AR-DEBT-ADJUSTMENT', 92211, {
    side: 'credit',
    id: 'ADJ-CREDIT-B0039602',
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    sourceId: 'DCOC-B0039602',
    correctionId: 'DCOC-B0039602'
  });
  const ownership = resolveDebtLedgerOwnership([adjustment]);
  assert.equal(ownership.selectedEntries.length, 1);
  assert.equal(ownership.selectedEntries[0].debit, 0);
  assert.equal(ownership.selectedEntries[0].credit, 92211);
  assert.equal(ownership.selectedEntries[0].ownershipEffect, -92211);
  assert.equal(ownership.selectedEntries[0].ownershipClassification, 'SELECTED');
});
