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

test('reverseSalesOrderAR creates exactly one AR-SALE-REVERSAL and marks original inactive', async () => {
  const h = setup();
  await arPosting.confirmSalesOrderAR({ orderId: 'SO1782550380164673', accountant: 'kt01' });
  const first = await arPosting.reverseSalesOrderAR({ orderId: 'SO1782550380164673', accountant: 'kt01', reason: 'test reverse' });
  const second = await arPosting.reverseSalesOrderAR({ orderCode: 'B0038423', accountant: 'kt01', reason: 'retry reverse' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.existing, true);
  const reversals = h.ArLedger.rows.filter((row) => row.category === 'AR-SALE-REVERSAL');
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].credit, 10402373);
  const original = h.ArLedger.rows.find((row) => row.category === 'AR-SALE');
  assert.equal(original.accountingStatus, 'reversed');
  assert.equal(original.active, false);
  assert.equal(original.reversed, true);
  assert.ok(original.reversalLedgerId);
  assert.equal(h.ArDebtCustomer.rows[0].remainingDebt, -10402373);
});
