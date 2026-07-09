'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sales = fs.readFileSync(path.join(root, 'src/services/reports/SalesReportService.js'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src/services/reports/ReportSourceRegistry.js'), 'utf8');
const expressions = fs.readFileSync(path.join(root, 'src/services/dashboard/DashboardMongoExpressions.js'), 'utf8');
const reportCenter = fs.readFileSync(path.join(root, 'src/services/reports/ReportCenterService.js'), 'utf8');
const excel = fs.readFileSync(path.join(root, 'src/services/excel/ExcelInteractionService.js'), 'utf8');

test('sales reports treat accounting_confirmed as confirmed order status', () => {
  assert.match(expressions, /ACCOUNTING_CONFIRMED_STATUSES\s*=\s*Object\.freeze\(\[[^\]]*'accounting_confirmed'/);
  assert.match(expressions, /function accountingConfirmedFilter\(\)/);
});

test('sales-by-staff staff dimension is not limited to exact role sales only', () => {
  assert.match(sales, /const \{ STAFF_ROLES \} = require\('\.\.\/\.\.\/constants\/business\.constants'\)/);
  assert.match(sales, /function activeSalesStaffUserFilter\(\)/);
  assert.match(sales, /role:\s*\{\s*\$in:\s*SALES_ROLE_VALUES\s*\}/);
  assert.match(sales, /isSalesman:\s*true/);
  assert.match(sales, /isSalesStaff:\s*true/);
  assert.doesNotMatch(sales, /User\.find\(\{\s*role:\s*'sales'/);
});

test('sales-by-staff view and excel export use the same report center source', () => {
  assert.match(reportCenter, /case 'sales-by-staff':[\s\S]*getSalesReportService\(\)\.salesReport\(\{ \.\.\.baseQuery, full: '1', export: '1' \}\)/);
  assert.match(reportCenter, /if \(definition\.code === 'sales-by-staff'\) rows = normalizeSalesStaffRows\(sales\.bySalesman \|\| \[\]\)/);
  assert.match(excel, /payload = await ReportCenterService\.run\(code, \{ \.\.\.filters, __exportAll: true \}, user\)/);
});

test('sales-by-staff source contract declares orders/arLedgers plus users staff dimension', () => {
  assert.match(registry, /'sales-by-staff':\s*{[\s\S]*primaryCollections:\s*\['orders', 'arLedgers'\]/);
  assert.match(registry, /'sales-by-staff':\s*{[\s\S]*secondaryCollections:\s*\['users'\]/);
  assert.match(registry, /danh sách NVBH từ users đang hoạt động/);
});
