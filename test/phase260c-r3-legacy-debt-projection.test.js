'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projector = require('../src/services/accounting/LegacyDebtProjector');
const arCustomerReadModel = require('../src/services/accounting/arCustomerDebtReadModel.service');
const debtNew = require('../src/services/v2/debtNew.service');

function ledger(category, orderCode, customerCode, debit, credit, extra = {}) {
  const side = debit > 0 ? 'debit' : 'credit';
  const sourceType = extra.sourceType || (category === 'AR-DEBT-OPEN' ? 'SALES_ORDER_DELIVERY_CLOSEOUT' : 'TEST');
  return {
    id: `${category}-${orderCode}-${debit}-${credit}-${Math.random()}`,
    code: `${category}-${orderCode}`,
    account: 'AR',
    category,
    ledgerType: category,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'confirmed',
    active: true,
    entryType: 'normal',
    customerCode,
    customerName: extra.customerName || 'Customer',
    orderId: orderCode,
    orderCode,
    salesOrderId: orderCode,
    salesOrderCode: orderCode,
    date: extra.date || '2026-07-15',
    debit,
    credit,
    amount: debit || credit,
    direction: side,
    amountField: side,
    idempotencyKey: `${category}:${orderCode}${credit ? `:${extra.sourceCode || 'CREDIT'}` : ''}`,
    sourceType,
    sourceId: extra.sourceId || orderCode,
    sourceCode: extra.sourceCode || orderCode,
    ...extra
  };
}

test('Phase260C-R3 projector keeps debit-credit raw balance and splits debt versus credit balance', () => {
  assert.deepEqual(
    projector.projectBalanceFromTotals({ debit: 7788690, credit: 7880901 }, { tolerance: 1000 }),
    {
      debit: 7788690,
      credit: 7880901,
      rawBalance: -92211,
      balance: -92211,
      rawDebt: -92211,
      debtAmount: 0,
      positiveDebt: 0,
      creditBalance: 92211,
      creditBalanceAmount: 92211,
      displayStatus: 'overpaid',
      status: 'overpaid',
      hasOpenDebt: false,
      isOverpaid: true,
      withinTolerance: false,
      tolerance: 1000
    }
  );

  const small = projector.projectBalanceFromTotals({ debit: 1500, credit: 1000 }, { tolerance: 1000 });
  assert.equal(small.rawBalance, 500);
  assert.equal(small.debtAmount, 500);
  assert.equal(small.displayStatus, 'settled_by_tolerance');
});

test('Phase260C-R3/260E AR customer read model exposes B0039602 return credit without adjustment', () => {
  const rows = [
    ledger('AR-DEBT-OPEN', 'B0039602', '4501189', 7788690, 0),
    ledger('AR-DEBT-PAYMENT', 'B0039602', '4501189', 0, 7788690, { sourceType: 'DEBT_RECEIPT', sourceCode: 'DC202607150546446561' }),
    ledger('AR-RETURN', 'B0039602', '4501189', 0, 92211, { sourceType: 'RETURN_ORDER', sourceId: 'RO-B0039602', returnOrderId: 'RO-B0039602' })
  ];
  const result = arCustomerReadModel.buildCustomerDebtReadModelFromLedgers(rows, { status: 'all' });
  const order = result.orders.find((row) => row.orderCode === 'B0039602');

  assert.equal(order.rawBalance, -92211);
  assert.equal(order.debtAmount, 0);
  assert.equal(order.debt, 0);
  assert.equal(order.creditBalance, 92211);
  assert.equal(order.status, 'overpaid');
  assert.equal(result.summary.totalDebt, 0);
  assert.equal(result.summary.creditBalanceAmount, 92211);
});

test('Phase260C-R3 customer summary does not auto-offset another open order with B0039602 credit', () => {
  const rows = [
    ledger('AR-DEBT-OPEN', 'B0039125', '4501189', 2078626, 0),
    ledger('AR-DEBT-OPEN', 'B0039602', '4501189', 7788690, 0),
    ledger('AR-DEBT-PAYMENT', 'B0039602', '4501189', 0, 7788690),
    ledger('AR-RETURN', 'B0039602', '4501189', 0, 92211, { sourceType: 'RETURN_ORDER', sourceId: 'RO-B0039602', returnOrderId: 'RO-B0039602' })
  ];
  const result = arCustomerReadModel.buildCustomerDebtReadModelFromLedgers(rows, { status: 'all' });
  const customer = result.customers.find((row) => row.customerCode === '4501189');

  assert.equal(customer.debtAmount, 2078626);
  assert.equal(customer.debt, 2078626);
  assert.equal(customer.creditBalance, 92211);
  assert.equal(customer.rawBalance, 1986415);
});

test('Phase260C-R3/260E debt-new grouping returns creditBalance from canonical return, not adjustment', () => {
  const rows = [
    ledger('AR-DEBT-OPEN', 'B0039602', '4501189', 7788690, 0),
    ledger('AR-DEBT-PAYMENT', 'B0039602', '4501189', 0, 7788690),
    ledger('AR-RETURN', 'B0039602', '4501189', 0, 92211, { sourceType: 'RETURN_ORDER', sourceId: 'RO-B0039602', returnOrderId: 'RO-B0039602' })
  ];
  const grouped = debtNew.groupLedgers(rows, { status: 'all' });
  const order = grouped.orders.find((row) => row.orderCode === 'B0039602');

  assert.equal(order.rawBalance, -92211);
  assert.equal(order.debtAmount, 0);
  assert.equal(order.creditBalanceAmount, 92211);
  assert.equal(order.status, 'overpaid');
  assert.equal(grouped.summary.totalDebt, 0);
  assert.equal(grouped.summary.creditBalanceAmount, 92211);
});

test('Phase260C-R3 browser code reads backend debt DTO and does not rebuild available debt by subtraction', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/app/new/92-debt-new.js'), 'utf8');
  assert.match(source, /raw\.indexOf\('-'\)/);
  assert.doesNotMatch(source, /orderRemainingDebt\(order\)\s*-\s*orderPendingCollectionAmount\(order\)/);
  assert.match(source, /order\.debtAmount/);
  assert.match(source, /order\.availableToCollect/);
});
