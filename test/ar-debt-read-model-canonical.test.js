'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { groupCanonicalLedgers } = require('../src/services/arDebtReadModel.service');
const { b0038423Order } = require('./helpers/phase79FakeModels');

function debtOpen(overrides = {}) {
  const order = b0038423Order(overrides.order || {});
  const amount = Number(overrides.amount ?? order.debtAmount ?? order.remainingDebt ?? order.totalAmount ?? 0);
  const sourceId = overrides.sourceId || order.id;
  const sourceCode = overrides.sourceCode || order.code;
  return {
    account: 'AR',
    category: 'AR-DEBT-OPEN',
    ledgerType: 'AR-DEBT-OPEN',
    entryType: 'normal',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT',
    sourceId,
    sourceCode,
    orderId: sourceId,
    orderCode: sourceCode,
    salesOrderId: sourceId,
    salesOrderCode: sourceCode,
    customerCode: order.customerCode,
    customerName: order.customerName,
    salesStaffCode: order.salesStaffCode,
    salesStaffName: order.salesStaffName,
    deliveryStaffCode: order.deliveryStaffCode,
    deliveryStaffName: order.deliveryStaffName,
    debit: amount,
    credit: 0,
    amount,
    direction: 'debit',
    amountField: 'debit',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: `CLOSEOUT-${sourceId}`,
    id: `AR-DEBT-OPEN-${sourceCode}`,
    code: `AR-DEBT-OPEN-${sourceCode}`,
    idempotencyKey: `AR-DEBT-OPEN:${sourceId}`,
    date: '2026-06-30',
    ...overrides
  };
}

function debtAdjustment(base, amount, side = 'credit', suffix = '1') {
  return {
    ...base,
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION',
    debit: side === 'debit' ? amount : 0,
    credit: side === 'credit' ? amount : 0,
    amount,
    direction: side,
    amountField: side,
    id: `AR-DEBT-ADJUSTMENT-${base.sourceCode}-${suffix}`,
    code: `AR-DEBT-ADJUSTMENT-${base.sourceCode}-${suffix}`,
    idempotencyKey: `AR-DEBT-ADJUSTMENT:${base.sourceId}:${suffix}`
  };
}

test('AR-DEBT-OPEN confirmed appears in Phase87 debt read model and dirty ledgers are rejected', () => {
  const open = debtOpen({ amount: 10402373 });
  const dirty = { ...open, id: 'DIRTY', code: 'AR-DEBT-OPEN-DIRTY', category: '', ledgerType: '', entryType: '' };
  const result = groupCanonicalLedgers([open, dirty], { rebuiltAt: '2026-06-30T10:00:00.000Z' });
  assert.equal(result.canonicalLedgers.length, 1);
  assert.equal(result.rejectedLedgers.length, 1);
  assert.equal(result.debtOrders.length, 1);
  assert.equal(result.debtOrders[0].sourceId, 'SO1782550380164673');
  assert.equal(result.debtOrders[0].remainingDebt, 10402373);
  assert.equal(result.debtCustomers.length, 1);
  assert.equal(result.debtCustomers[0].customerCode, '4501221');
  assert.equal(result.debtCustomers[0].remainingDebt, 10402373);
});

test('Phase87 rebuild read model matches AR-DEBT-OPEN plus AR-DEBT-ADJUSTMENT aggregate', () => {
  const open = debtOpen({ amount: 10402373 });
  const adjustment = debtAdjustment(open, 10402373, 'credit', 'close');
  const result = groupCanonicalLedgers([open, adjustment]);
  assert.equal(result.rejectedLedgers.length, 0);
  assert.equal(result.debtOrders[0].debit, open.debit);
  assert.equal(result.debtOrders[0].credit, adjustment.credit);
  assert.equal(result.debtOrders[0].remainingDebt, 0);
  assert.equal(result.debtCustomers[0].remainingDebt, 0);
});


test('legacy AR-SALE reversal is excluded from Phase87 read model; replacement AR-DEBT-OPEN remains visible', () => {
  const replacement = debtOpen({ amount: 10402373 });
  const legacyReversal = {
    ...replacement,
    category: 'AR-SALE-REVERSAL',
    ledgerType: 'AR-SALE-REVERSAL',
    entryType: 'reversal',
    sourceType: 'salesOrder',
    debit: 0,
    credit: 10402373,
    direction: 'credit',
    amountField: 'credit',
    id: 'AR-SALE-REVERSAL-LEGACY',
    code: 'AR-SALE-REVERSAL-LEGACY',
    idempotencyKey: 'AR-SALE-REVERSAL:salesOrder:SO1782550380164673:OLD',
    reversedLedgerId: 'OLD',
    accountingBatchId: 'REV-SO1782550380164673-OLD'
  };
  const result = groupCanonicalLedgers([legacyReversal, replacement]);
  assert.equal(result.canonicalLedgers.length, 1);
  assert.equal(result.rejectedLedgers.length, 1);
  assert.equal(result.rejectedLedgers[0].validation.category, 'AR-SALE-REVERSAL');
  assert.equal(result.debtOrders[0].remainingDebt, 10402373);
  assert.equal(result.debtCustomers[0].remainingDebt, 10402373);
});
