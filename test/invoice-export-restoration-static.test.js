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
  assert.match(js, /waitForExportJob/);
  assert.match(js, /response\.blob\(\)/);
  assert.match(js, /artifactResponse\.blob\(\)/);
  assert.match(js, /\/api\/background-jobs\//);
  assert.doesNotMatch(js, /Prefer:'respond-async'/);
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

test('VAT TT78 export uses committed VNPT template and never rebuilds Sheet1 header dynamically', () => {
  const source = readSource('src/services/importExportLegacy.service.js');
  const templateService = read('src/services/invoice/VnptTt78TemplateExportService.js');
  const templatePath = path.join(ROOT, 'templates/vnpt/FileMauHoaDon1Thue_TT78.xlsx');

  assert.equal(fs.existsSync(templatePath), true);
  assert.match(source, /VnptTt78TemplateExportService/);
  assert.match(source, /buildVnptTt78WorkbookFromTemplate/);
  assert.doesNotMatch(source, /const workbook = createWorkbook\(\);\s*const sheetRows = \[TT78_HEADERS/s);
  assert.doesNotMatch(source, /appendAoaSheetToWorkbook\(workbook, 'Sheet1'/);

  assert.match(templateService, /validateVnptTt78Template/);
  assert.match(templateService, /TEMPLATE_RELATIVE_PATH = 'templates\/vnpt\/FileMauHoaDon1Thue_TT78\.xlsx'/);
  assert.match(templateService, /BC:\s*'mau_01'/);
  assert.match(templateService, /AD:\s*'Fkey'/);
  assert.match(templateService, /S:\s*'TyLeChietKhau'/);
  assert.doesNotMatch(`${source}\n${templateService}`, /[A-Za-z]:\\/);
  assert.doesNotMatch(source, /TyLeChietKhauHienThi|LOONo|HDSe|xVTNXHan|NVChuan|PTChuyenKhoan|HDKTTu/);
});


test('VAT TT78 export path lazy-loads ExcelJS/template and keeps report catalog lightweight', () => {
  const templateService = read('src/services/invoice/VnptTt78TemplateExportService.js');
  const importPart01 = read('src/services/importExportLegacy.service.source/part-01.jsfrag');
  const importPart02 = read('src/services/importExportLegacy.service.source/part-02.jsfrag');
  const reportService = read('src/services/reportService.js');
  const reportCenter = read('src/services/reports/ReportCenterService.js');

  assert.match(templateService, /function getExcelJS\(\)/);
  assert.doesNotMatch(templateService, /^const ExcelJS\s*=\s*require\('exceljs'\);/m);
  assert.match(templateService, /MAX_VNPT_EXPORT_ROWS/);
  assert.match(templateService, /VNPT_EXPORT_TOO_LARGE/);
  assert.match(templateService, /target\.style = source\.style \|\| \{\}/);

  assert.doesNotMatch(importPart01, /VnptTt78TemplateExportService/);
  assert.match(importPart02, /require\('\.\/invoice\/VnptTt78TemplateExportService'\)/);
  assert.match(reportService, /load report modules only when a/);
  assert.match(reportService, /Object\.defineProperty\(facade, method/);
  assert.match(reportCenter, /function getSalesReportService\(\)/);
  assert.doesNotMatch(reportCenter, /^const SalesReportService\s*=\s*require\('\.\/SalesReportService'\);/m);
});
