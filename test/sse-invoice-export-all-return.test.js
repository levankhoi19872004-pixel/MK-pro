'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/sseInvoiceExport.service');

function cellValue(value) { return value && value.__excelCell ? value.value : value; }

function config() {
  return {
    sheetName:'TỔNG', invoiceType:'3', invoiceSymbol:'01_010824', warehouseCode:'TP0101', currencyCode:'Vnd', exchangeRate:1,
    taxCode:'00', debitAccount:'13111', revenueAccount:'51111', cogsAccount:'63211', outputTaxAccount:'333111', discountAccount:'13121',
    defaultSalesmanCode:'BANBUON', vatRate:0.08, allowCanonicalCustomerCodeFallback:true, allowCanonicalProductCodeFallback:true, maxRows:100000
  };
}
function order(code, vatInvoiceRequired, items, customerCode='KH1') {
  return { id:code, code, orderDate:'2026-06-10', customerCode, customerName:`Khách ${customerCode}`, salesStaffCode:'35128', vatInvoiceRequired, status:'delivered', items };
}
function item(code, qty, price, lineKey) {
  return { productCode:code, productName:`SP ${code}`, quantity:qty, priceAfterPromotion:price, baseUnit:'Gói', lineKey };
}
function returnOrder(code, salesOrderCode, productCode, qty, state='accounting_confirmed', lineKey='') {
  return { code, salesOrderCode, returnState:state, updatedAt:'2026-06-12T00:00:00.000Z', items:[{ productCode, returnQty:qty, lineKey }] };
}
const customers=[
  { code:'KH1', name:'Khách KH1', sseCustomerCode:'000001' },
  { code:'KH2', name:'Khách KH2', sseCustomerCode:'000002' }
];
const products=[
  { code:'SP1', name:'SP SP1', baseUnit:'Gói', sseProductCode:'000101' },
  { code:'SP2', name:'SP SP2', baseUnit:'Gói', sseProductCode:'000102' }
];

test('SSE ALL includes VAT and NON_VAT orders and every remaining product line', () => {
  const built=service.buildSseRows({
    orders:[order('VAT-1',true,[item('SP1',10,108,'L1'),item('SP2',5,216,'L2')]),order('NON-1',false,[item('SP1',3,100,'L3')],'KH2')],
    returnOrders:[],customers,products,invoiceType:'ALL',config,configByType:{VAT:config(),NON_VAT:config()}
  });
  assert.equal(built.errors.length,0);
  assert.equal(built.rows.length,3);
  assert.equal(built.orderCount,2);
  assert.deepEqual(built.rows.map(row=>cellValue(row[3])),['VAT-1','VAT-1','NON-1']);
});

test('SSE subtracts multiple confirmed returns once; draft/cancelled/received returns are ignored', () => {
  const returns=[
    returnOrder('RO1','SO1','SP1',2,'accounting_confirmed','L1'),
    returnOrder('RO2','SO1','SP1',3,'posted_to_ar','L1'),
    returnOrder('RO3','SO1','SP1',50,'draft','L1'),
    returnOrder('RO4','SO1','SP1',50,'received','L1'),
    returnOrder('RO5','SO1','SP1',50,'cancelled','L1'),
    { ...returnOrder('RO2','SO1','SP1',3,'posted_to_ar','L1'), _id:'duplicate-copy', updatedAt:'2026-06-11T00:00:00.000Z' }
  ];
  const built=service.buildSseRows({orders:[order('SO1',true,[item('SP1',10,108,'L1')])],returnOrders:returns,customers,products,invoiceType:'ALL',config,configByType:{VAT:config(),NON_VAT:config()}});
  assert.equal(built.errors.length,0);
  assert.equal(built.rows.length,1);
  assert.equal(built.rows[0][14],5);
});

test('full return removes product/order; over-return never creates a negative row and records a warning', () => {
  const fullyReturned=service.buildSseRows({orders:[order('SO-FULL',true,[item('SP1',10,108,'L1')])],returnOrders:[returnOrder('RO-FULL','SO-FULL','SP1',10,'accounting_confirmed','L1')],customers,products,invoiceType:'ALL',config,configByType:{VAT:config(),NON_VAT:config()}});
  assert.equal(fullyReturned.rows.length,0);
  assert.equal(fullyReturned.orderCount,0);

  const overReturned=service.buildSseRows({orders:[order('SO-OVER',false,[item('SP1',10,100,'L1')])],returnOrders:[returnOrder('RO-OVER','SO-OVER','SP1',15,'accounting_confirmed','L1')],customers,products,invoiceType:'ALL',config,configByType:{VAT:config(),NON_VAT:config()}});
  assert.equal(overReturned.rows.length,0);
  assert.equal(overReturned.warnings.length,1);
  assert.match(overReturned.warnings[0]['Nguyên nhân'],/15/);
});

test('same product in different orders/customers remains separate and is never grouped by name', () => {
  const built=service.buildSseRows({orders:[order('SO-A',true,[item('SP1',2,108,'A')],'KH1'),order('SO-B',false,[item('SP1',4,100,'B')],'KH2')],returnOrders:[],customers,products,invoiceType:'ALL',config,configByType:{VAT:config(),NON_VAT:config()}});
  assert.equal(built.rows.length,2);
  assert.deepEqual(built.rows.map(row=>[cellValue(row[0]),cellValue(row[3]),cellValue(row[7]),row[14]]),[['000001','SO-A','000101',2],['000002','SO-B','000101',4]]);
});
