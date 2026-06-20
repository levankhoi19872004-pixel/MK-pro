'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const readXlsxFile = require('read-excel-file/node');

function queryResult(rows, capture) {
  return {
    sort() { return this; },
    limit() { return this; },
    lean: async () => rows,
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
    catch(reject) { return Promise.resolve(rows).catch(reject); },
    finally(handler) { return Promise.resolve(rows).finally(handler); },
    _capture: capture
  };
}

function fakeModel(rows, captures) {
  return {
    find(filter) {
      captures.push(filter);
      return queryResult(rows, captures);
    }
  };
}

function sheetRows(workbook, name) {
  const sheet = workbook.find((entry) => entry.sheet === name);
  assert.ok(sheet, `Thiếu sheet ${name}`);
  return sheet.data;
}

function columnValues(rows, header) {
  const index = rows[0].indexOf(header);
  assert.notEqual(index, -1, `Thiếu cột ${header}`);
  return rows.slice(1).map((row) => row[index]).filter((value) => value !== null && value !== '');
}

test('unified invoice export produces valid, disjoint VAT and NON_VAT workbooks', async () => {
  const orders = [
    {
      _id: 'mongo-vat-old', id: 'VAT-OLD', code: 'VAT-OLD', orderDate: '2026-06-20',
      customerCode: 'C01', customerName: 'Khách VAT cũ', status: 'pending',
      items: [{ productCode: 'P01', productName: 'Sản phẩm 1', quantity: 2, finalPrice: 10800, amount: 21600 }],
      totalAmount: 21600
    },
    {
      _id: 'mongo-vat-dms', id: 'VAT-DMS', code: 'VAT-DMS', orderDate: '2026-06-20',
      customerCode: 'C02', customerName: 'Khách VAT DMS', status: 'pending', source: 'DMS', vatInvoiceRequired: true,
      items: [{ productCode: 'P01', productName: 'Sản phẩm 1', quantity: 1, finalPrice: 10800, amount: 10800 }],
      totalAmount: 10800
    },
    {
      _id: 'mongo-non-bool', id: 'NON-BOOL', code: 'NON-BOOL', orderDate: '2026-06-20',
      customerCode: 'C03', customerName: 'Khách không VAT', status: 'pending', vatInvoiceRequired: false,
      items: [{ productCode: 'P01', productName: 'Sản phẩm 1', quantity: 1, finalPrice: 10800, amount: 10800 }],
      totalAmount: 10800
    },
    {
      _id: 'mongo-non-string', id: 'NON-STRING', code: 'NON-STRING', orderDate: '2026-06-20',
      customerCode: 'C04', customerName: 'Khách dữ liệu cũ', status: 'pending', vatInvoiceRequired: 'false',
      items: [{ productCode: 'P01', productName: 'Sản phẩm 1', quantity: 1, finalPrice: 10800, amount: 10800 }],
      totalAmount: 10800
    },
    {
      _id: 'mongo-cancel', id: 'CANCELLED', code: 'CANCELLED', orderDate: '2026-06-20',
      customerCode: 'C05', status: 'pending', lifecycleStatus: 'cancelled', vatInvoiceRequired: true,
      items: [{ productCode: 'P01', quantity: 1, finalPrice: 10800 }]
    },
    {
      _id: 'mongo-delete', id: 'DELETED', code: 'DELETED', orderDate: '2026-06-20',
      customerCode: 'C06', status: 'pending', isDeleted: '1', vatInvoiceRequired: false,
      items: [{ productCode: 'P01', quantity: 1, finalPrice: 10800 }]
    }
  ];
  const products = [{ code: 'P01', name: 'Sản phẩm 1', conversionRate: 24, salePrice: 12000, baseUnit: 'gói' }];
  const customers = orders.map((order) => ({ code: order.customerCode, name: order.customerName }));
  const captures = { orders: [], returns: [], customers: [], products: [] };
  const replacements = [
    ['../src/models/SalesOrder', fakeModel(orders, captures.orders)],
    ['../src/models/ReturnOrder', fakeModel([], captures.returns)],
    ['../src/models/Customer', fakeModel(customers, captures.customers)],
    ['../src/models/Product', fakeModel(products, captures.products)]
  ];
  const saved = new Map();
  for (const [request, exportsValue] of replacements) {
    const resolved = require.resolve(request);
    saved.set(resolved, require.cache[resolved]);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
  }

  const servicePath = require.resolve('../src/services/importExportLegacy.service');
  delete require.cache[servicePath];
  try {
    const service = require(servicePath);
    const invalid = await service.exportToExcel('invoice-orders', { invoiceType: 'OTHER' });
    assert.equal(invalid.status, 400);

    const query = { dateFrom: '2026-06-20', dateTo: '2026-06-20', limit: 100 };
    const vat = await service.exportToExcel('invoice-orders', { ...query, invoiceType: 'VAT' });
    const nonVat = await service.exportToExcel('invoice-orders', { ...query, invoiceType: 'NON_VAT' });

    assert.ok(Buffer.isBuffer(vat.buffer));
    assert.ok(Buffer.isBuffer(nonVat.buffer));
    assert.equal(vat.buffer.subarray(0, 2).toString(), 'PK');
    assert.equal(nonVat.buffer.subarray(0, 2).toString(), 'PK');
    assert.match(vat.fileName, /^Hoa_don_VAT_TT78_/);
    assert.match(nonVat.fileName, /^Hoa_don_khong_VAT_/);

    const vatWorkbook = await readXlsxFile(vat.buffer);
    const nonVatWorkbook = await readXlsxFile(nonVat.buffer);
    const vatSheet = sheetRows(vatWorkbook, 'Sheet1');
    const vatAudit = sheetRows(vatWorkbook, 'DoiChieu');
    const nonVatOrders = sheetRows(nonVatWorkbook, 'DanhSachDon');
    const nonVatDetails = sheetRows(nonVatWorkbook, 'ChiTietHang');

    const vatIds = new Set(columnValues(vatSheet, 'Fkey'));
    const nonVatIds = new Set(columnValues(nonVatOrders, 'Mã đơn'));
    assert.deepEqual([...vatIds].sort(), ['VAT-DMS', 'VAT-OLD']);
    assert.deepEqual([...nonVatIds].sort(), ['NON-BOOL', 'NON-STRING']);
    assert.equal([...vatIds].some((id) => nonVatIds.has(id)), false);
    assert.equal(vatIds.size + nonVatIds.size, 4);

    assert.notEqual(vatAudit[0].indexOf('Quy cách'), -1);
    assert.notEqual(vatAudit[0].indexOf('Giá bán'), -1);
    assert.notEqual(nonVatDetails[0].indexOf('Quy cách'), -1);
    assert.notEqual(nonVatDetails[0].indexOf('Giá bán'), -1);
    assert.equal(vatAudit.flat().includes(undefined), false);
    assert.equal(nonVatDetails.flat().some((value) => Number.isNaN(value)), false);

    const serializedFilters = JSON.stringify(captures.orders);
    assert.match(serializedFilters, /\$expr/);
    assert.match(serializedFilters, /vatInvoiceRequired/);
    assert.match(serializedFilters, /2026-06-19T17:00:00\.000Z/);
    assert.match(serializedFilters, /2026-06-20T16:59:59\.999Z/);
  } finally {
    delete require.cache[servicePath];
    for (const [resolved, entry] of saved) {
      if (entry) require.cache[resolved] = entry;
      else delete require.cache[resolved];
    }
  }
});
