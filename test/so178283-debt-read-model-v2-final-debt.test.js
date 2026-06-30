'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

test('SO178283 debt read model v2 exposes final debt and operational breakdown from AR-DEBT-OPEN', () => {
  const result = arDebtReadModel.groupCanonicalLedgers([
    {
      id: 'AR-DEBT-OPEN-SO1782830072433596',
      code: 'AR-DEBT-OPEN-SO1782830072433596',
      account: 'AR',
      category: 'AR-DEBT-OPEN',
      ledgerType: 'AR-DEBT-OPEN',
      entryType: 'normal',
      sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT',
      sourceId: 'SO1782830072433596',
      sourceCode: 'SO1782830072433596',
      customerCode: 'BBHOASON',
      customerName: 'Hoa Sơn',
      debit: 32999,
      credit: 0,
      amount: 32999,
      direction: 'debit',
      amountField: 'debit',
      active: true,
      reversed: false,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      idempotencyKey: 'AR-DEBT-OPEN:SO1782830072433596',
      originalAmount: 1573635,
      returnedAmount: 314736,
      cashAmount: 1000000,
      transferAmount: 125900,
      bankAmount: 125900,
      collectedAmount: 1125900,
      rewardAmount: 100000,
      offsetAmount: 100000,
      finalDebtAmount: 32999
    },
    {
      id: 'AR-SALE-SO1782830072433596',
      code: 'AR-SALE-SO1782830072433596',
      account: 'AR',
      category: 'AR-SALE',
      ledgerType: 'AR-SALE',
      entryType: 'normal',
      sourceType: 'SALES_ORDER',
      sourceId: 'SO1782830072433596',
      sourceCode: 'SO1782830072433596',
      customerCode: 'BBHOASON',
      debit: 1258899,
      credit: 0,
      amount: 1258899,
      direction: 'debit',
      amountField: 'debit',
      active: true,
      reversed: false,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      idempotencyKey: 'AR-SALE:SO1782830072433596'
    }
  ]);
  const row = result.debtOrders[0];
  assert.equal(row.remainingDebt, 32999);
  assert.equal(row.arSale, 1573635);
  assert.equal(row.paidAmount, 1125900);
  assert.equal(row.returnAmount, 314736);
  assert.equal(row.rewardAmount, 100000);
  assert.equal(row.offsetAmount, 100000);
});
