'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const readXlsxFile = require('read-excel-file/node');
const service = require('../src/services/sseInvoiceExport.service');

function config(type = 'VAT') {
  return {
    sheetName:'TỔNG', invoiceType:type === 'NON_VAT' ? '2' : '3', invoiceSymbol:'01_010824', warehouseCode:'TP0101', currencyCode:'Vnd', exchangeRate:1,
    taxCode:'00', debitAccount:'13111', revenueAccount:'51111', cogsAccount:'63211', outputTaxAccount:'333111', discountAccount:'13121',
    defaultSalesmanCode:'BANBUON', vatRate:0.08, allowCanonicalCustomerCodeFallback:true, allowCanonicalProductCodeFallback:true, maxRows:100000
  };
}
function order(code, salesStaffCode, salesStaffName, items) {
  return {
    id: code,
    code,
    orderDate: '2026-07-02',
    customerCode: 'KH1',
    customerName: 'Khách 1',
    sseSalesmanCode: salesStaffCode,
    salesStaffCode,
    salesStaffName,
    vatInvoiceRequired: true,
    status: 'delivered',
    items
  };
}
function item(productCode, quantity, priceAfterPromotion, lineKey) {
  return { productCode, productName: `SP ${productCode}`, quantity, priceAfterPromotion, baseUnit: 'Gói', lineKey };
}
const customers = [{ code:'KH1', name:'Khách 1', sseCustomerCode:'KH1' }];
const products = [
  { code:'P01', name:'Sản phẩm P01', baseUnit:'Gói', sseProductCode:'P01', salePrice:10000 },
  { code:'P02', name:'Sản phẩm P02', baseUnit:'Thùng', sseProductCode:'P02' }
];

function findRowsByProduct(summaryRows, productCode) {
  return summaryRows.filter((row) => row[4] === productCode && row[5] !== 'TỔNG NVBH' && row[5] !== 'TỔNG CỘNG');
}

test('SSE salesman summary keeps TỔNG unchanged and adds TONG_THEO_NVBH after it', async () => {
  const built = service.buildSseRows({
    orders: [order('A', '33949', 'Đỗ Thị Anh', [item('P01', 2, 10800, 'A1')])],
    returnOrders: [], customers, products, invoiceType:'VAT', config:config('VAT'), configByType:{ VAT:config('VAT'), NON_VAT:config('NON_VAT') }
  });
  assert.equal(built.rows.length, 1);
  assert.equal(built.summarySourceRows.length, built.rows.length);
  const buffer = service.buildUploadWorkbook(built.rows, config('VAT'), built.summarySourceRows);
  const sheets = await readXlsxFile(buffer);
  assert.deepEqual(sheets.map((sheet) => sheet.sheet), ['TỔNG', 'TONG_THEO_NVBH']);
  assert.deepEqual(sheets[0].data[4], service.SSE_HEADERS);
  assert.equal(sheets[0].data[5][7], 'P01');
  assert.deepEqual(sheets[1].data[0], service.SALESMAN_SUMMARY_HEADERS);
});

test('same salesman and same product code is grouped into one row using product.salePrice, not order line price', () => {
  const built = service.buildSseRows({
    orders: [
      order('A', '33949', 'Đỗ Thị Anh', [item('P01', 2, 10800, 'A1')]),
      order('B', '33949', 'Đỗ Thị Anh', [item('P01', 3, 9500, 'B1')])
    ],
    returnOrders: [], customers, products, invoiceType:'VAT', config:config('VAT'), configByType:{ VAT:config('VAT'), NON_VAT:config('NON_VAT') }
  });
  assert.equal(built.rows.length, 2);
  assert.equal(built.summarySourceRows.length, 2);
  const summary = service._private.buildSseSalesmanSummaryRows(built.summarySourceRows);
  const p01Rows = findRowsByProduct(summary.map((row) => [null, row.salesStaffCode, row.salesStaffName, row.orderCount, row.productCode, row.productName, row.unit, row.warehouseCode, row.quantity, row.unitPrice, row.amount, row.note]), 'P01');
  assert.equal(p01Rows.length, 1);
  assert.equal(p01Rows[0][1], '33949');
  assert.equal(p01Rows[0][3], 2);
  assert.equal(p01Rows[0][8], 5);
  assert.equal(p01Rows[0][9], 10000);
  assert.equal(p01Rows[0][10], 50000);
});

test('same product is not merged across different salesmen', () => {
  const built = service.buildSseRows({
    orders: [
      order('A', '33949', 'Đỗ Thị Anh', [item('P01', 2, 10800, 'A1')]),
      order('B', '35127', 'Vũ Công Tân', [item('P01', 3, 9500, 'B1')])
    ],
    returnOrders: [], customers, products, invoiceType:'VAT', config:config('VAT'), configByType:{ VAT:config('VAT'), NON_VAT:config('NON_VAT') }
  });
  const summary = service._private.buildSseSalesmanSummaryRows(built.summarySourceRows);
  assert.equal(summary.length, 2);
  assert.deepEqual(summary.map((row) => [row.salesStaffCode, row.productCode, row.quantity, row.unitPrice, row.amount]), [
    ['33949', 'P01', 2, 10000, 20000],
    ['35127', 'P01', 3, 10000, 30000]
  ]);
});

test('salesman summary uses net quantity after returns and never reads original sold quantity again', () => {
  const built = service.buildSseRows({
    orders: [order('A', '33949', 'Đỗ Thị Anh', [item('P01', 10, 10800, 'A1')])],
    returnOrders: [{ code:'RO-A', salesOrderCode:'A', returnState:'accounting_confirmed', items:[{ productCode:'P01', lineKey:'A1', returnQty:4, priceAfterPromotion:10800 }] }],
    customers, products, invoiceType:'VAT', config:config('VAT'), configByType:{ VAT:config('VAT'), NON_VAT:config('NON_VAT') }
  });
  assert.equal(built.rows[0][14], 6);
  const summary = service._private.buildSseSalesmanSummaryRows(built.summarySourceRows);
  assert.equal(summary[0].quantity, 6);
  assert.equal(summary[0].amount, 60000);
});

test('missing product catalog sale price does not fail export and is flagged in summary note', () => {
  const built = service.buildSseRows({
    orders: [order('A', '33949', 'Đỗ Thị Anh', [item('P02', 2, 12000, 'A1')])],
    returnOrders: [], customers, products, invoiceType:'VAT', config:config('VAT'), configByType:{ VAT:config('VAT'), NON_VAT:config('NON_VAT') }
  });
  assert.equal(built.errors.length, 0);
  const summary = service._private.buildSseSalesmanSummaryRows(built.summarySourceRows);
  assert.equal(summary[0].productCode, 'P02');
  assert.equal(summary[0].quantity, 2);
  assert.equal(summary[0].unitPrice, 0);
  assert.equal(summary[0].amount, 0);
  assert.match(summary[0].note, /Thiếu giá bán trong danh mục sản phẩm/);
});
