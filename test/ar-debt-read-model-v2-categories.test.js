'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function ledger(category, amount, extra = {}) {
  const isCredit = ['AR-DEBT-PAYMENT', 'AR-RETURN', 'AR-RECEIPT', 'AR-RECEIPT-CASH', 'AR-RECEIPT-BANK', 'AR-REWARD-ALLOWANCE'].includes(category);
  return {
    id: `${category}-${extra.id || amount}`,
    code: `${category}-${extra.id || amount}`,
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType: category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'ORDER_PAYMENT_ALLOCATION',
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

test('AR debt read model v2 accepts orderPaymentAllocations detailed AR categories', () => {
  const result = arDebtReadModel.groupCanonicalLedgers([
    ledger('AR-DEBT-OPEN', 100000, { id: 'open' }),
    ledger('AR-DEBT-ADJUSTMENT', 20000, { id: 'adj' }),
    ledger('AR-SALE', 50552883, { id: 'sale' }),
    ledger('AR-REWARD-ALLOWANCE', 1855000, { id: 'reward' }),
    ledger('AR-RETURN', 238328, { id: 'return' }),
    ledger('AR-SALE-REVERSAL', 999999, { id: 'legacy-reversal' })
  ]);
  assert.equal(result.canonicalLedgers.length, 5);
  assert.deepEqual(result.canonicalLedgers.map((row) => row.category).sort(), [
    'AR-DEBT-ADJUSTMENT',
    'AR-DEBT-OPEN',
    'AR-RETURN',
    'AR-REWARD-ALLOWANCE',
    'AR-SALE'
  ]);
  assert.equal(result.debtOrders[0].remainingDebt, 48579555); // 100k + 20k + 50,552,883 - 1,855,000 - 238,328
});
