'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const debtNewService = require('../src/services/v2/debtNew.service');
const deliveryTodayNewService = require('../src/services/v2/deliveryTodayNew.service');

test('Debt New read model only counts AR-DEBT-* categories and excludes legacy AR categories', () => {
  const rows = [
    { account: 'AR', category: 'AR-DEBT-OPEN', ledgerType: 'AR-DEBT-OPEN', debit: 10000, credit: 0, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true },
    { account: 'AR', category: 'AR-DEBT-ADJUSTMENT', ledgerType: 'AR-DEBT-ADJUSTMENT', debit: 0, credit: 2000, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true },
    { account: 'AR', category: 'AR-SALE', ledgerType: 'AR-SALE', debit: 999999, credit: 0, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true },
    { account: 'AR', category: 'AR-RETURN', ledgerType: 'AR-RETURN', debit: 0, credit: 999999, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true }
  ];
  const result = debtNewService.groupLedgers(rows, { status: 'all' });
  assert.equal(result.ledgers.length, 2);
  assert.deepEqual(result.ledgers.map((row) => row.category).sort(), ['AR-DEBT-ADJUSTMENT', 'AR-DEBT-OPEN']);
  assert.equal(result.summary.totalDebt, 8000);
  assert.equal(result.customers[0].debt, 8000);
});

test('Delivery Today New summarizes original, returnOrders, collected and final debt without mutating confirmed closeout', () => {
  const order = {
    id: 'SO1',
    code: 'SO1',
    customerCode: 'KH1',
    customerName: 'Khach 1',
    totalAmount: 1000000,
    paidAmount: 300000,
    deliveryCloseout: {
      status: 'accounting_confirmed',
      finalDebtAmount: 600000,
      version: 1,
      versions: [{ status: 'accounting_confirmed', version: 1 }]
    }
  };
  const returnsByKey = new Map([['SO1', [{ id: 'RO1', amount: 100000 }]]]);
  const row = deliveryTodayNewService.summarizeOrder(order, returnsByKey);
  assert.equal(row.originalAmount, 1000000);
  assert.equal(row.returnedAmount, 100000);
  assert.equal(row.collectedAmount, 300000);
  assert.equal(row.finalDebtAmount, 600000);
  assert.equal(row.accountingConfirmed, true);
  assert.equal(row.correctionRequired, true);
});
