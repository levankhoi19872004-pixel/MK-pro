'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const readXlsxFile = require('read-excel-file/node');

function queryResult(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => rows,
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
    catch(reject) { return Promise.resolve(rows).catch(reject); },
    finally(handler) { return Promise.resolve(rows).finally(handler); }
  };
}
function fakeModel(rows) {
  return { find() { return queryResult(rows); } };
}
function sheetRows(workbook, name) {
  const sheet = workbook.find((entry) => entry.sheet === name);
  assert.ok(sheet, `Thiếu sheet ${name}`);
  return sheet.data;
}
function text(value) {
  return value && value.__excelCell ? value.value : value;
}

function salesItem(productCode, quantity, price = 10800) {
  return { productCode, productName: `Sản phẩm ${productCode}`, quantity, finalPrice: price, amount: quantity * price, baseUnit: 'Gói' };
}
function salesOrder(code, items, vatInvoiceRequired = true, customerCode = 'C01') {
  return {
    _id: `mongo-${code}`, id: code, code, orderDate: '2026-06-19', status: 'delivered',
    customerCode, customerName: `Khách ${customerCode}`, salesStaffCode: '35128', vatInvoiceRequired,
    items, totalAmount: items.reduce((sum, row) => sum + row.amount, 0)
  };
}
function returnOrder(code, salesOrderCode, items, returnState = 'accounting_confirmed') {
  return {
    _id: `mongo-${code}`, id: code, code, salesOrderCode, returnState,
    updatedAt: '2026-06-20T00:00:00.000Z',
    items: items.map(([productCode, returnQty]) => ({ productCode, returnQty }))
  };
}

test('VAT and SSE omit fully returned orders and retain only positive net product rows', async () => {
  const orders = [
    salesOrder('SO-FULL-ONE', [salesItem('A', 10)]),
    salesOrder('SO-FULL-MULTI', [salesItem('A', 10), salesItem('B', 5)]),
    salesOrder('SO-PARTIAL', [salesItem('A', 10), salesItem('B', 5)]),
    salesOrder('SO-CANCELLED-RETURN', [salesItem('A', 10)]),
    salesOrder('SO-NONVAT', [salesItem('C', 4, 10000)], false, 'C02')
  ];
  const returns = [
    returnOrder('RO-FULL-ONE', 'SO-FULL-ONE', [['A', 10]]),
    returnOrder('RO-MULTI-1', 'SO-FULL-MULTI', [['A', 4], ['B', 2]]),
    returnOrder('RO-MULTI-2', 'SO-FULL-MULTI', [['A', 6], ['B', 3]]),
    returnOrder('RO-PARTIAL', 'SO-PARTIAL', [['A', 10], ['B', 2]]),
    returnOrder('RO-VALID', 'SO-CANCELLED-RETURN', [['A', 5]]),
    returnOrder('RO-CANCELLED', 'SO-CANCELLED-RETURN', [['A', 5]], 'cancelled')
  ];
  const customers = [
    { code: 'C01', name: 'Khách C01', sseCustomerCode: '000001' },
    { code: 'C02', name: 'Khách C02', sseCustomerCode: '000002' }
  ];
  const products = [
    { code: 'A', name: 'Sản phẩm A', baseUnit: 'Gói', conversionRate: 24, salePrice: 10800, sseProductCode: '000101' },
    { code: 'B', name: 'Sản phẩm B', baseUnit: 'Gói', conversionRate: 12, salePrice: 10800, sseProductCode: '000102' },
    { code: 'C', name: 'Sản phẩm C', baseUnit: 'Gói', conversionRate: 10, salePrice: 10000, sseProductCode: '000103' }
  ];

  const replacements = [
    ['../src/models/SalesOrder', fakeModel(orders)],
    ['../src/models/ReturnOrder', fakeModel(returns)],
    ['../src/models/Customer', fakeModel(customers)],
    ['../src/models/Product', fakeModel(products)]
  ];
  const saved = new Map();
  for (const [request, exportsValue] of replacements) {
    const resolved = require.resolve(request);
    saved.set(resolved, require.cache[resolved]);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
  }

  const servicePath = require.resolve('../src/services/importExportLegacy.service');
  const queryPath = require.resolve('../src/services/invoiceExportQuery.service');
  const ssePath = require.resolve('../src/services/sseInvoiceExport.service');
  const savedModules = new Map([[servicePath, require.cache[servicePath]], [queryPath, require.cache[queryPath]], [ssePath, require.cache[ssePath]]]);
  [servicePath, queryPath, ssePath].forEach((path) => delete require.cache[path]);

  try {
    const service = require(servicePath);
    const query = { dateFrom: '2026-06-19', dateTo: '2026-06-19', limit: 100 };
    const vat = await service.exportToExcel('invoice-orders', { ...query, invoiceType: 'VAT' });
    const sse = await service.exportToExcel('sse-invoice-orders', { ...query, invoiceType: 'ALL' });

    assert.ok(Buffer.isBuffer(vat.buffer));
    assert.ok(Buffer.isBuffer(sse.buffer));
    assert.equal(vat.orderCount, 2);
    assert.equal(vat.rows, 2);
    assert.equal(sse.orderCount, 3);
    assert.equal(sse.rows, 3);

    const vatBook = await readXlsxFile(vat.buffer);
    const vatRows = sheetRows(vatBook, 'Sheet1');
    const vatHeader = vatRows[0];
    const fkeyIndex = vatHeader.indexOf('Fkey');
    const productIndex = vatHeader.indexOf('MaSanPham');
    const quantityIndex = vatHeader.indexOf('SoLuong');
    const vatData = vatRows.slice(1).map((row) => ({ order: row[fkeyIndex], product: row[productIndex], qty: row[quantityIndex] }));
    assert.deepEqual(vatData.sort((a,b)=>a.order.localeCompare(b.order)), [
      { order: 'SO-CANCELLED-RETURN', product: 'A', qty: 5 },
      { order: 'SO-PARTIAL', product: 'B', qty: 3 }
    ]);
    assert.equal(vatRows.flat().includes('SO-FULL-ONE'), false);
    assert.equal(vatRows.flat().includes('SO-FULL-MULTI'), false);

    const sseBook = await readXlsxFile(sse.buffer);
    const sseRows = sheetRows(sseBook, 'TỔNG');
    const sseData = sseRows.slice(5).filter((row) => row.some((value) => value !== null && value !== '')).map((row) => ({
      customer: text(row[0]), order: text(row[3]), product: text(row[7]), qty: row[14]
    }));
    assert.deepEqual(sseData.sort((a,b)=>a.order.localeCompare(b.order)), [
      { customer: '000001', order: 'SO-CANCELLED-RETURN', product: '000101', qty: 5 },
      { customer: '000002', order: 'SO-NONVAT', product: '000103', qty: 4 },
      { customer: '000001', order: 'SO-PARTIAL', product: '000102', qty: 3 }
    ]);
    assert.equal(sseRows.flat().includes('SO-FULL-ONE'), false);
    assert.equal(sseRows.flat().includes('SO-FULL-MULTI'), false);
  } finally {
    [servicePath, queryPath, ssePath].forEach((path) => delete require.cache[path]);
    for (const [path, entry] of savedModules) if (entry) require.cache[path] = entry;
    for (const [resolved, entry] of saved) {
      if (entry) require.cache[resolved] = entry;
      else delete require.cache[resolved];
    }
  }
});
