'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/services/reports/ReportCenterService.js', 'utf8');
const controller = fs.readFileSync('src/controllers/reportController.js', 'utf8');
const routes = fs.readFileSync('src/routes/reportRoutes.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');
const client = fs.readFileSync('public/js/app/admin/08a-reports.js', 'utf8');

const expectedReports = [
  'sales-kpi', 'sales-by-day', 'sales-by-staff', 'sales-by-customer', 'sales-by-product', 'sales-detail',
  'inventory-current', 'inventory-movement', 'stock-card', 'debt-period', 'debt-ledger',
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

test('Excel compatibility exports remain available after the redesign', () => {
  for (const exportType of ['sales-report', 'debt-report', 'stock-report', 'inventory-movement-report', 'fund-report']) {
    assert.match(html, new RegExp(`data-report-type="${exportType}"`));
  }
  assert.match(client, /\/api\/export\//);
});
