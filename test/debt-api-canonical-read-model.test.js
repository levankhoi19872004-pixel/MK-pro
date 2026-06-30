'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');
const { FakeModel } = require('./helpers/phase79FakeModels');

function setupReadModels() {
  const ArLedger = new FakeModel([]);
  const ArDebtOrder = new FakeModel([
    { id: 'DEBT-ORDER:4501221:SO1782550380164673', customerCode: '4501221', customerName: 'Chị Hương', sourceId: 'SO1782550380164673', sourceCode: 'B0038423', salesStaffCode: '35095', deliveryStaffCode: 'ghth', debit: 10402373, credit: 0, rawDebt: 10402373, remainingDebt: 10402373, orderCount: 1, ledgerCount: 1, status: 'open' },
    { id: 'DEBT-ORDER:999:SO-OTHER', customerCode: '999', customerName: 'Khác', sourceId: 'SO-OTHER', sourceCode: 'B0000001', salesStaffCode: 'OTHER', deliveryStaffCode: 'othergh', debit: 5000, credit: 0, rawDebt: 5000, remainingDebt: 5000, orderCount: 1, ledgerCount: 1, status: 'open' }
  ]);
  const ArDebtCustomer = new FakeModel([
    { id: 'DEBT-CUSTOMER:4501221', customerCode: '4501221', customerName: 'Chị Hương', salesStaffCode: '35095', deliveryStaffCode: 'ghth', debit: 10402373, credit: 0, rawDebt: 10402373, remainingDebt: 10402373, orderCount: 1, ledgerCount: 1, status: 'open' },
    { id: 'DEBT-CUSTOMER:999', customerCode: '999', customerName: 'Khác', salesStaffCode: 'OTHER', deliveryStaffCode: 'othergh', debit: 5000, credit: 0, rawDebt: 5000, remainingDebt: 5000, orderCount: 1, ledgerCount: 1, status: 'open' }
  ]);
  arDebtReadModel.setModelsForTest({ ArLedger, ArDebtOrder, ArDebtCustomer });
  return { ArLedger, ArDebtOrder, ArDebtCustomer };
}

test('Debt API service reads canonical read model, paginates and filters salesStaffCode=35095 exactly', async () => {
  setupReadModels();
  const result = await arDebtReadModel.getDebtCustomers({ salesStaffCode: '35095', page: 1, limit: 10 });
  assert.equal(result.debugSource.readModel, 'arDebtReadModel.service');
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].customerCode, '4501221');
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.totalDebt, 10402373);
});

test('Debt API service filters deliveryStaffCode=ghth exactly and returns customer orders', async () => {
  setupReadModels();
  const result = await arDebtReadModel.getDebtOrders('4501221', { deliveryStaffCode: 'ghth', status: 'open', page: 1, limit: 10 });
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].sourceCode, 'B0038423');
  assert.equal(result.orders[0].deliveryStaffCode, 'ghth');
  assert.equal(result.summary.orderDebtCount, 1);
});
