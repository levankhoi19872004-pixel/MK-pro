'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const readXlsxFile = require('read-excel-file/node');
const service = require('../src/services/sseInvoiceExport.service');

function config(type = 'VAT') {
  return {
    sheetName:'TỔNG', invoiceType:type === 'NON_VAT' ? '2' : '3', invoiceSymbol:'01_010824', warehouseCode:'TP0101', currencyCode:'Vnd', exchangeRate:1,
    taxCode:'00', debitAccount:'13111', revenueAccount:'51111', cogsAccount:'63211', outputTaxAccount:'333111', discountAccount:'13121',
    defaultSalesmanCode:'BANLE', vatRate:0.08, allowCanonicalCustomerCodeFallback:true, allowCanonicalProductCodeFallback:true, maxRows:100000
  };
}
function order(code, deliveryStaffCode, deliveryStaffName, items, extra = {}) {
  return {
    id: code,
    code,
    orderDate: '2026-07-02',
    __sseInvoiceDate: '2026-07-02',
    __sseInvoiceCode: `SSE-2026-07-02-${deliveryStaffCode}`,
    __sseDeliveryStaffCode: deliveryStaffCode,
    __sseDeliveryStaffName: deliveryStaffName,
    __sseMasterOrderId: extra.masterOrderId || `MT-${deliveryStaffCode}`,
    __sseMasterOrderCode: extra.masterOrderCode || `MT-${deliveryStaffCode}`,
    customerCode: extra.customerCode || 'KH-IGNORED',
    customerName: 'Khách không dùng làm scope SSE',
    salesStaffCode: extra.salesStaffCode || 'NVBH-IGNORED',
    vatInvoiceRequired: true,
    status: 'delivered',
    items,
    ...extra
  };
}
function item(productCode, quantity, linePrice, lineKey) {
  return { productCode, productName: `Order ${productCode}`, quantity, priceAfterPromotion: linePrice, baseUnit: 'Gói', lineKey };
}
const products = [
  { code:'P01', name:'Sản phẩm P01', baseUnit:'Gói', sseProductCode:'P01', salePrice:10000 },
  { code:'P02', name:'Sản phẩm P02', baseUnit:'Thùng', sseProductCode:'P02', salePrice:12000 },
  { code:'P03', name:'Sản phẩm P03', baseUnit:'Gói', sseProductCode:'P03' }
];

function build(orders, returnOrders = []) {
  return service.buildSseRows({
    orders,
    returnOrders,
    customers: [],
    products,
    invoiceType:'ALL',
    config:config('VAT'),
    configByType:{ VAT:config('VAT'), NON_VAT:config('NON_VAT') },
    summaryBy:'deliveryStaff'
  });
}

test('delivery-staff SSE keeps mẫu TỔNG A:AJ and adds TONG_THEO_NVGH', async () => {
  const built = build([order('B001', 'GHTH', 'GH Thành Tiền Hải', [item('P01', 2, 10800, 'L1')])]);
  assert.equal(built.errors.length, 0);
  assert.equal(built.rows.length, 1);
  const buffer = service.buildUploadWorkbook(built.rows, config('VAT'), built.summarySourceRows, { summaryBy:'deliveryStaff' });
  const sheets = await readXlsxFile(buffer);
  assert.deepEqual(sheets.map((sheet) => sheet.sheet), ['TỔNG', 'TONG_THEO_NVGH']);
  assert.deepEqual(sheets[0].data[4], service.SSE_HEADERS);
  assert.equal(sheets[0].data[5].length, 36);
  assert.equal(sheets[0].data[5][0], 'GHTH');
  assert.equal(sheets[0].data[5][1], 'GH Thành Tiền Hải');
  assert.equal(sheets[0].data[5][3], 'SSE-2026-07-02-GHTH');
  assert.equal(sheets[0].data[5][7], 'P01');
  assert.equal(sheets[0].data[5][14], 2);
  assert.equal(sheets[0].data[5][15], 10000);
  assert.equal(sheets[0].data[5][16], 20000);
  assert.equal(sheets[0].data[5][35], 'BANLE');
  assert.deepEqual(sheets[1].data[0], service.DELIVERY_STAFF_SUMMARY_HEADERS);
});

test('delivery-staff SSE groups child orders by NVGH + product and uses catalog salePrice, not line price', () => {
  const built = build([
    order('B001', 'GHTH', 'GH Thành Tiền Hải', [item('P01', 2, 10800, 'L1')], { masterOrderCode:'MT001' }),
    order('B002', 'GHTH', 'GH Thành Tiền Hải', [item('P01', 3, 9000, 'L1')], { masterOrderCode:'MT001' })
  ]);
  assert.equal(built.errors.length, 0);
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0][0].value, 'GHTH');
  assert.equal(built.rows[0][7].value, 'P01');
  assert.equal(built.rows[0][14], 5);
  assert.equal(built.rows[0][15], 10000);
  assert.equal(built.rows[0][16], 50000);
  const summary = service._private.buildSseDeliveryStaffSummaryRows(built.summarySourceRows);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].childOrderCount, 2);
  assert.equal(summary[0].quantity, 5);
  assert.equal(summary[0].amount, 50000);
});

test('delivery-staff SSE subtracts eligible returnOrders by order + product before grouping', () => {
  const built = build([
    order('B001', 'GHTH', 'GH Thành Tiền Hải', [item('P01', 10, 10800, 'L1')]),
    order('B002', 'GHTH', 'GH Thành Tiền Hải', [item('P01', 5, 9500, 'L1')])
  ], [
    { code:'RO1', salesOrderCode:'B001', returnState:'accounting_confirmed', items:[{ productCode:'P01', lineKey:'L1', returnQty:2, priceAfterPromotion:10800 }] }
  ]);
  assert.equal(built.errors.length, 0);
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0][14], 13);
  assert.equal(built.rows[0][16], 130000);
  const summary = service._private.buildSseDeliveryStaffSummaryRows(built.summarySourceRows);
  assert.equal(summary[0].soldQty, 15);
  assert.equal(summary[0].returnedQty, 2);
  assert.equal(summary[0].quantity, 13);
});

test('delivery-staff SSE omits fully returned lines and never exports by customer/store', () => {
  const built = build([
    order('B001', 'GHTH', 'GH Thành Tiền Hải', [item('P02', 4, 12000, 'L1')], { customerCode:'STORE-A' })
  ], [
    { code:'RO2', salesOrderCode:'B001', returnState:'accounting_confirmed', items:[{ productCode:'P02', lineKey:'L1', returnQty:4, priceAfterPromotion:12000 }] }
  ]);
  assert.equal(built.errors.length, 0);
  assert.equal(built.rows.length, 0);
});

test('delivery-staff SSE keeps same product separate by different NVGH and flags missing catalog sale price without failing export', () => {
  const built = build([
    order('B001', 'GHTH', 'GH Thành Tiền Hải', [item('P03', 2, 1000, 'L1')]),
    order('B002', 'GHTT', 'GH Thành Thái Thụy', [item('P03', 3, 2000, 'L1')])
  ]);
  assert.equal(built.errors.length, 0);
  assert.equal(built.rows.length, 2);
  assert.deepEqual(built.rows.map((row) => [row[0].value, row[7].value, row[14], row[15], row[16]]), [
    ['GHTH', 'P03', 2, 0, 0],
    ['GHTT', 'P03', 3, 0, 0]
  ]);
  const summary = service._private.buildSseDeliveryStaffSummaryRows(built.summarySourceRows);
  assert.equal(summary.length, 2);
  assert.ok(summary.every((row) => /Thiếu giá bán trong danh mục sản phẩm/.test(row.note)));
});
