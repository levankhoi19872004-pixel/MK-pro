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
    assert.equal(item.requiresPagination, true, `${key} should require pagination/limit`);
    assert.ok(Number(item.maxLimit) > 0, `${key} should define a maxLimit`);
  });
});
