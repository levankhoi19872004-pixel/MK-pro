'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const ordersViewSource = fs.readFileSync('public/mobile/js/delivery-orders-view.js', 'utf8');
const deliveryCoreSource = fs.readFileSync('public/js/delivery/delivery-core.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');

test('phase23 starts from customer list and opens a single-customer workflow', () => {
  assert.match(entrySource, /Khách giao/);
  assert.match(ordersViewSource, /customer-list/);
  assert.match(ordersViewSource, /Vào giao hàng/);
  assert.match(ordersViewSource, /data-open-tab="products"/);
  assert.doesNotMatch(ordersViewSource, /flowButton\('Thu tiền', key, 'payment', 'primary'\)/);
  assert.doesNotMatch(ordersViewSource, />Đã giao<\/button>/);
});

test('phase23 enters returns directly on the products tab', () => {
  assert.match(entrySource, /m-product-compact-brief phase24/);
  assert.match(entrySource, /mProductReturnForm/);
  assert.match(entrySource, /m-return-inline-input/);
  assert.match(entrySource, /data-m-return-field="returnQty"/);
  assert.match(entrySource, /Xác nhận hàng & thu tiền/);
  assert.match(entrySource, /state\.tab = options\.nextTab \|\| 'payment'/);
});

test('phase23 full-return flow is explicit and does not require payment', () => {
  assert.match(entrySource, /function fullReturnOrder/);
  assert.match(entrySource, /Khách trả lại toàn bộ đơn này/);
  assert.match(entrySource, /forceFull/);
  assert.match(entrySource, /returnType: 'full'/);
  assert.match(entrySource, /deliveryStatus: 'failed'/);
  assert.match(entrySource, /state\.tab = 'orders'/);
});

test('phase23 payment completion moves to reconciliation', () => {
  assert.match(entrySource, /Đã lưu thu tiền và xác nhận giao, chuyển sang Đối soát/);
  assert.match(entrySource, /state\.tab = 'reconciliation'/);
  assert.match(entrySource, /loadDeliveryReconciliation\(true\)/);
  assert.match(entrySource, /data-m-tab="reconciliation"/);
});

test('phase23 delivery core supports full return type without backend contract changes', () => {
  assert.match(deliveryCoreSource, /buildReturnPayload\(order, items, options\)/);
  assert.match(deliveryCoreSource, /returnType: text\(options\.returnType \|\| 'partial'\)/);
  assert.match(deliveryCoreSource, /async saveReturn\(order, items, options\)/);
  assert.match(deliveryCoreSource, /this\.buildReturnPayload\(order, items, options\)/);
});

test('phase23 CSS supports six-step customer workflow and return inputs', () => {
  assert.match(css, /DELIVERY_CUSTOMER_WORKFLOW_UI_P1_START/);
  assert.match(css, /customer-flow/);
  assert.match(css, /m-return-inline-input/);
  assert.match(css, /m-action-row\.workflow-next\.phase23/);
});
