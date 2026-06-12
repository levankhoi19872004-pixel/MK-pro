'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const viewPath = path.join(ROOT, 'public/js/delivery/delivery-web-view.js');
const cssPath = path.join(ROOT, 'public/style.css');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('delivery today renders NVBH branch filter under selected NVGH', () => {
  const source = read(viewPath);
  assert.match(source, /deliverySalesBranchBox/);
  assert.match(source, /function renderSalesBranchFilter/);
  assert.match(source, /branchRowsFromOrders/);
  assert.match(source, /data-sales-branch-key/);
});

test('delivery today KPI and list are filtered by checked sales staff branches', () => {
  const source = read(viewPath);
  assert.match(source, /function isSalesStaffSelected/);
  assert.match(source, /if \(!isSalesStaffSelected\(order\)\) return false;/);
  assert.match(source, /renderKpis\(\)/);
  assert.match(source, /getVisibleOrders\(\)/);
});

test('delivery branch filter has scoped CSS', () => {
  const css = read(cssPath);
  assert.match(css, /DELIVERY_BRANCH_SALES_STAFF_FILTER_START/);
  assert.match(css, /delivery-v46-sales-branch-list/);
  assert.match(css, /delivery-v46-sales-branch-item\.checked/);
});
