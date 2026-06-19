'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('import hàng thiếu được lưu thành báo cáo bền vững và có API đối soát', () => {
  const service = read('src/services/import/importCommit.impl.js');
  const reportService = read('src/services/importShortageReportService.js');
  const routes = read('src/routes/importExportRoutes.js');
  const model = read('src/models/ImportShortageReport.js');

  assert.match(service, /saveFromImport\(/);
  assert.match(service, /shortageReportSaved/);
  assert.match(reportService, /findOneAndUpdate/);
  assert.match(reportService, /importSessionId/);
  assert.match(routes, /\/shortage-reports/);
  assert.match(routes, /importRouter\.patch\('\/shortage-reports\/:id'/);
  assert.match(model, /collection: 'import_shortage_reports'/);
  assert.match(model, /reconciliationStatus/);
});

test('giao diện có danh sách báo cáo, chi tiết, lưu đối soát và tải CSV', () => {
  const html = read('public/fragments/index/06-index-body.html');
  const script = read('public/js/app/admin/08d-import-excel.source/part-03.jsfrag');

  assert.match(html, /id="importShortageReportTable"/);
  assert.match(html, /id="importShortageReportModal"/);
  assert.match(script, /loadImportShortageReports/);
  assert.match(script, /saveImportShortageReport/);
  assert.match(script, /downloadActiveImportShortageReport/);
});
