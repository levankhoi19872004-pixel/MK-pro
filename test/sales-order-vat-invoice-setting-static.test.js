'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('sales orders default to VAT invoice required across creation sources', () => {
  assert.match(read('src/services/orderLegacy.service.js'), /vatInvoiceRequired/);
  assert.match(read('src/services/mobile/sales.service.js'), /vatInvoiceRequired:\s*true/);
  assert.match(read('src/services/mobileService.js'), /vatInvoiceRequired:\s*true/);
  assert.match(read('src/services/excelImportService.js'), /vatInvoiceRequired:\s*true/);
});

test('VAT setting uses isolated patch endpoint and does not call stock reverse posting', () => {
  const service = read('src/services/orderLegacy.service.js');
  const start = service.indexOf('async function updateVatInvoiceSetting');
  const end = service.indexOf('async function cancelOrder', start);
  const block = service.slice(start, end);
  assert.match(block, /patchByIdentity/);
  assert.doesNotMatch(block, /reverseSalesOrderPosting|applySalesOrderPosting|syncReturnDraftWithSalesOrder/);
  const routes = read('src/routes/orderRoutes.js');
  assert.match(routes, /vat-invoice-setting/);
  assert.match(routes, /requireRole\(\['admin', 'accountant'\]\)/);
});

test('VAT TT78 includes old orders and excludes explicit false orders', () => {
  const source = read('src/services/importExportLegacy.service.js');
  assert.match(source, /order\.vatInvoiceRequired !== false/);
  assert.match(source, /vatInvoiceRequired:\s*\{\s*\$ne:\s*false\s*\}/);
  assert.match(source, /buildVatNonInvoiceOrdersWorkbook/);
  assert.match(source, /vat-non-invoice-orders/);
  const orderService = read('src/services/orderLegacy.service.js');
  assert.match(orderService, /vatInvoiceRequired:\s*1/);
  assert.match(orderService, /vatInvoiceRequired:\s*order\.vatInvoiceRequired !== false/);
});
