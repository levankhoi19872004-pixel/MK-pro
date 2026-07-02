'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Report Center UI renders source note block and details', () => {
  const js = read('public/js/app/admin/08a-reports.js');
  assert.match(js, /function renderReportSourceNote/);
  assert.match(js, /report-source-note/);
  assert.match(js, /Nguồn dữ liệu/);
  assert.match(js, /Chi tiết nguồn/);
  assert.match(js, /sourceNote/);
  assert.match(js, /sourceStatus/);
  assert.match(js, /renderReportSourceNote\(payload\.sourceNote\|\|\{\}\)/);
});

test('Report Center UI does not call legacy /api/export business report endpoint', () => {
  const js = read('public/js/app/admin/08a-reports.js');
  assert.equal(js.includes('/api/export/'), false);
  assert.match(js, /ExcelInteraction\.downloadWorkbook\(\{type:\s*'REPORT',scope:\s*'FILTERED',reportCode/);
});
