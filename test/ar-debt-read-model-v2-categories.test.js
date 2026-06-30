'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function ledger(category, amount, extra = {}) {
  const isCredit = ['AR-DEBT-PAYMENT', 'AR-RETURN', 'AR-RECEIPT'].includes(category);
  return {
    id: `${category}-${extra.id || amount}`,
    code: `${category}-${extra.id || amount}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType: category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION',
    sourceId: 'SO-RM',
    sourceCode: 'B-RM',
    customerCode: 'C-RM',
    customerName: 'KH RM',
    idempotencyKey: `${category}:SO-RM:${extra.id || amount}`.replace('AR-DEBT-OPEN:SO-RM:', 'AR-DEBT-OPEN:'),
    debit: isCredit ? 0 : amount,
    credit: isCredit ? amount : 0,
    amount,
    direction: isCredit ? 'credit' : 'debit',
    amountField: isCredit ? 'credit' : 'debit',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed'
  };
}

test('AR debt read model v2 only accepts AR-DEBT-* categories', () => {
  const result = arDebtReadModel.groupCanonicalLedgers([
    ledger('AR-DEBT-OPEN', 100000, { id: 'open' }),
    ledger('AR-DEBT-ADJUSTMENT', 20000, { id: 'adj' }),
    ledger('AR-SALE', 999999, { id: 'legacy-sale' }),
    ledger('AR-RETURN', 999999, { id: 'legacy-return' })
  ]);
  assert.equal(result.canonicalLedgers.length, 2);
  assert.deepEqual(result.canonicalLedgers.map((row) => row.category).sort(), ['AR-DEBT-ADJUSTMENT', 'AR-DEBT-OPEN']);
  assert.equal(result.debtOrders[0].remainingDebt, 120000);
});
