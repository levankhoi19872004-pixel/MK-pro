'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Phase32 information report definitions expose category, dateMode none and dynamic filters', () => {
  const source = read('src/services/reports/ReportCenterService.js');
  for (const code of ['info-products', 'info-customers', 'info-staffs']) {
    assert.match(source, new RegExp(`code:\\s*'${code}'`));
    const blockStart = source.indexOf(`code: '${code}'`);
    const block = source.slice(blockStart, source.indexOf('columns:', blockStart));
    assert.match(block, /category:\s*'information'/);
    assert.match(block, /dateMode:\s*'none'/);
    assert.match(block, /filters:\s*\[/);
  }
  assert.match(source, /filters:\s*definition\.filters\s*\|\|\s*\[\]/);
  assert.match(source, /key:\s*'code'/);
  assert.match(source, /key:\s*'salesStaff'/);
});

test('Phase32 information service keeps AR as customer debt source and staff report is null-safe', () => {
  const source = read('src/services/reports/InformationReportService.js');
  assert.match(source, /ArLedger\.aggregate\(\[/);
  assert.match(source, /customerDebtMap\(codes\)/);
  assert.match(source, /if \(!staffRows\.length\)/);
  assert.match(source, /inactiveCount:\s*0/);
  assert.match(source, /userQueryParts\.length \? await User\.find/);
  assert.match(source, /query\.phone/);
  assert.match(source, /query\.salesStaff/);
});

test('Phase32 report center frontend hides date filters, renders dynamic filters, detail drawer and sort', () => {
  const fragment = read('public/fragments/index/05-index-body.html');
  const state = read('public/js/app/state/00c-admin-system-state.js');
  const frontend = read('public/js/app/admin/08a-reports.js');

  assert.match(fragment, /id="reportDynamicFilters"/);
  assert.match(fragment, /id="reportRowDetailDrawer"/);
  assert.match(state, /const reportDynamicFilters=document\.getElementById\('reportDynamicFilters'\)/);
  assert.match(state, /const reportRowDetailDrawer=document\.getElementById\('reportRowDetailDrawer'\)/);

  assert.match(frontend, /definition\?\.dateMode==='none'/);
  assert.match(frontend, /renderReportDynamicFilters\(definition\)/);
  assert.match(frontend, /collectReportDynamicFilters\(\)/);
  assert.match(frontend, /data-report-filter-key/);
  assert.match(frontend, /openReportRowDetail\(rowIndex\)/);
  assert.match(frontend, /data-report-sort-key/);
  assert.match(frontend, /reportCenterState\.sortKey/);
});
