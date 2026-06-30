'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function paymentWithoutCredit() {
  return {
    id: 'AR-DEBT-PAYMENT-NO-CREDIT',
    code: 'AR-DEBT-PAYMENT-NO-CREDIT',
    account: 'AR',
    category: 'AR-DEBT-PAYMENT',
    ledgerType: 'AR-DEBT-PAYMENT',
    entryType: 'normal',
    sourceType: 'CUSTOMER_DEBT_PAYMENT',
    sourceId: 'SO-NO-CREDIT',
    sourceCode: 'B-NO-CREDIT',
    customerCode: 'C1',
    idempotencyKey: 'AR-DEBT-PAYMENT:PAY-NO-CREDIT',
    debit: 0,
    amount: 100000,
    direction: 'credit',
    amountField: 'credit',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed'
  };
}

test('strict AR read model rejects AR-DEBT-PAYMENT missing credit even when amount exists', () => {
  const result = arDebtReadModel.groupCanonicalLedgers([paymentWithoutCredit()]);
  assert.equal(result.canonicalLedgers.length, 0);
  assert.equal(result.debtOrders.length, 0);
  assert.equal(result.rejectedLedgers.length, 1);
  assert.ok(result.rejectedLedgers[0].validation.errors.some((item) => item.field === 'credit'));
});
