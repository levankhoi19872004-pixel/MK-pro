'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { READ_ENDPOINT_BUDGETS } = require('../src/config/readEndpointBudgets');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase216 read request budget matrix documents all major read/list screens', () => {
  const doc = read('docs/READ_REQUEST_BUDGET_MATRIX.md');
  [
    'Tổng quan',
    'Sản phẩm',
    'Khách hàng',
    'Bán hàng',
    'Đơn giao hôm nay New',
    'Công nợ New',
    'Đơn trả hàng',
    'Quỹ tiền',
    'Báo cáo',
    'Đối chiếu DMS',
    'Quản lý chấm Trưng bày',
    'App bán hàng',
    'App giao hàng',
    'App thủ kho'
  ].forEach((label) => assert.match(doc, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(doc, /Open budget/);
  assert.match(doc, /Abort\/seq guard/);
  assert.match(doc, /Backend read API rule/);
});

test('readEndpointBudgets config covers primary large list/read APIs with read-only contracts', () => {
  const required = [
    'products',
    'customers',
    'salesOrders',
    'masterOrders',
    'deliveryTodayOrders',
    'debtNewCustomers',
    'debtCollections',
    'returnOrders',
    'fundsLedger',
    'fundsSummary',
    'reports',
    'dmsInventoryLatest',
    'dmsInventoryHistory',
    'dmsGapSimulatorPreview',
    'displayCheck',
    'mobileCustomers',
    'mobileProducts',
    'mobileSalesOrders',
    'mobileDebts',
    'deliveryOrders',
    'deliveryReconciliation',
    'warehouseReturnChecks'
  ];
  required.forEach((key) => {
    const item = READ_ENDPOINT_BUDGETS[key];
    assert.ok(item, `${key} must be declared`);
    assert.equal(item.maxRequestsPerUserAction, 1, `${key} must keep one-request budget per user action`);
    assert.equal(item.readOnly, true, `${key} must be readOnly`);
    assert.equal(item.forbiddenWrites, true, `${key} must forbid writes in read path`);
    assert.ok(item.endpoint && /^(GET|POST \/api\/tools\/)/.test(item.endpoint), `${key} endpoint must be explicit`);
    assert.ok(item.projection, `${key} must define projection expectation`);
  });
});

test('large collection read endpoints require pagination or an explicit bounded exception', () => {
  const boundedWithoutPagination = new Set(['deliveryTodayOrders', 'deliveryReconciliation', 'dmsGapSimulatorPreview']);
  Object.entries(READ_ENDPOINT_BUDGETS).forEach(([key, item]) => {
    if (boundedWithoutPagination.has(key)) return;
    if (item.boundedAggregate === true) {
      assert.equal(item.requiresPagination, false, `${key} bounded aggregate should not pretend to be a paginated list`);
      assert.ok(Number(item.maxLimit) > 0, `${key} should define a maxLimit`);
      assert.ok(Number(item.maxReturnedRows) > 0, `${key} should define maxReturnedRows`);
      assert.ok(Number(item.defaultLimit) > 0, `${key} should define defaultLimit`);
      assert.ok(Array.isArray(item.summaryOnlySections) && item.summaryOnlySections.length > 0, `${key} should name summary-only sections`);
      assert.ok(Array.isArray(item.itemSections) && item.itemSections.length > 0, `${key} should name bounded item sections`);
      assert.ok(item.reason && item.reason.length >= 40, `${key} should document why bounded aggregate is safe`);
      return;
    }
    assert.equal(item.requiresPagination, true, `${key} should require pagination/limit`);
    assert.ok(Number(item.maxLimit) > 0, `${key} should define a maxLimit`);
  });
});

test('fund dashboard bounded aggregate contract has source-level evidence', () => {
  const budget = READ_ENDPOINT_BUDGETS.fundsDashboard;
  const dashboardService = read('src/services/accounting/FundDashboardReadService.js');
  const cashInTransitService = read('src/domain/settlement/DeliveryCashInTransitReportService.js');

  assert.equal(budget.boundedAggregate, true);
  assert.match(dashboardService, /loadPendingRemittances[\s\S]*DeliveryCashSubmission\.aggregate\(\[/);
  assert.match(dashboardService, /\$group:\s*\{[\s\S]*count:\s*\{\s*\$sum:\s*1\s*\}[\s\S]*amount:\s*\{\s*\$sum:\s*'\$pendingAmount'\s*\}/);
  assert.doesNotMatch(dashboardService, /const ledgersBySubmission = await loadRelatedSubmissionLedgers\(rows\)/);
  assert.doesNotMatch(dashboardService, /\.map\(\(row\) => \(\{ row, pending: pendingFromSubmission/);
  assert.match(cashInTransitService, /\$facet:\s*\{/);
  assert.match(cashInTransitService, /\$unionWith:\s*\{/);
  assert.match(cashInTransitService, /\$limit:\s*limit/);
  assert.match(cashInTransitService, /truncated:\s*includeItems&&limit>0&&Number\(summary\.totalRows\|\|0\)>rows\.length|truncated:\s*includeItems && limit > 0 && Number\(summary\.totalRows \|\| 0\) > rows\.length/);
  assert.match(dashboardService, /fundLedgerRepository\.findAll\(match,[\s\S]*limit:\s*filters\.recentLimit/);
});
