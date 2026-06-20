'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const readSource = require('./helpers/sourceBundle.util').readSource;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('report screen visibly exposes the two independent invoice exports', () => {
  const html = read('public/fragments/index/05-index-body.html');
  assert.match(html, />Xuất hóa đơn VAT<\/button>/);
  assert.match(html, />Xuất hóa đơn không VAT<\/button>/);
  assert.equal((html.match(/id="exportVatInvoiceTT78Button"/g) || []).length, 1);
  assert.equal((html.match(/id="exportVatNonInvoiceOrdersButton"/g) || []).length, 1);
  assert.ok(html.indexOf('exportVatInvoiceTT78Button') < html.indexOf('<details class="card report-export-card'));
  assert.ok(html.indexOf('exportVatNonInvoiceOrdersButton') < html.indexOf('<details class="card report-export-card'));
});

test('frontend uses one validated endpoint, loading state and Blob download without page reload', () => {
  const js = read('public/js/app/admin/08f-vat-export.js');
  assert.match(js, /\/api\/export\/invoice-orders\.xlsx/);
  assert.match(js, /invoiceType/);
  assert.match(js, /exportInFlight/);
  assert.match(js, /response\.blob\(\)/);
  assert.match(js, /aria-busy/);
  assert.doesNotMatch(js, /window\.location(?:\.href)?\s*=/);
  assert.doesNotMatch(js, /exportReportExcel\(/);
});

test('backend keeps legacy aliases and adds unified invoice export validation', () => {
  const source = readSource('src/services/importExportLegacy.service.js');
  assert.match(source, /invoice-orders/);
  assert.match(source, /invoiceType chỉ nhận VAT hoặc NON_VAT/);
  assert.match(source, /vatInvoiceTT78/);
  assert.match(source, /vat-non-invoice-orders/);
  assert.match(source, /invoiceExportQueryService/);
  assert.match(source, /loadInvoiceExportData/);
  assert.match(source, /resolveInvoiceType/);
});

test('router remains authenticated and role-scoped through the existing export namespace', () => {
  const routes = read('src/routes/importExportRoutes.js');
  const mount = read('src/routes/index.js');
  assert.match(routes, /const viewExports = requireRole\(\['admin', 'manager', 'accountant', 'warehouse'\]\)/);
  assert.match(routes, /exportRouter\.use\(viewExports\)/);
  assert.match(routes, /exportRouter\.get\('\/:type\.xlsx', controller\.exportExcel\)/);
  assert.match(mount, /app\.use\('\/api\/export', exportRouter\)/);
});

test('invoice exports are generated dynamically and do not depend on platform-specific template paths', () => {
  const source = readSource('src/services/importExportLegacy.service.js');
  assert.match(source, /createWorkbook\(\)/);
  assert.match(source, /writeWorkbook\(workbook\)/);
  assert.doesNotMatch(source, /[A-Za-z]:\\/);
  assert.doesNotMatch(source, /Invoice[-_].*\.xlsx/i);
});
