'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = require('./helpers/sourceBundle.util').readSource('src/services/reports/ReportCenterService.js');
const controller = require('./helpers/sourceBundle.util').readSource('src/controllers/reportController.js');
const routes = require('./helpers/sourceBundle.util').readSource('src/routes/reportRoutes.js');
const html = require('./helpers/sourceBundle.util').readSource('public/index.html');
const client = require('./helpers/sourceBundle.util').readSource('public/js/app/admin/08a-reports.js');

const expectedReports = [
  'sales-kpi', 'sales-by-day', 'sales-by-staff', 'sales-by-customer', 'sales-by-product', 'sales-detail',
  'inventory-current', 'inventory-movement', 'stock-card', 'debt-current', 'debt-period', 'debt-ledger', 'rewards-by-customer',
  'delivery-by-staff', 'delivery-trips', 'finance-ledger', 'finance-accounts', 'returns-detail', 'data-quality'
];

test('Report Center exposes a governed report catalog with all P0/P1 domains', () => {
  for (const code of expectedReports) assert.match(service, new RegExp(`code:\\s*'${code}'`));
  assert.match(service, /const BUSINESS_ROLES/);
  assert.match(service, /function assertAccess/);
  assert.match(service, /REPORT_FORBIDDEN/);
});

test('Report Center routes are additive and preserve legacy report endpoints', () => {
  assert.match(routes, /\/reports\/catalog/);
  assert.match(routes, /\/reports\/overview/);
  assert.match(routes, /\/reports\/run\/:code/);
  assert.match(routes, /router\.get\('\/reports\/sales'/);
  assert.match(routes, /router\.get\('\/reports\/stock'/);
  assert.match(controller, /maxDays:\s*366/);
});

test('Report Center UI renders data instead of resetting KPI values to zero', () => {
  assert.match(html, /id="reportCatalog"/);
  assert.match(html, /id="reportTableHead"/);
  assert.match(html, /id="reportTableBody"/);
  assert.match(html, /id="reportChart"/);
  assert.match(html, /id="reportAlertStrip"/);
  assert.match(client, /\/api\/reports\/catalog/);
  assert.match(client, /\/api\/reports\/overview/);
  assert.match(client, /\/api\/reports\/run\//);
  assert.doesNotMatch(client, /reportRevenue\.textContent='0'/);
  assert.doesNotMatch(client, /Không render bảng chi tiết trên web/);
});

test('Excel compatibility exports bridge legacy buttons to Report Center reportCode', () => {
  for (const reportCode of ['sales-detail', 'debt-period', 'inventory-current', 'inventory-movement', 'finance-ledger']) {
    assert.match(html, new RegExp(`data-report-code="${reportCode}"`));
  }
  assert.doesNotMatch(html, /data-report-type=/);
  assert.doesNotMatch(client, /\/api\/export\//);
  assert.match(client, /ExcelInteraction\.downloadWorkbook\(\{type:\s*'REPORT'[\s\S]*reportCode/);
});
