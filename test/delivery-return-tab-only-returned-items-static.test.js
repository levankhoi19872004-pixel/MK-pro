'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');

function block(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return source.slice(start, end);
}

test('phase28 returns tab derives a returned-only row list', () => {
  assert.match(source, /function returnedRowsForOrder\(order\)/);
  const returnedRows = block('function returnedRowsForOrder(order)', 'function hasReturnedRowsForCurrentOrder');
  assert.match(returnedRows, /sourceReturnRowsForOrder\(order\)\.filter/);
  assert.match(returnedRows, /num\(it\.returnQty\) > 0/);
});

test('phase28 returns tab renders only returned items and not all order lines', () => {
  const renderReturns = block('function renderReturns(body)', 'function renderCustomerReconciliation');
  assert.match(renderReturns, /var rows = returnedRowsForOrder\(order\)/);
  assert.match(renderReturns, /returns-only-list/);
  assert.match(renderReturns, /returned-only/);
  assert.doesNotMatch(renderReturns, /rows = buildReturnInputRows\(order, rows\)/);
  assert.doesNotMatch(renderReturns, /Có thể nhập trực tiếp tại đây/);
});

test('phase28 empty returns state does not render the full product list', () => {
  const renderReturns = block('function renderReturns(body)', 'function renderCustomerReconciliation');
  assert.match(renderReturns, /Chưa có hàng trả cho đơn này/);
  assert.match(renderReturns, /Nhập số lượng trả ở tab Hàng giao/);
  assert.match(renderReturns, /data-workflow-tab="products"/);
  assert.match(renderReturns, /Quay lại Hàng giao/);
  assert.match(renderReturns, /hasReturn \? '<form id="mReturnSaveForm"/);
});

test('phase28 returns sticky action avoids delete/save buttons when there are no returned rows', () => {
  const workflowBar = block('function renderWorkflowBar()', 'function render()');
  assert.match(workflowBar, /hasReturnedRowsForCurrentOrder\(order\)/);
  assert.match(workflowBar, /class="m-workflow-actions step-only phase24 returns empty"/);
  assert.match(workflowBar, /data-workflow-tab="products"/);
});

test('phase28 customer mode hides outside list information with state and CSS guard', () => {
  assert.match(source, /customer-workflow-mode/);
  assert.match(source, /rootEl\.classList\.toggle\('customer-workflow-mode', !listMode\)/);
  assert.match(css, /DELIVERY_RETURN_TAB_ONLY_RETURNED_ITEMS_START/);
  assert.match(css, /customer-workflow-mode #mDeliveryFilter/);
  assert.match(css, /customer-workflow-mode #mDeliveryKpis/);
});

test('phase28 keeps Phase27 modes and product search intact', () => {
  assert.match(source, /LIST_MODE_TABS/);
  assert.match(source, /CUSTOMER_MODE_TABS/);
  assert.match(source, /label: 'Khách giao'/);
  assert.match(source, /label: 'Đối soát'/);
  assert.match(source, /label: 'Công nợ'/);
  assert.match(source, /label: 'Hàng giao'/);
  assert.match(source, /label: 'Hàng trả'/);
  assert.match(source, /label: 'Thu tiền'/);
  assert.match(source, /id="mProductSearch"/);
  assert.match(source, /filterProductRows\(state\.productSearchKeyword\)/);
});

test('phase28 does not change backend/API/business endpoints', () => {
  assert.match(source, /DeliveryCore\.saveReturn/);
  assert.match(source, /DeliveryCore\.savePayment/);
  assert.match(source, /DeliveryCore\.confirmDelivery/);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/delivery\/return['"],\s*\{\s*method:\s*['"]GET/);
});
