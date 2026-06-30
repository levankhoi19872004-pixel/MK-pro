'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const ArDebtOpenPostingService = require('../src/services/accounting/ArDebtOpenPostingService');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

function makeOrder() {
  return {
    id: 'SO1782830072433596',
    code: 'SO1782830072433596',
    customerCode: 'BBHOASON',
    customerName: 'Hoa Sơn',
    deliveryStatus: 'delivered',
    totalAmount: 1573635,
    cashAmount: 1000000,
    transferAmount: 125900,
    rewardAmount: 100000
  };
}

function makeReturnOrders() {
  return [
    { id: 'RO-SO1782830072433596', code: 'RO-SO1782830072433596', sourceOrderId: 'SO1782830072433596', totalReturnAmount: 314736, status: 'active' }
  ];
}

test('SO1782830072433596 regression final debt is 32.999 and not original minus return', () => {
  const order = makeOrder();
  const closeout = DeliveryCloseoutService.confirmCloseout(
    order,
    DeliveryCloseoutService.buildCloseout(order, makeReturnOrders(), [], { actor: 'KT' }),
    { actor: 'KT' }
  );

  assert.equal(closeout.originalAmount, 1573635);
  assert.equal(closeout.returnedAmount, 314736);
  assert.equal(closeout.cashAmount, 1000000);
  assert.equal(closeout.transferAmount, 125900);
  assert.equal(closeout.collectedAmount, 1125900);
  assert.equal(closeout.rewardAmount, 100000);
  assert.equal(closeout.offsetAmount, 100000);
  assert.equal(closeout.finalDebtAmount, 32999);
  assert.notEqual(closeout.finalDebtAmount, 1258899);
  assert.equal(closeout.originalAmount, closeout.returnedAmount + closeout.collectedAmount + closeout.offsetAmount + closeout.finalDebtAmount);

  const ledger = ArDebtOpenPostingService.buildDebtOpenLedger(order, closeout, { actor: 'KT' });
  assert.equal(ledger.category, 'AR-DEBT-OPEN');
  assert.equal(ledger.amount, 32999);
  assert.equal(ledger.debit, 32999);
  assert.equal(ledger.credit, 0);
  assert.equal(ledger.originalAmount, 1573635);
  assert.equal(ledger.returnedAmount, 314736);
  assert.equal(ledger.collectedAmount, 1125900);
  assert.equal(ledger.offsetAmount, 100000);
  assert.notEqual(ledger.category, 'AR-SALE');
  assert.notEqual(ledger.category, 'AR-RETURN');
  assert.notEqual(ledger.category, 'AR-RECEIPT');

  const readModel = arDebtReadModel.groupCanonicalLedgers([
    ledger,
    {
      id: 'legacy-ar-sale-so178283',
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
  assert.equal(readModel.debtOrders.length, 1);
  assert.equal(readModel.debtOrders[0].remainingDebt, 32999);
  assert.equal(readModel.debtOrders[0].arSale, 1573635);
  assert.equal(readModel.debtOrders[0].paidAmount, 1125900);
  assert.equal(readModel.debtOrders[0].returnAmount, 314736);
  assert.equal(readModel.debtOrders[0].offsetAmount, 100000);
});
