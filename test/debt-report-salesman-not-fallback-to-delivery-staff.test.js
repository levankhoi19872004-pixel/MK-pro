'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildCustomerDebtReadModelFromLedgers } = require('../src/services/accounting/arCustomerDebtReadModel.service');

function assertNoSalesmanStaffFallback() {
  const masterSource = require('./helpers/sourceBundle.util').readSource('src/services/master-order/masterOrderLegacy.service.js');
  const reportSource = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');
  const readModelSource = require('./helpers/sourceBundle.util').readSource('src/services/accounting/arCustomerDebtReadModel.service.js');

  assert.doesNotMatch(
    masterSource,
    /salesmanName:\s*String\(order\.salesmanName\s*\|\|\s*order\.staffName/,
    'AR-SALE must prefer salesStaffName/nvbhName, not staffName, for salesmanName'
  );
  assert.doesNotMatch(
    masterSource,
    /salesmanCode:\s*String\(order\.salesmanCode\s*\|\|\s*order\.staffCode/,
    'AR-SALE must prefer salesStaffCode/nvbhCode, not staffCode, for salesmanCode'
  );
  assert.doesNotMatch(
    reportSource,
    /salesmanName:\s*customer\.salesmanName\s*\|\|\s*customer\.staffName/,
    'Debt customer meta must not use customer.staffName as NVBH fallback'
  );
  assert.doesNotMatch(
    readModelSource,
    /salesmanName:\s*firstText\([^\n]+staffName/,
    'Debt read model must not use generic staffName as NVBH when salesStaffName/nvbhName are absent'
  );
  assert.doesNotMatch(
    readModelSource,
    /deliveryStaffName:\s*firstText\([^\n]+staffName/,
    'Debt read model must not use generic staffName as NVGH when deliveryStaffName/nvghName are absent'
  );
}

test('debtReport keeps NVBH separate from NVGH when staffName contains delivery staff', async () => {
  assertNoSalesmanStaffFallback();

  const report = buildCustomerDebtReadModelFromLedgers([
    {
      _id: 'ar-sale-staff-boundary',
      account: 'AR',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      status: 'posted',
      category: 'AR-SALE',
      ledgerType: 'AR-SALE',
      entryType: 'normal',
      sourceType: 'salesOrder',
      sourceId: 'SO90203391',
      sourceCode: 'HU90203391',
      active: true,
      reversed: false,
      idempotencyKey: 'AR-SALE:salesOrder:SO90203391',
      accountingBatchId: 'ACC-SO90203391-TEST',
      type: 'ar_sale',
      date: '2026-06-09',
      customerCode: '4499704',
      customerName: 'Chị Giang Điệp',
      orderCode: 'HU90203391',
      orderId: 'SO90203391',
      salesStaffCode: 'nvbh-da',
      salesStaffName: 'Đỗ Thị Anh',
      staffCode: 'ghtp',
      staffName: 'Hiếu Giao Hàng TP',
      deliveryStaffCode: 'ghtp',
      deliveryStaffName: 'Hiếu Giao Hàng TP',
      debit: 1271203,
      credit: 0,
      amount: 1271203,
      direction: 'debit'
    }
  ], { status: 'all', q: '4499704' }, { today: '2026-06-09' });

  assert.equal(report.debts.length, 1);
  assert.equal(report.debts[0].salesmanName, 'Đỗ Thị Anh');
  assert.equal(report.debts[0].deliveryStaffName, 'Hiếu Giao Hàng TP');
  assert.notEqual(report.debts[0].salesmanName, report.debts[0].deliveryStaffName);
  assert.equal(report.customers[0].salesmanName, 'Đỗ Thị Anh');
  assert.equal(report.customers[0].deliveryStaffName, 'Hiếu Giao Hàng TP');
});
