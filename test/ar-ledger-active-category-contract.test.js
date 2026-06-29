'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isActiveLedgerDoc,
  normalizeArCategory
} = require('../src/utils/arLedgerStatus.util');
const {
  arEntryBalanceEffect,
  arBalance,
  effectiveArDebit,
  effectiveArCredit
} = require('../src/utils/arLedger.util');
const { validateArLedgerEntry } = require('../src/utils/arLedgerValidation.util');
const { buildCustomerDebtReadModelFromLedgers } = require('../src/services/accounting/arCustomerDebtReadModel.service');

function baseLedger(overrides = {}) {
  return {
    account: 'AR',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    tenantId: '',
    customerCode: '4501256',
    customerName: 'Chị Sen',
    orderId: 'SO178255038016695',
    orderCode: 'B0038424',
    salesOrderId: 'SO178255038016695',
    salesOrderCode: 'B0038424',
    date: '2026-06-29',
    debit: 0,
    credit: 0,
    amount: 0,
    ...overrides
  };
}

test('AR-RETURN-REVERSAL is a business debit ledger and remains active when posted/confirmed', () => {
  const reversal = baseLedger({
    _id: 'return-reversal',
    id: 'AR-RETURN-REVERSAL-RO-B0038424',
    code: 'AR-RETURN-REVERSAL-RO-B0038424',
    category: 'AR-RETURN-REVERSAL',
    ledgerType: 'AR-RETURN-REVERSAL',
    type: 'ar_return_reversal',
    debit: 276632,
    amount: 276632,
    direction: 'debit',
    returnOrderId: 'RO-B0038424',
    idempotencyKey: 'AR-RETURN-REVERSAL:RO-B0038424'
  });

  assert.equal(normalizeArCategory(reversal), 'AR-RETURN-REVERSAL');
  assert.equal(isActiveLedgerDoc(reversal, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] }), true);
  assert.equal(effectiveArDebit(reversal), 276632);
  assert.equal(effectiveArCredit(reversal), 0);
  assert.equal(arEntryBalanceEffect(reversal), 276632);
  assert.equal(arBalance([reversal], ['SO178255038016695']), 276632);
});

test('AR-RETURN corruption with REV marker is still flagged and not treated as business reversal', () => {
  const invalidReturn = baseLedger({
    id: 'AR-RETURN-REV-RO-B0038424',
    code: 'AR-RETURN-REV-RO-B0038424',
    category: 'AR-RETURN',
    ledgerType: 'AR-RETURN',
    type: 'ar_return',
    debit: 276632,
    amount: 276632,
    direction: 'credit'
  });

  assert.equal(normalizeArCategory(invalidReturn), 'AR-RETURN');
  const result = validateArLedgerEntry(invalidReturn);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(result.ok, false);
  assert.equal(codes.has('AR_RETURN_DEBIT_POSITIVE'), true);
  assert.equal(codes.has('AR_RETURN_CODE_CONTAINS_REV'), true);
  assert.equal(codes.has('DEBIT_DIRECTION_CONFLICT'), true);
});

test('technical reversed or voided ledgers remain inactive', () => {
  const technicalReversed = baseLedger({
    category: 'AR-RETURN',
    status: 'reversed',
    accountingStatus: 'voided',
    accountingConfirmed: false,
    credit: 276632,
    amount: 276632,
    direction: 'credit'
  });

  assert.equal(isActiveLedgerDoc(technicalReversed), false);
  assert.equal(arBalance([technicalReversed], ['SO178255038016695']), 0);
  assert.equal(isActiveLedgerDoc(baseLedger({ status: 'voided' })), false);
  assert.equal(isActiveLedgerDoc(baseLedger({ status: 'superseded' })), false);
});

test('debt read model includes AR-RETURN-REVERSAL as debit net impact', () => {
  const rows = [
    baseLedger({
      _id: 'sale',
      id: 'AR-SALE-B0038424',
      code: 'AR-SALE-B0038424',
      category: 'AR-SALE',
      ledgerType: 'AR-SALE',
      type: 'ar_sale',
      debit: 5141521,
      amount: 5141521,
      direction: 'debit'
    }),
    baseLedger({
      _id: 'receipt',
      id: 'AR-RECEIPT-B0038424',
      code: 'AR-RECEIPT-B0038424',
      category: 'AR-RECEIPT',
      ledgerType: 'AR-RECEIPT',
      type: 'ar_receipt',
      credit: 4864000,
      amount: 4864000,
      direction: 'credit'
    }),
    baseLedger({
      _id: 'return',
      id: 'AR-RETURN-RO-B0038424',
      code: 'AR-RETURN-RO-B0038424',
      category: 'AR-RETURN',
      ledgerType: 'AR-RETURN',
      type: 'ar_return',
      credit: 276632,
      amount: 276632,
      direction: 'credit',
      returnOrderId: 'RO-B0038424',
      sourceOrderId: 'SO178255038016695',
      sourceOrderCode: 'B0038424'
    }),
    baseLedger({
      _id: 'return-reversal',
      id: 'AR-RETURN-REVERSAL-RO-B0038424',
      code: 'AR-RETURN-REVERSAL-RO-B0038424',
      category: 'AR-RETURN-REVERSAL',
      ledgerType: 'AR-RETURN-REVERSAL',
      type: 'ar_return_reversal',
      debit: 276632,
      amount: 276632,
      direction: 'debit',
      returnOrderId: 'RO-B0038424',
      sourceOrderId: 'SO178255038016695',
      sourceOrderCode: 'B0038424'
    })
  ];

  const report = buildCustomerDebtReadModelFromLedgers(rows, { status: 'all', q: '4501256' }, { today: '2026-06-29' });
  assert.equal(report.orders.length, 1);
  const order = report.orders[0];
  assert.equal(order.totalDebit, 5418153);
  assert.equal(order.totalCredit, 5140632);
  assert.equal(order.remainingDebt, 277521);
  assert.equal(order.returnAmount, 276632);
  assert.equal(order.returnReversalAmount, 276632);
});
