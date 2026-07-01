'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');
const { FakeModel } = require('./helpers/phase79FakeModels');

test('canonical debt API exposes debt/order aliases for legacy debt UI display', async () => {
  const ArLedger = new FakeModel([]);
  const ArDebtCustomer = new FakeModel([
    { id: 'DEBT-CUSTOMER:4501090', customerCode: '4501090', customerName: 'Chủ Quân', salesStaffCode: '35095', salesStaffName: 'Nguyễn Đình Thành', deliveryStaffCode: 'ghth', deliveryStaffName: 'Thành GH Tiền hải', debit: 1500000, credit: 200000, rawDebt: 1300000, remainingDebt: 1300000, orderCount: 3, ledgerCount: 3, status: 'open' }
  ]);
  const ArDebtOrder = new FakeModel([
    { id: 'DEBT-ORDER:4501090:SO1', customerCode: '4501090', customerName: 'Chủ Quân', sourceId: 'SO1', sourceCode: 'HU1', salesStaffCode: '35095', salesStaffName: 'Nguyễn Đình Thành', deliveryStaffCode: 'ghth', deliveryStaffName: 'Thành GH Tiền hải', debit: 1500000, credit: 200000, rawDebt: 1300000, remainingDebt: 1300000, ledgerCount: 1, status: 'open', lastDebtDate: '2026-06-30' }
  ]);
  arDebtReadModel.setModelsForTest({ ArLedger, ArDebtOrder, ArDebtCustomer });

  const result = await arDebtReadModel.getDebtCustomers({ salesStaffCode: '35095', deliveryStaffCode: 'ghth', status: 'open' });
  assert.equal(result.customers[0].debt, 1300000);
  assert.equal(result.customers[0].remainingDebtDisplay, 1300000);
  assert.equal(result.customers[0].salesmanCode, '35095');
  assert.equal(result.orders[0].debt, 1300000);
  assert.equal(result.orders[0].orderId, 'SO1');
  assert.equal(result.orders[0].orderCode, 'HU1');
  assert.equal(result.orders[0].documentDate, '2026-06-30');
});

test('Debt New UI renders cards/details from remainingDebt aliases, not only d.debt', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/92-debt-new.js'), 'utf8');
  assert.match(src, /function openDebt\(order\)/);
  assert.match(src, /order\.debt \?\? order\.remainingDebt \?\? order\.availableDebt \?\? order\.availableDebtAmount/);
  assert.match(src, /money\(row\.debt\)/);
  assert.match(src, /money\(customer\.debt\)/);
  assert.match(src, /openDebt\(order\)/);
});
