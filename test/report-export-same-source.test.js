'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('UI and Excel report export both use ReportCenterService.run/reportCode', () => {
  const ui = read('public/js/app/admin/08a-reports.js');
  const excel = read('src/services/excel/ExcelInteractionService.js');
  assert.ok(ui.includes('fetchJson(`/api/reports/run/${encodeURIComponent(requestCode)}?'));
  assert.match(ui, /downloadWorkbook\(\{type:\s*'REPORT',scope:\s*'FILTERED',reportCode/);
  assert.match(excel, /ReportCenterService\.run\(code,\s*\{[\s\S]*__exportAll:\s*true/s);
});

test('legacy business export is bridged to Report Center and no BUSINESS_REPORT_BUILDERS remain', () => {
  const legacy = read('src/services/importExportLegacy.service.source/part-03.jsfrag');
  const generated = read('src/services/importExportLegacy.service.js');
  assert.equal(/BUSINESS_REPORT_BUILDERS/.test(legacy), false);
  assert.equal(/BUSINESS_REPORT_BUILDERS/.test(generated), false);
  assert.match(legacy, /reportCodeForLegacyExport\(normalizedType\)/);
  assert.match(legacy, /buildReportCenterWorkbook\(reportCode, \{ \.\.\.query, __legacyExportType: normalizedType \}, currentUser\)/);
  assert.match(legacy, /ReportCenterService\.run\(reportCode/);
});
