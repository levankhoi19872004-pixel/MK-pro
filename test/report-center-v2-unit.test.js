'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/reports/ReportCenterService');

test('report catalog is role-scoped and management receives all report definitions', () => {
  assert.equal(service.catalog({ role: 'admin' }).reports.length, 18);
  assert.deepEqual(
    service.catalog({ role: 'warehouse' }).reports.map((row) => row.code),
    ['inventory-current', 'inventory-movement', 'stock-card']
  );
  assert.deepEqual(service.catalog({ role: 'sales' }).reports.map((row) => row.code), ['inventory-current']);
  assert.throws(() => service.assertAccess('debt-period', { role: 'warehouse' }), /không có quyền/i);
});

test('sales-by-day aggregation preserves gross, actual, return and net values', () => {
  const rows = service.aggregateSalesByDay([
    { date: '2026-06-01', code: 'SO1', customerCode: 'C1', beforePromoAmount: 120, actualAmount: 100, promotionValue: 20, receiptAmount: 50, returnAmount: 10, debtAmount: 40 },
    { date: '2026-06-01', code: 'SO2', customerCode: 'C2', beforePromoAmount: 240, actualAmount: 200, promotionValue: 40, receiptAmount: 100, returnAmount: 20, debtAmount: 80 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].orderCount, 2);
  assert.equal(rows[0].customerCount, 2);
  assert.equal(rows[0].beforePromoAmount, 360);
  assert.equal(rows[0].actualAmount, 300);
  assert.equal(rows[0].returnAmount, 30);
  assert.equal(rows[0].netSalesAmount, 270);
});

test('product aggregation uses allocated actual line value and calculates average unit price', () => {
  const rows = service.aggregateSalesByProduct([
    {
      code: 'SO1', customerCode: 'C1',
      items: [{ productCode: 'P1', productName: 'SP 1', quantity: 2, catalogAmount: 240, actualAmount: 200, brand: 'B', category: 'C', unit: 'SU' }]
    },
    {
      code: 'SO2', customerCode: 'C2',
      items: [{ productCode: 'P1', productName: 'SP 1', quantity: 3, catalogAmount: 360, actualAmount: 300, brand: 'B', category: 'C', unit: 'SU' }]
    }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 5);
  assert.equal(rows[0].orderCount, 2);
  assert.equal(rows[0].customerCount, 2);
  assert.equal(rows[0].actualAmount, 500);
  assert.equal(rows[0].promotionDiscountAmount, 100);
  assert.equal(rows[0].averageUnitPrice, 100);
});

test('data-quality report prioritizes critical inventory and missing child issues', () => {
  const rows = service.dataQualityRows({
    sales: { sales: [] },
    inventory: { dateTo: '2026-06-18', stock: [{ productCode: 'P1', productName: 'SP 1', endingQty: -2, reconciliationDifference: 0 }] },
    delivery: { delivery: [{ code: 'MO1', deliveryDate: '2026-06-18', deliveryStaffName: 'NVGH', assignedOrderCount: 2, snapshotTotalAmount: 100, dataQuality: { missingChildren: true } }] },
    returns: { returns: [] }
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.severity === 'critical'));
});
