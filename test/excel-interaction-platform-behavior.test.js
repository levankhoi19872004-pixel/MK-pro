'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/excel/ExcelInteractionService');
const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../src/utils/excelWriter.util');

test('sanitizeExcelValue blocks formula injection without changing normal values', () => {
  assert.equal(service.sanitizeExcelValue('=1+1'), "'=1+1");
  assert.equal(service.sanitizeExcelValue('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(service.sanitizeExcelValue('-2+3'), "'-2+3");
  assert.equal(service.sanitizeExcelValue('@cmd'), "'@cmd");
  assert.equal(service.sanitizeExcelValue('Khách hàng A'), 'Khách hàng A');
  assert.equal(service.sanitizeExcelValue(123), 123);
});

test('sales export maps case/loose quantity and promotion value correctly', () => {
  const rows = service._internal.salesItemRows([{
    code: 'SO1',
    orderDate: '2026-06-18',
    customerCode: 'C1',
    items: [{
      productCode: 'P1',
      productName: 'Sản phẩm',
      conversionRate: 12,
      quantity: 25,
      salePrice: 100,
      finalPrice: 90,
      amount: 2250
    }]
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cartonQty, 2);
  assert.equal(rows[0].unitQty, 1);
  assert.equal(rows[0].baseQty, 25);
  assert.equal(rows[0].promotionValue, 250);
  assert.equal(rows[0].amount, 2250);
});

test('master order export flattens child orders and products', () => {
  const masters = [{
    code: 'MO1',
    children: [{
      code: 'SO1',
      customerCode: 'C1',
      totalAmount: 1200,
      items: [{ productCode: 'P1', conversionRate: 10, quantity: 12, salePrice: 100 }]
    }]
  }];
  const children = service._internal.masterChildRows(masters);
  const items = service._internal.masterItemRows(masters);
  assert.equal(children[0].masterOrderCode, 'MO1');
  assert.equal(children[0].orderCode, 'SO1');
  assert.equal(items[0].cartonQty, 1);
  assert.equal(items[0].unitQty, 2);
  assert.equal(items[0].amount, 1200);
});

test('custom writer creates a valid XLSX zip buffer', () => {
  const workbook = createWorkbook();
  appendAoaSheet(workbook, 'Data', [['Mã', 'Tên'], ['001', 'Sản phẩm']]);
  const buffer = writeWorkbook(workbook);
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK');
  assert.ok(buffer.length > 500);
});
