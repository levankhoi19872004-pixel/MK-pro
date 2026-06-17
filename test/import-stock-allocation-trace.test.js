'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'src/services/excelImportService.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public/js/app/admin/08d-import-excel.js'), 'utf8');

test('preview exposes initial stock, prior allocations and remaining stock per import line', () => {
  assert.match(service, /initialAvailableQuantity\s*=\s*toNumber\(stockMap\.get\(stockLookupCode\)\)/);
  assert.match(service, /allocatedBeforeQuantity\s*=\s*Math\.max\(0, initialAvailableQuantity - availableBefore\)/);
  assert.ok((service.match(/initialAvailableQuantity,/g) || []).length >= 2);
  assert.ok((service.match(/allocatedBeforeQuantity,/g) || []).length >= 2);
  assert.match(service, /runningStockMap\.has\(normalizedProductCode\)/);
});

test('commit recalculates stock allocation from only selected orders and current inventory', () => {
  assert.match(service, /rebuildSelectedSalesOrderPreviewRows/);
  assert.match(service, /reallocating_selected_orders_against_current_stock/);
  assert.match(service, /sourceRows\s*=\s*await rebuildSelectedSalesOrderPreviewRows\(sourceRows/);
});

test('frontend explains sequential stock allocation instead of showing an isolated shortage only', () => {
  assert.match(frontend, /Đã giữ cho đơn trước/);
  assert.match(frontend, /Còn trước đơn/);
  assert.match(frontend, /Đơn đứng trước giữ hàng trước/);
  assert.match(frontend, /Thiếu \$\{formatNumber\(shortages\.length\)\} mã hàng/);
});
