'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const ArLedger = require('../src/models/ArLedger');
const Customer = require('../src/models/Customer');

function assertNoSalesmanStaffFallback() {
  const masterSource = fs.readFileSync('src/services/master-order/masterOrderLegacy.service.js', 'utf8');
  const reportSource = fs.readFileSync('src/services/reportService.js', 'utf8');

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
  assert.equal(
    reportSource.includes("salesmanName: { $max: { $ifNull: ['$salesmanName', { $ifNull: ['$salesStaffName', { $ifNull: ['$nvbhName', '$staffName'] }] }] } }"),
    false,
    'Debt aggregate salesmanName must not fallback to $staffName, which may contain NVGH'
  );
  assert.equal(
    reportSource.includes("deliveryStaffName: { $max: { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', { $ifNull: ['$nvghName', '$staffName'] }] }] } }"),
    false,
    'Debt aggregate deliveryStaffName must not fallback to $staffName, which may contain NVBH'
  );
  assert.equal(
    reportSource.includes("deliveryStaffCode: { $max: { $ifNull: ['$deliveryStaffCode', { $ifNull: ['$deliveryCode', { $ifNull: ['$deliveryStaff', { $ifNull: ['$nvghCode', '$staffCode'] }] }] }] } }"),
    false,
    'Debt aggregate deliveryStaffCode must not fallback to $staffCode, which may contain NVBH'
  );
}

test('debtReport keeps NVBH separate from NVGH when staffName contains delivery staff', async () => {
  assertNoSalesmanStaffFallback();

  const originalAggregate = ArLedger.aggregate;
  const originalFind = Customer.find;
  let capturedPipeline = null;

  ArLedger.aggregate = (pipeline) => {
    capturedPipeline = pipeline;
    return {
      allowDiskUse() { return this; },
      exec: async () => ([{
        _id: {
          customerCode: '4499704',
          customerName: 'Chị Giang Điệp',
          orderCode: 'HU90203391',
          orderId: 'SO90203391'
        },
        firstDate: '2026-06-09',
        lastDate: '2026-06-09',
        debit: 1271203,
        credit: 0,
        receiptAmount: 0,
        returnAmount: 0,
        bonusAmount: 0,
        salesmanCode: 'nvbh-da',
        salesmanName: 'Đỗ Thị Anh',
        deliveryStaffCode: 'ghtp',
        deliveryStaffName: 'Hiếu Giao Hàng TP'
      }])
    };
  };

  Customer.find = () => ({
    select() { return this; },
    limit() { return this; },
    lean: async () => [],
    catch() { return this; }
  });

  try {
    delete require.cache[require.resolve('../src/services/reportService')];
    const reportService = require('../src/services/reportService');
    const result = await reportService.debtReport({ date: '2026-06-09', limit: 10 });
    assert.equal(result.debts.length, 1);
    assert.equal(result.debts[0].salesmanName, 'Đỗ Thị Anh');
    assert.equal(result.debts[0].deliveryStaffName, 'Hiếu Giao Hàng TP');
    assert.notEqual(result.debts[0].salesmanName, result.debts[0].deliveryStaffName);

    const groupStage = capturedPipeline.find((stage) => stage.$group);
    assert.ok(groupStage, 'debtReport must build a $group stage');
    assert.deepEqual(
      groupStage.$group.salesmanName,
      { $max: { $ifNull: ['$salesmanName', { $ifNull: ['$salesStaffName', '$nvbhName'] }] } }
    );
    assert.deepEqual(
      groupStage.$group.deliveryStaffName,
      { $max: { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', '$nvghName'] }] } }
    );
  } finally {
    ArLedger.aggregate = originalAggregate;
    Customer.find = originalFind;
    delete require.cache[require.resolve('../src/services/reportService')];
  }
});
