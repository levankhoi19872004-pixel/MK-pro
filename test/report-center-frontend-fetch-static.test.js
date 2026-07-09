'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Report Center V2 frontend uses canonical catalog endpoint and scoped error logging', () => {
  const client = read('public/js/app/admin/08a-reports.js');
  assert.match(client, /fetchJson\('\/api\/reports\/catalog'\)/);
  assert.match(client, /\[ReportCenter\] loadCatalog failed/);
  assert.match(client, /endpoint:error\?\.endpoint/);
  assert.match(client, /requestId:error\?\.requestId/);
  assert.match(client, /Không tải được danh mục báo cáo\. Vui lòng thử lại hoặc liên hệ quản trị\./);
  assert.doesNotMatch(client, /\/api\/delivery-today/);
  assert.doesNotMatch(client, /\/api\/master-return-orders/);
});

test('Report Center catalog endpoint is governed by read endpoint budget and canonical flow', () => {
  const budgets = read('src/config/readEndpointBudgets.js');
  const flows = read('config/canonical-flows.json');
  assert.match(budgets, /reportCatalog:\s*Object\.freeze/);
  assert.match(budgets, /endpoint:\s*'GET \/api\/reports\/catalog'/);
  assert.match(budgets, /projection:\s*'report-catalog-definition-only'/);
  assert.match(flows, /"reportCenter"/);
  assert.match(flows, /"GET \/api\/reports\/\*"/);
  assert.match(flows, /"src\/services\/reports\/ReportCenterService\.js"/);
});
