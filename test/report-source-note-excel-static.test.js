'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('ExcelInteraction report export includes source note sheet from ReportCenterService.run', () => {
  const service = read('src/services/excel/ExcelInteractionService.js');
  assert.match(service, /async function exportReport/);
  assert.match(service, /ReportCenterService\.run\(code,\s*\{[\s\S]*__exportAll:\s*true/s);
  assert.match(service, /const sourceNote = payload\.sourceNote \|\| \{\}/);
  assert.match(service, /appendReportSourceNoteSheet\(workbook, sourceNote\)/);
  assert.match(service, /THÔNG TIN NGUỒN/);
  assert.match(service, /Mã báo cáo/);
  assert.match(service, /Service/);
  assert.match(service, /Nguồn chính/);
  assert.match(service, /Quy tắc SSoT/);
  assert.match(service, /Xem và xuất cùng nguồn/);
  assert.match(service, /Trạng thái nguồn/);
});

test('legacy report bridge workbook also writes source note sheet', () => {
  const source = read('src/services/importExportLegacy.service.source/part-03.jsfrag');
  const workbook = read('src/services/importExportLegacy.service.source/part-02.jsfrag');
  assert.match(source, /ReportCenterService\.run\(reportCode/);
  assert.match(source, /__legacyBridge/);
  assert.match(source, /legacyExportType/);
  assert.match(source, /mappedReportCode/);
  assert.match(source, /bridgedToReportCenter:\s*true/);
  assert.match(workbook, /THÔNG TIN NGUỒN/);
  assert.match(source, /payload\.sourceNote/);
});
