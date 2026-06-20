'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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

function fakeModel(rows = []) {
  return { find() { return queryResult(rows); } };
}

test('invoice export defaults to single tenant unless TENANT_MODE is explicitly multi', () => {
  const service = require('../src/services/invoiceExportQuery.service');
  const previous = process.env.TENANT_MODE;
  try {
    delete process.env.TENANT_MODE;
    const singleFilter = service.buildInvoiceOrderMongoFilter(
      { dateFrom: '2026-06-18', dateTo: '2026-06-18' },
      { invoiceGroup: 'VAT', currentUser: { tenantId: 'TENANT-A' } }
    );
    assert.equal(JSON.stringify(singleFilter).includes('TENANT-A'), false);

    process.env.TENANT_MODE = 'multi';
    const multiFilter = service.buildInvoiceOrderMongoFilter(
      { dateFrom: '2026-06-18', dateTo: '2026-06-18' },
      { invoiceGroup: 'VAT', currentUser: { tenantId: 'TENANT-A' } }
    );
    assert.equal(JSON.stringify(multiFilter).includes('TENANT-A'), true);
  } finally {
    if (previous === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = previous;
  }
});

test('VAT and NON_VAT exports return a clear no-data response instead of a blank workbook', async () => {
  const replacements = [
    ['../src/models/SalesOrder', fakeModel([])],
    ['../src/models/ReturnOrder', fakeModel([])],
    ['../src/models/Customer', fakeModel([])],
    ['../src/models/Product', fakeModel([])]
  ];
  const saved = new Map();
  for (const [request, exportsValue] of replacements) {
    const resolved = require.resolve(request);
    saved.set(resolved, require.cache[resolved]);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
  }

  const servicePath = require.resolve('../src/services/importExportLegacy.service');
  const queryServicePath = require.resolve('../src/services/invoiceExportQuery.service');
  const savedService = require.cache[servicePath];
  const savedQueryService = require.cache[queryServicePath];
  delete require.cache[servicePath];
  delete require.cache[queryServicePath];

  try {
    const service = require(servicePath);
    const query = { dateFrom: '2026-06-18', dateTo: '2026-06-18' };
    const vat = await service.exportToExcel('invoice-orders', { ...query, invoiceType: 'VAT' }, { tenantId: 'TENANT-A' });
    const nonVat = await service.exportToExcel('invoice-orders', { ...query, invoiceType: 'NON_VAT' }, { tenantId: 'TENANT-A' });

    for (const result of [vat, nonVat]) {
      assert.equal(result.status, 404);
      assert.equal(result.code, 'INVOICE_EXPORT_NO_DATA');
      assert.equal(Buffer.isBuffer(result.buffer), false);
      assert.match(result.error, /Không có đơn/);
    }
  } finally {
    delete require.cache[servicePath];
    delete require.cache[queryServicePath];
    if (savedService) require.cache[servicePath] = savedService;
    if (savedQueryService) require.cache[queryServicePath] = savedQueryService;
    for (const [resolved, entry] of saved) {
      if (entry) require.cache[resolved] = entry;
      else delete require.cache[resolved];
    }
  }
});

test('frontend refuses to save an invoice workbook whose row-count header is zero', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../public/js/app/admin/08f-vat-export.js'),
    'utf8'
  );
  assert.match(source, /x-export-row-count/);
  assert.match(source, /rowCountHeader!==''&&Number\(rowCountHeader\)===0/);
  assert.match(source, /File trống đã được chặn tải xuống/);
});
