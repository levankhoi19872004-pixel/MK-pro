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

test('delivery today renders NVBH branch filter as a full-width section below filters', () => {
  const source = read(viewPath);
  assert.match(source, /<section id="deliverySalesBranchBox"/);
  assert.match(source, /function renderSalesBranchFilter/);
  assert.match(source, /branchRowsFromOrders/);
  assert.match(source, /data-sales-branch-key/);
  assert.doesNotMatch(source, /deliveryCoreReconcile/);
  assert.doesNotMatch(source, />Đối soát<|Đối soát<\/button>/);
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
  assert.match(css, /delivery-v46-sales-branch-money i/);
});

test('delivery return rows update the order list and do not zero other orders after scoped load', () => {
  const view = read(viewPath);
  const core = read(path.join(ROOT, 'public/js/delivery/delivery-core.js'));

  assert.match(core, /returnsLoadedByOrder/);
  assert.match(core, /markReturnsLoadedForOrder/);
  assert.match(view, /returnRowsLoadedForOrder/);
  assert.match(view, /hasScopedReturnLoadMap/);
  assert.match(view, /refreshAfterReturnRowsLoaded/);
  assert.match(view, /renderSalesBranchFilter\(\);\s*\n\s*renderList\(\);\s*\n\s*renderDetail/);
});

test('delivery return tab uses compact four-column display inside the right panel', () => {
  const view = read(viewPath);
  const css = read(cssPath);

  assert.match(view, /delivery-v46-return-table-compact/);
  assert.match(view, /<span>Đơn \/ Khách<\/span><span>Sản phẩm<\/span><span>SL trả<\/span><span>Thành tiền<\/span>/);
  assert.match(css, /DELIVERY_RETURN_LIST_DISPLAY_FIX_START/);
  assert.match(css, /grid-template-columns:minmax\(92px,\.85fr\) minmax\(180px,1\.55fr\) 74px minmax\(96px,\.85fr\)/);
  assert.match(css, /overflow-x:hidden/);
});
