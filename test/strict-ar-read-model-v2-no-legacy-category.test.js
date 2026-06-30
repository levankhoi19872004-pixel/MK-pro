'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function ledger(category, side, amount, extra = {}) {
  const debit = side === 'debit' ? amount : 0;
  const credit = side === 'credit' ? amount : 0;
  return {
    id: `${category}-${extra.id || amount}`,
    code: `${category}-${extra.id || amount}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType: category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'SALES_ORDER_DELIVERY_CLOSEOUT_CORRECTION',
    sourceId: 'SO-STRICT-RM',
    sourceCode: 'B-STRICT-RM',
    customerCode: 'C-STRICT',
    customerName: 'KH STRICT',
    idempotencyKey: `${category}:SO-STRICT-RM:${extra.id || amount}`.replace('AR-DEBT-OPEN:SO-STRICT-RM:', 'AR-DEBT-OPEN:'),
    debit,
    credit,
    amount,
    direction: side,
    amountField: side,
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed'
  };
}

test('strict AR read model v2 rejects legacy AR-SALE/AR-RETURN/AR-RECEIPT categories even when fields are complete', () => {
  const result = arDebtReadModel.groupCanonicalLedgers([
    ledger('AR-DEBT-OPEN', 'debit', 100000, { id: 'open' }),
    ledger('AR-DEBT-PAYMENT', 'credit', 10000, { id: 'pay' }),
    ledger('AR-SALE', 'debit', 999999, { id: 'sale' }),
    ledger('AR-RETURN', 'credit', 888888, { id: 'return' }),
    ledger('AR-RECEIPT', 'credit', 777777, { id: 'receipt' })
  ]);
  assert.deepEqual(result.canonicalLedgers.map((row) => row.category).sort(), ['AR-DEBT-OPEN', 'AR-DEBT-PAYMENT']);
  assert.equal(result.debtOrders[0].remainingDebt, 90000);
  assert.equal(result.rejectedLedgers.length, 3);
});
