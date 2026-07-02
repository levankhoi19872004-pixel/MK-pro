'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Report Center frontend export uses ExcelInteraction REPORT/reportCode, not /api/export business URL', () => {
  const js = read('public/js/app/admin/08a-reports.js');
  const html = read('public/fragments/index/05-index-body.html');
  assert.equal(js.includes('/api/export/'), false);
  assert.match(js, /ExcelInteraction\.downloadWorkbook\(\{\s*type:\s*'REPORT'[\s\S]*reportCode/s);
  assert.match(js, /report-export-btn\[data-report-code\]/);
  assert.equal(html.includes('data-report-type='), false);
  assert.match(html, /data-report-code="sales-detail"/);
  assert.match(html, /data-report-code="delivery-by-staff"/);
});

test('ExcelInteractionService exportReport delegates to ReportCenterService.run', () => {
  const service = read('src/services/excel/ExcelInteractionService.js');
  assert.match(service, /async function exportReport/);
  assert.match(service, /ReportCenterService\.run\(code,\s*\{[\s\S]*__exportAll:\s*true/s);
});

test('REPORT export context uses canonical reportCode and not legacy exportType', () => {
  const js = read('public/js/app/admin/08a-reports.js');
  assert.match(js, /downloadWorkbook\(\{type:\s*'REPORT',scope:\s*'FILTERED',reportCode/);
  assert.equal(/exportType/.test(js), false);
});
