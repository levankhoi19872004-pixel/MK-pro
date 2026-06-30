'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildArSaleLedger, buildArSaleReversalLedger } = require('../src/domain/ar/arLedgerContract');
const { validateArLedgerContract, assertValidArLedgerContract, isCanonicalArDebtLedger } = require('../src/domain/ar/arLedgerValidator');
const { b0038423Order } = require('./helpers/phase79FakeModels');

test('confirmSalesOrderAR contract builder creates full canonical AR-SALE for B0038423/4501221', () => {
  const ledger = buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '1782778730341', now: '2026-06-29T10:00:00.000Z' });
  assert.equal(ledger.account, 'AR');
  assert.equal(ledger.category, 'AR-SALE');
  assert.equal(ledger.ledgerType, 'AR-SALE');
  assert.equal(ledger.entryType, 'normal');
  assert.equal(ledger.sourceType, 'salesOrder');
  assert.equal(ledger.sourceId, 'SO1782550380164673');
  assert.equal(ledger.sourceCode, 'B0038423');
  assert.equal(ledger.customerCode, '4501221');
  assert.equal(ledger.customerName, 'Chị Hương');
  assert.equal(ledger.salesStaffCode, '35095');
  assert.equal(ledger.deliveryStaffCode, 'ghth');
  assert.equal(ledger.masterOrderId, 'MO1782550618236269');
  assert.equal(ledger.masterOrderCode, 'DT1782550618236397');
  assert.equal(ledger.idempotencyKey, 'AR-SALE:salesOrder:SO1782550380164673');
  assert.equal(ledger.accountingStatus, 'confirmed');
  assert.equal(ledger.accountingConfirmed, true);
  assert.equal(ledger.debit, 10402373);
  assert.equal(ledger.credit, 0);
  assert.equal(ledger.direction, 'debit');
  assert.equal(ledger.amountField, 'debit');
  assert.equal(ledger.active, true);
  assert.equal(ledger.reversed, false);
  assert.doesNotThrow(() => assertValidArLedgerContract(ledger));
  assert.equal(isCanonicalArDebtLedger(ledger), true);
});

test('AR-SALE-REVERSAL contract is credit-only and references original ledger', () => {
  const original = buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '1' });
  const reversal = buildArSaleReversalLedger(original, { accountant: 'kt01', reason: 'test reverse', timestamp: '2' });
  assert.equal(reversal.category, 'AR-SALE-REVERSAL');
  assert.equal(reversal.ledgerType, 'AR-SALE-REVERSAL');
  assert.equal(reversal.entryType, 'reversal');
  assert.equal(reversal.reversedLedgerId, original.id);
  assert.equal(reversal.idempotencyKey, `AR-SALE-REVERSAL:salesOrder:${original.sourceId}:${original.id}`);
  assert.equal(reversal.debit, 0);
  assert.equal(reversal.credit, original.amount);
  assert.equal(reversal.direction, 'credit');
  assert.equal(reversal.amountField, 'credit');
  assert.equal(isCanonicalArDebtLedger(reversal), true);
});

test('validator rejects confirmed AR-SALE missing category/ledgerType/entryType and ACC id with REV batch', () => {
  const dirty = {
    account: 'AR',
    id: 'AR-SALE-B0038423-ACC-SO1782550380164673',
    code: 'AR-SALE-B0038423',
    accountingBatchId: 'REV-SO1782550380164673-1782778730341',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    sourceType: 'salesOrder',
    sourceId: 'SO1782550380164673',
    sourceCode: 'B0038423',
    customerCode: '4501221',
    debit: 10402373,
    credit: 0,
    amount: 10402373,
    direction: 'debit',
    amountField: 'debit',
    idempotencyKey: 'AR-SALE:salesOrder:SO1782550380164673'
  };
  const result = validateArLedgerContract(dirty);
  const codes = result.errors.map((item) => item.code);
  assert.equal(result.ok, false);
  assert.ok(codes.includes('DIRTY_LEDGER_MISSING_CATEGORY'));
  assert.ok(codes.includes('DIRTY_LEDGER_MISSING_LEDGER_TYPE'));
  assert.ok(codes.includes('DIRTY_LEDGER_MISSING_ENTRY_TYPE'));
  assert.ok(codes.includes('DIRTY_LEDGER_ACC_ID_REV_BATCH_MISMATCH'));
  assert.equal(isCanonicalArDebtLedger(dirty), false);
});
