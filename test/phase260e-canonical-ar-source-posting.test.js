'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const debtNew = require('../src/services/v2/debtNew.service');
const ArDebtAdjustmentPostingService = require('../src/services/accounting/ArDebtAdjustmentPostingService');
const manualDebtPostingService = require('../src/services/accounting/manualDebtPostingService');
const { buildExternalDebtLedgerEntry } = require('../src/services/accounting/externalDebtArPostingService');
const { CATEGORY_EFFECT, ACTIVE_DEBT_READ_MODEL_CATEGORIES } = require('../src/domain/ar/arDebtCategoryRegistry');
const { resolveDebtLedgerOwnership } = require('../src/domain/ar/DebtLedgerOwnershipResolver');

function ledger(category, debit, credit, overrides = {}) {
  const amount = Math.max(debit, credit);
  const side = debit > 0 ? 'debit' : 'credit';
  return {
    id: overrides.id || `${category}-${amount}`,
    code: overrides.code || `${category}-${amount}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'confirmed',
    sourceType: overrides.sourceType || (category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'ORDER_PAYMENT_ALLOCATION'),
    sourceId: overrides.sourceId || 'SO-P260E',
    sourceCode: overrides.sourceCode || 'B-P260E',
    orderId: overrides.orderId || 'SO-P260E',
    orderCode: overrides.orderCode || 'B-P260E',
    salesOrderId: overrides.orderId || 'SO-P260E',
    salesOrderCode: overrides.orderCode || 'B-P260E',
    customerCode: overrides.customerCode || 'C-P260E',
    customerName: overrides.customerName || 'Customer P260E',
    debit,
    credit,
    amount,
    direction: side,
    amountField: side,
    correctionId: overrides.correctionId,
    idempotencyKey: overrides.idempotencyKey || `${category}:P260E:${overrides.sourceId || 'SO-P260E'}`
  };
}

test('Phase260E category direction contract is debit-credit explicit', () => {
  assert.equal(CATEGORY_EFFECT['AR-DEBT-OPEN'], 'debit');
  assert.equal(CATEGORY_EFFECT['AR-SALE'], 'debit');
  assert.equal(CATEGORY_EFFECT['AR-DEBT-PAYMENT'], 'credit');
  assert.equal(CATEGORY_EFFECT['AR-RECEIPT'], 'credit');
  assert.equal(CATEGORY_EFFECT['AR-RECEIPT-CASH'], 'credit');
  assert.equal(CATEGORY_EFFECT['AR-RECEIPT-BANK'], 'credit');
  assert.equal(CATEGORY_EFFECT['AR-RETURN'], 'credit');
  assert.equal(CATEGORY_EFFECT['AR-EXTERNAL-DEBT'], 'debit');
  assert.equal(CATEGORY_EFFECT['AR-RECEIPT-REVERSAL'], 'debit');
  assert.equal(CATEGORY_EFFECT['AR-SALE-REVERSAL'], 'credit');
});

test('Phase260E retires AR-DEBT-ADJUSTMENT posting facade', async () => {
  const result = await ArDebtAdjustmentPostingService.postAdjustment({}, { deltaDebt: 1000 }, {});
  assert.equal(result.posted, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED');
  await assert.rejects(
    () => ArDebtAdjustmentPostingService.postAdjustment({}, { deltaDebt: 1000, throwOnRetired: true }, {}),
    { code: 'AR_DEBT_ADJUSTMENT_POSTING_RETIRED' }
  );
});

test('Phase260F legacy adjustment remains projectable until canonical replacement is verified', () => {
  assert.equal(ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes('AR-DEBT-ADJUSTMENT'), true);
  const result = debtNew.groupLedgers([
    ledger('AR-DEBT-OPEN', 100000, 0, { id: 'OPEN-1', idempotencyKey: 'AR-DEBT-OPEN:SO-P260E' }),
    ledger('AR-DEBT-ADJUSTMENT', 0, 25000, { id: 'ADJ-1', sourceType: 'DELIVERY_CLOSEOUT_CORRECTION', correctionId: 'DCOC-P260E-1', idempotencyKey: 'AR-DEBT-ADJUSTMENT:SO-P260E:ADJ-1' })
  ], { status: 'all' });
  assert.equal(result.summary.totalDebt, 75000);
  const adjustment = result.ledgers.find((row) => row.category === 'AR-DEBT-ADJUSTMENT');
  assert.equal(adjustment.legacyFallback, true);
  assert.equal(adjustment.warningCode, 'LEGACY_ADJUSTMENT_INCLUDED_UNTIL_CANONICAL_BACKFILL');
});

test('Phase260E external debt participates as customer-scope debit', () => {
  const result = debtNew.groupLedgers([
    ledger('AR-EXTERNAL-DEBT', 330000, 0, {
      id: 'EXT-1',
      sourceType: 'externalDebt',
      sourceId: 'EXT-1',
      sourceCode: 'EXT-1',
      idempotencyKey: 'AR-EXTERNAL-DEBT:EXT-1'
    })
  ], { status: 'all' });
  assert.equal(result.summary.totalDebt, 330000);
  assert.equal(result.ledgers[0].category, 'AR-EXTERNAL-DEBT');
});

test('Phase260E manual debt builds AR-EXTERNAL-DEBT, not adjustment', () => {
  const normalized = manualDebtPostingService.normalizeManualDebtInput({
    customerCode: 'C-P260E',
    amount: 120000,
    postingDate: '2026-07-18',
    note: 'manual external debt'
  });
  const ledgerRow = manualDebtPostingService.buildManualDebtLedger({}, {
    normalized,
    source: manualDebtPostingService.buildManualDebtSource(normalized),
    customer: { id: 'C-P260E', code: 'C-P260E', name: 'Customer' }
  });
  assert.equal(ledgerRow.category, 'AR-EXTERNAL-DEBT');
  assert.equal(ledgerRow.debit, 120000);
  assert.equal(ledgerRow.credit, 0);
});

test('Phase260E external debt writer builds validator-ready debit document', () => {
  const row = buildExternalDebtLedgerEntry({
    sourceType: 'externalDebt',
    sourceId: 'EXT-2',
    sourceCode: 'EXT-2',
    customerId: 'C2',
    customerCode: 'C2',
    customerName: 'Customer 2',
    amount: 450000,
    date: '2026-07-18',
    reason: 'external debt',
    createdBy: 'accountant'
  });
  assert.equal(row.category, 'AR-EXTERNAL-DEBT');
  assert.equal(row.entryType, 'normal');
  assert.equal(row.debit, 450000);
  assert.equal(row.credit, 0);
});

test('Phase260E history movement uses document debit and credit without category inference', () => {
  const movement = debtNew._private.movementFromLedger(ledger('AR-RETURN', 0, 92211, {
    id: 'RETURN-1',
    sourceType: 'RETURN_ORDER',
    sourceId: 'RO-1',
    idempotencyKey: 'AR-RETURN:RO-1'
  }), { includedIds: new Set(['RETURN-1']) });
  assert.equal(movement.debit, 0);
  assert.equal(movement.credit, 92211);
  assert.equal(movement.netEffect, -92211);
  assert.equal(movement.projectionIncluded, true);
});

test('Phase260E frontend has no payment-name direction inference', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/92-debt-new.js'), 'utf8');
  assert.doesNotMatch(source, /category\.indexOf\('PAYMENT'\)|category\.includes\('PAYMENT'\)/);
  assert.doesNotMatch(source, /AR-DEBT-ADJUSTMENT canonical/);
  assert.match(source, /row\.debit/);
  assert.match(source, /row\.credit/);
});
