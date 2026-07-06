'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sales = fs.readFileSync(path.join(root, 'src/services/reports/SalesReportService.js'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src/services/reports/ReportSourceRegistry.js'), 'utf8');

test('sales-by-staff report seeds rows from active sales users before aggregating orders', () => {
  assert.match(sales, /async function loadActiveSalesStaff\(\)/);
  assert.match(sales, /User\.find\(activeSalesStaffUserFilter\(\)\)/);
  assert.match(sales, /role:\s*\{\s*\$in:\s*SALES_ROLE_VALUES\s*\}/);
  assert.match(sales, /function buildSalesmanReportRows\(rows = \[\], activeSalesStaff = \[\]\)/);
  assert.match(sales, /activeSalesStaff\.forEach\(ensureSalesman\)/);
  assert.match(sales, /const bySalesman = buildSalesmanReportRows\(rows, activeSalesStaff\)/);
});

test('sales-by-staff source contract declares users as staff dimension source', () => {
  assert.match(registry, /'sales-by-staff':\s*{[\s\S]*secondaryCollections:\s*\['users'\]/);
  assert.match(registry, /danh sách NVBH từ users đang hoạt động/);
});
