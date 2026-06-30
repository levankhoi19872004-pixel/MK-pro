'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arPosting = require('../src/services/arPosting.service');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');
const { FakeModel, b0038423Order } = require('./helpers/phase79FakeModels');

function setup() {
  const SalesOrder = new FakeModel([b0038423Order()]);
  const ArLedger = new FakeModel([]);
  const AuditLog = new FakeModel([]);
  const ArDebtOrder = new FakeModel([]);
  const ArDebtCustomer = new FakeModel([]);
  arPosting.setModelsForTest({ SalesOrder, ArLedger, AuditLog });
  arDebtReadModel.setModelsForTest({ ArLedger, ArDebtOrder, ArDebtCustomer });
  return { SalesOrder, ArLedger, AuditLog, ArDebtOrder, ArDebtCustomer };
}

test('confirmSalesOrderAR creates one full-contract AR-SALE and retry does not duplicate', async () => {
  const h = setup();
  const first = await arPosting.confirmSalesOrderAR({ orderId: 'SO1782550380164673', accountant: 'kt01' });
  const second = await arPosting.confirmSalesOrderAR({ orderCode: 'B0038423', accountant: 'kt01' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.existing, true);
  const sales = h.ArLedger.rows.filter((row) => row.category === 'AR-SALE');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].idempotencyKey, 'AR-SALE:salesOrder:SO1782550380164673');
  assert.equal(sales[0].customerCode, '4501221');
  assert.equal(sales[0].debit, 10402373);
  assert.equal(h.ArDebtOrder.rows.length, 1);
  assert.equal(h.ArDebtCustomer.rows.length, 1);
  assert.equal(h.ArDebtCustomer.rows[0].remainingDebt, 10402373);
});

test('confirmSalesOrderAR audits dirty AR-SALE but does not use it as canonical', async () => {
  const h = setup();
  h.ArLedger.rows.push({
    account: 'AR',
    id: 'AR-SALE-B0038423-DIRTY',
    code: 'AR-SALE-B0038423-DIRTY',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    sourceId: 'SO1782550380164673',
    sourceCode: 'B0038423',
    customerCode: '4501221',
    debit: 10402373,
    amount: 10402373,
    direction: 'debit'
  });
  const result = await arPosting.confirmSalesOrderAR({ orderId: 'SO1782550380164673', accountant: 'kt01' });
  assert.equal(result.created, true);
  assert.equal(result.dirtyRowsIgnored, 1);
  assert.equal(h.ArLedger.rows.filter((row) => row.category === 'AR-SALE').length, 1);
  assert.equal(h.AuditLog.created.some((row) => row.payload?.code === 'DIRTY_AR_SALE_LEDGER_IGNORED_AS_CANONICAL'), true);
});
