'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');
const { FakeModel } = require('./helpers/phase79FakeModels');

function setupReadModels() {
  const ArLedger = new FakeModel([]);
  const ArDebtOrder = new FakeModel([
    { id: 'DEBT-ORDER:4501221:SO1782550380164673', customerCode: '4501221', customerName: 'Chị Hương', sourceId: 'SO1782550380164673', sourceCode: 'B0038423', salesStaffCode: '35095', deliveryStaffCode: 'GHTH', debit: 10402373, credit: 0, rawDebt: 10402373, remainingDebt: 10402373, orderCount: 1, ledgerCount: 1, status: 'open' }
  ]);
  const ArDebtCustomer = new FakeModel([
    { id: 'DEBT-CUSTOMER:4501221', customerCode: '4501221', customerName: 'Chị Hương', salesStaffCode: '35095', deliveryStaffCode: 'GHTH', debit: 10402373, credit: 0, rawDebt: 10402373, remainingDebt: 10402373, orderCount: 1, ledgerCount: 1, status: 'open' }
  ]);
  arDebtReadModel.setModelsForTest({ ArLedger, ArDebtOrder, ArDebtCustomer });
}

test('debt read model API contract returns stable customers/orders/summary/pagination diagnostics shape', async () => {
  setupReadModels();
  const result = await arDebtReadModel.getDebtCustomers({ deliveryStaffCode: 'ghth', status: 'open', page: 1, limit: 20 });
  const data = {
    customers: result.customers,
    orders: result.orders,
    summary: result.summary,
    pagination: { page: result.summary.page, limit: result.summary.limit, total: result.summary.total, hasMore: result.summary.hasMore },
    diagnostics: { source: result.source, readModelCollections: result.readModelCollections, usesSnapshot: result.debugSource.usesSnapshot }
  };
  assert.equal(data.customers.length, 1);
  assert.equal(data.orders.length, 1);
  assert.equal(data.summary.totalDebt, 10402373);
  assert.equal(data.pagination.page, 1);
  assert.equal(data.diagnostics.usesSnapshot, false);
  assert.equal(data.diagnostics.readModelCollections.debtCustomers, 'arDebtCustomers');
});

test('frontend debt core consumes data.customers/data.orders and sends status=open default without Vietnamese labels', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public/js/app/debt/07a-debt-core.js'), 'utf8');
  assert.match(src, /const debtData=json\.data\|\|\{\}/);
  assert.match(src, /Array\.isArray\(debtData\.orders\)/);
  assert.match(src, /debtData\.customers\|\|json\.customerSummary/);
  assert.match(src, /params\.set\('status',criteria\.status\|\|'open'\)/);
  assert.doesNotMatch(src, /params\.set\('status','Khách còn nợ'\)/);
});
