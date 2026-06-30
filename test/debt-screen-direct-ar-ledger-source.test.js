'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const reportService = require('../src/services/reports/DebtReportService');
const arCustomerDebtReadModel = require('../src/services/accounting/arCustomerDebtReadModel.service');
const { FakeModel } = require('./helpers/phase79FakeModels');

function arLedger(overrides = {}) {
  const orderCode = overrides.orderCode || overrides.sourceCode || 'B0000000';
  const sourceId = overrides.sourceId || overrides.salesOrderId || `SO-${orderCode}`;
  const category = overrides.category || 'AR-SALE';
  const credit = Number(overrides.credit || 0);
  const debit = Number(overrides.debit || 0);
  return {
    account: 'AR',
    category,
    ledgerType: category,
    entryType: category.endsWith('REVERSAL') ? 'reversal' : 'normal',
    type: category.toLowerCase().replaceAll('-', '_'),
    sourceType: 'salesOrder',
    sourceId,
    sourceCode: orderCode,
    orderId: sourceId,
    orderCode,
    salesOrderId: sourceId,
    salesOrderCode: orderCode,
    customerCode: overrides.customerCode || 'C001',
    customerName: overrides.customerName || 'Customer',
    deliveryStaffCode: overrides.deliveryStaffCode || 'ghnpp',
    deliveryStaffName: overrides.deliveryStaffName || 'Minh Khai',
    salesStaffCode: overrides.salesStaffCode || 'BANBUON',
    salesStaffName: overrides.salesStaffName || 'Minh Khai',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: category === 'AR-SALE' ? `ACC-${sourceId}-TEST` : `PAY-${sourceId}-TEST`,
    active: true,
    reversed: false,
    debit,
    credit,
    amount: Math.max(debit, credit),
    direction: debit > 0 ? 'debit' : 'credit',
    amountField: debit > 0 ? 'debit' : 'credit',
    date: '2026-06-30',
    id: `${category}-${orderCode}-${Math.max(debit, credit)}`,
    code: `${category}-${orderCode}-${Math.max(debit, credit)}`,
    idempotencyKey: category === 'AR-SALE'
      ? `AR-SALE:salesOrder:${sourceId}`
      : `${category}:salesOrder:${sourceId}:${Math.max(debit, credit)}`,
    ...overrides
  };
}

function setup(rows) {
  const ArLedger = new FakeModel(rows);
  arCustomerDebtReadModel.setArLedgerModelForTest(ArLedger);
  return ArLedger;
}

test('debt screen reads directly from canonical arLedgers even when arDebtOrders/arDebtCustomers are empty', async () => {
  setup([
    arLedger({ orderCode: 'B0038442', sourceId: 'SO1782723235234708', customerCode: 'BBHOASON', customerName: 'Hoa Sơn', debit: 487484570 }),
    arLedger({ category: 'AR-RECEIPT', orderCode: 'B0038442', sourceId: 'SO1782723235234708', customerCode: 'BBHOASON', customerName: 'Hoa Sơn', credit: 190000000 }),
    arLedger({ orderCode: 'B0038355', sourceId: 'SO1782550380268132', customerCode: 'BBHAIHD', customerName: 'Hải HD', debit: 237632080 })
  ]);

  const result = await reportService.debtCustomers({ deliveryStaffCode: 'ghnpp', status: 'open', limit: 20 });

  assert.equal(result.source, 'mongo_ar_ledgers_read_model_v2');
  assert.equal(result.ledgerCollection, 'arLedgers');
  assert.equal(result.debugSource.source, 'arLedgers');
  assert.equal(result.summary.totalDebt, 535116650);
  assert.equal(result.summary.customerDebtCount, 2);

  const hoaSon = result.customers.find((row) => row.customerCode === 'BBHOASON');
  const haiHd = result.customers.find((row) => row.customerCode === 'BBHAIHD');
  assert.equal(hoaSon.debt, 297484570);
  assert.equal(haiHd.debt, 237632080);

  const hoaOrder = hoaSon.orders.find((row) => row.orderCode === 'B0038442');
  assert.equal(hoaOrder.arSaleAmount, 487484570);
  assert.equal(hoaOrder.receiptAmount, 190000000);
  assert.equal(hoaOrder.remainingDebt, 297484570);
});

test('dirty AR-RECEIPT is excluded from canonical debt and auditably cannot reduce debt', async () => {
  setup([
    arLedger({ orderCode: 'B0038442', sourceId: 'SO1782723235234708', customerCode: 'BBHOASON', customerName: 'Hoa Sơn', debit: 487484570 }),
    {
      ...arLedger({ category: 'AR-RECEIPT', orderCode: 'B0038442', sourceId: 'SO1782723235234708', customerCode: 'BBHOASON', customerName: 'Hoa Sơn', credit: 190000000 }),
      category: '',
      ledgerType: '',
      entryType: ''
    }
  ]);

  const result = await reportService.debtCustomers({ deliveryStaffCode: 'ghnpp', status: 'open' });
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].debt, 487484570, 'dirty receipt must not be accepted by direct AR ledger debt API');
});

test('debt report service no longer exposes arDebtOrders/arDebtCustomers as the main UI source', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/services/reports/DebtReportService.js'), 'utf8');
  assert.doesNotMatch(src, /phase79ArDebtReadModel\.getDebtCustomers/);
  assert.doesNotMatch(src, /phase79ArDebtReadModel\.getDebtOrders/);
  assert.match(src, /debtCustomers:\s*arCustomerDebtReadModel\.debtCustomers/);
  assert.match(src, /debtCustomerDetail:\s*arCustomerDebtReadModel\.debtCustomerDetail/);
});
