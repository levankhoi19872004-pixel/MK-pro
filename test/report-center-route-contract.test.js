'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('reportService facade resolves Report Center catalog without broken nested ./reports path', () => {
  const facadeSource = read('src/services/reports/ReportServiceFacade.js');
  assert.doesNotMatch(facadeSource, /'\.\/reports\/ReportCenterService'/);
  assert.doesNotMatch(facadeSource, /'\.\/reports\/(Sales|Inventory|Debt|Finance|Delivery|Return|Dashboard)ReportService'/);

  const reportService = require('../src/services/reportService');
  const catalog = reportService.catalog({ role: 'admin' });
  assert.equal(Array.isArray(catalog.reports), true);
  assert.ok(catalog.reports.length >= 10);
  assert.ok(catalog.reports.some((report) => report.code === 'sales-by-day'));
});

test('report catalog route/controller contract is mounted and returns lightweight JSON', async () => {
  const routes = read('src/routes/reportRoutes.js');
  const controllerSource = read('src/controllers/reportController.js');

  assert.match(routes, /router\.get\('\/reports\/catalog',\s*reportCenterAccess,\s*reportController\.reportCatalog\)/);
  assert.match(controllerSource, /const result = reportService\.catalog\(req\.user \|\| \{\}\);/);
  assert.doesNotMatch(controllerSource, /reportCatalog[\s\S]{0,220}downloadWorkbook|new ExcelJS|sseInvoiceExport/i);

  const controller = require('../src/controllers/reportController');
  const payload = await new Promise((resolve, reject) => {
    const req = { user: { role: 'admin' } };
    const res = { json: resolve };
    controller.reportCatalog(req, res, reject);
  });
  assert.equal(payload.ok, true);
  assert.equal(Array.isArray(payload.reports), true);
  assert.equal(Array.isArray(payload.categories), true);
});
