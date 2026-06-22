'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sortProductsByNameAsc,
  sortProductsByPickingZoneThenNameAsc
} = require('../src/utils/productSort');
const { buildMasterPicking } = require('../src/domain/print/builders/MasterPickingBuilder');
const { buildReturnPicking } = require('../src/domain/print/builders/ReturnPickingBuilder');

test('sortProductsByNameAsc sorts Vietnamese product names A-Z and tie-breaks by product code', () => {
  const rows = [
    { productCode: '003', productName: 'OMO Đỏ' },
    { productCode: '001', productName: 'Comfort Xanh' },
    { productCode: '002', productName: 'Cif Kem' },
    { productCode: '004', productName: 'OMO Trắng' },
    { productCode: '000', productName: 'OMO Trắng' }
  ];

  assert.deepEqual(
    sortProductsByNameAsc(rows).map((row) => `${row.productName}|${row.productCode}`),
    [
      'Cif Kem|002',
      'Comfort Xanh|001',
      'OMO Đỏ|003',
      'OMO Trắng|000',
      'OMO Trắng|004'
    ]
  );
});

test('sortProductsByPickingZoneThenNameAsc keeps HC/PC separated and sorts ABC inside each zone', () => {
  const rows = [
    { productCode: 'P03', productName: 'OMO Đỏ', pickingZone: 'PC' },
    { productCode: 'H02', productName: 'Comfort Xanh', pickingZone: 'HC' },
    { productCode: 'H01', productName: 'Cif Kem', pickingZone: 'HC' },
    { productCode: 'P02', productName: 'Cif PC', pickingZone: 'PC' }
  ];

  assert.deepEqual(
    sortProductsByPickingZoneThenNameAsc(rows).map((row) => `${row.pickingZone}:${row.productName}`),
    ['HC:Cif Kem', 'HC:Comfort Xanh', 'PC:Cif PC', 'PC:OMO Đỏ']
  );
});

test('buildMasterPicking merges before sorting and preserves totals', () => {
  const master = { id: 'MO1', code: 'MO1', deliveryStaffCode: 'GH01' };
  const children = [{
    id: 'SO1',
    code: 'SO1',
    masterOrderCode: 'MO1',
    items: [
      { productCode: '003', productName: 'OMO Đỏ', quantity: 2, salePrice: 10000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '001', productName: 'Comfort Xanh', quantity: 1, salePrice: 20000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '002', productName: 'Cif Kem', quantity: 3, salePrice: 5000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '002', productName: 'Cif Kem', quantity: 4, salePrice: 5000, pickingZone: 'HC', conversionRate: 1 }
    ]
  }];

  const document = buildMasterPicking([master], children, { childMasterMap: new Map([['SO1', 'MO1']]) });

  assert.deepEqual(document.items.map((row) => row.productName), ['Cif Kem', 'Comfort Xanh', 'OMO Đỏ']);
  assert.equal(document.items.find((row) => row.productCode === '002').quantity, 7);
  assert.equal(document.totalQty, 10);
  assert.equal(document.totalAmount, 75000);
  assert.equal(document.itemSort, 'PRODUCT_NAME_ASC');
});

test('buildReturnPicking sorts returned product lines by ABC after merge', () => {
  const masterReturn = { id: 'MRO1', code: 'MRO1', deliveryStaffCode: 'GH01' };
  const children = [{
    id: 'RO1',
    code: 'RO1',
    items: [
      { productCode: '003', productName: 'OMO Đỏ', returnQty: 2, salePrice: 10000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '001', productName: 'Comfort Xanh', returnQty: 1, salePrice: 20000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '002', productName: 'Cif Kem', returnQty: 3, salePrice: 5000, pickingZone: 'HC', conversionRate: 1 }
    ]
  }];

  const document = buildReturnPicking(masterReturn, children, {});

  assert.deepEqual(document.items.map((row) => row.productName), ['Cif Kem', 'Comfort Xanh', 'OMO Đỏ']);
  assert.equal(document.totalQty, 6);
  assert.equal(document.totalAmount, 55000);
  assert.equal(document.itemSort, 'PRODUCT_NAME_ASC');
});


test('Excel master export source sorts SanPham rows with compareProductNameAsc', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/services/excel/ExcelInteractionService.js'), 'utf8');
  assert.match(source, /compareProductNameAsc/);
  assert.match(source, /function masterItemRows\(masters = \[\], productMap = null\)/);
  assert.match(source, /\.sort\(\(a, b\) => compareProductNameAsc\(a, b\)/);
});

test('buildImportPicking sorts aggregate import lines by ABC after merge', () => {
  const { buildImportPicking } = require('../src/domain/print/builders/ImportPickingBuilder');
  const document = buildImportPicking([{
    id: 'PN1',
    code: 'PN1',
    items: [
      { productCode: '003', productName: 'OMO Đỏ', quantity: 2, costPrice: 10000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '001', productName: 'Comfort Xanh', quantity: 1, costPrice: 20000, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '002', productName: 'Cif Kem', quantity: 3, costPrice: 5000, pickingZone: 'HC', conversionRate: 1 }
    ]
  }], {});

  assert.deepEqual(document.items.map((row) => row.productName), ['Cif Kem', 'Comfort Xanh', 'OMO Đỏ']);
  assert.equal(document.totalQty, 6);
  assert.equal(document.totalAmount, 55000);
  assert.equal(document.itemSort, 'PRODUCT_NAME_ASC');
});
