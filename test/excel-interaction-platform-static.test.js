'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('Excel Interaction routes are mounted and role-protected', () => {
  const index = read('src/routes/index.js');
  const routes = read('src/routes/excelInteractionRoutes.js');
  assert.match(index, /app\.use\('\/api\/excel',\s*excelInteractionRoutes\)/);
  assert.match(routes, /router\.post\('\/export'/);
  assert.match(routes, /router\.post\('\/import\/preview'/);
  assert.match(routes, /router\.post\('\/products\/resolve'/);
  assert.match(routes, /requireRole\(/);
});

test('Excel exports use whitelist dispatch and formula injection protection', () => {
  const service = read('src/services/excel/ExcelInteractionService.js');
  assert.match(service, /case 'SALES_ORDERS'/);
  assert.match(service, /case 'MASTER_ORDERS'/);
  assert.match(service, /case 'IMPORT_ORDERS'/);
  assert.match(service, /case 'IMPORT_PREVIEW'/);
  assert.match(service, /case 'REPORT'/);
  assert.match(service, /\^\[=\+\\-@\]/);
  assert.match(service, /hydrateSalesOrders/);
  assert.match(service, /writeWorkbook\(workbook\)/);
});

test('Pasted Excel rows reuse import preview session and normal validation flow', () => {
  const importService = read('src/services/excelImportService.js');
  assert.match(importService, /async function previewPastedRows/);
  assert.match(importService, /buildPreviewFromRows\(/);
  assert.match(importService, /createUploadedSession\(/);
  assert.match(importService, /savePreviewResult\(/);
  assert.match(importService, /Mỗi lần chỉ được dán tối đa 5\.000 dòng/);
});

test('Frontend loads spreadsheet grid, context menu and feature bindings', () => {
  const html = read('public/index.html');
  assert.match(html, /90-excel-interaction\.css/);
  assert.match(html, /ContextExport\.js/);
  assert.match(html, /SpreadsheetGrid\.js/);
  assert.match(html, /ExcelFeatureBindings\.js/);
  assert.match(html, /id="openExcelPasteImportButton"/);
  assert.match(html, /id="openSalesItemPasteButton"/);
  assert.match(html, /id="openImportItemPasteButton"/);
  assert.match(html, /id="exportSelectedMasterOrdersButton"/);
  assert.match(html, /id="exportSelectedImportOrdersButton"/);
});

test('Excel-like line paste is integrated into sales and receipt forms', () => {
  const sales = read('public/js/app/05-sales-orders.js');
  const receipts = read('public/js/app/04-import-orders.js');
  assert.match(sales, /window\.applyPastedSalesItems/);
  assert.match(sales, /recalculateSalesPromotionPrices\(\)/);
  assert.match(sales, /ExcelInteraction\.downloadWorkbook/);
  assert.match(receipts, /window\.applyPastedImportItems/);
  assert.match(receipts, /productLineMeta\(product\)/);
});

test('Report and import preview tables expose exact export context', () => {
  const reports = read('public/js/app/admin/08a-reports.js');
  const imports = read('public/js/app/admin/08d-import-excel.js');
  assert.match(reports, /window\.__reportCenterState=reportCenterState/);
  assert.match(reports, /data-report-row-index/);
  assert.match(reports, /type:'REPORT'/);
  assert.match(imports, /window\.renderImportPreviewFromExcel=renderImportPreview/);
  assert.match(imports, /data-import-row-number/);
  assert.match(imports, /window\.__importPreviewSessionId/);
});

test('Filtered report export is internal-only and capped', () => {
  const reportService = read('src/services/reports/ReportCenterService.js');
  assert.match(reportService, /query\.__exportAll === true/);
  assert.match(reportService, /50000/);
});
