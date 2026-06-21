'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const ordersViewSource = fs.readFileSync('public/mobile/js/delivery-orders-view.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');
const combined = entrySource + '\n' + ordersViewSource;

test('phase23 keeps customer delivery workflow as first-class tabs', () => {
  ['Khách giao', 'Hàng giao', 'Hàng trả', 'Thu tiền', 'Đối soát', 'Công nợ'].forEach((label) => {
    assert.match(entrySource, new RegExp(label));
  });
  assert.match(entrySource, /mReconShortcut/);
  assert.match(entrySource, /data-m-tab="reconciliation"/);
});

test('route KPI focuses on orders, receivable, returns and remaining debt', () => {
  ['mKpiTotal', 'mKpiPending', 'mKpiDelivered', 'mKpiPt', 'mKpiTh', 'mKpiCn'].forEach((id) => {
    assert.match(entrySource, new RegExp(id));
  });
  assert.match(ordersViewSource, /total:\s*0, pending:\s*0, delivered:\s*0/);
  assert.match(ordersViewSource, /a\.pending \+= delivered \? 0 : 1/);
});

test('order card remains customer-list oriented and opens the workflow screen', () => {
  assert.match(ordersViewSource, /orderProductSummary/);
  assert.match(ordersViewSource, /m-order-workflow-summary/);
  assert.match(ordersViewSource, /customer-list/);
  assert.match(ordersViewSource, /Vào giao hàng/);
  assert.match(ordersViewSource, /data-open-tab=\"products\"/);
  assert.doesNotMatch(ordersViewSource, />Đã giao<\/button>/);
});

test('products, returns and payment keep the customer workflow sequence', () => {
  assert.match(entrySource, /Bước 1 · Hàng giao kiêm nhập hàng trả/);
  assert.match(entrySource, /Xác nhận hàng & thu tiền/);
  assert.match(entrySource, /Trả hết đơn/);
  assert.match(entrySource, /Hàng trả · xem\/sửa lại/);
  assert.match(entrySource, /Còn thiếu \/ ghi công nợ/);
  assert.match(entrySource, /Lưu thu tiền & xác nhận giao/);
  assert.match(entrySource, /state\.tab = 'reconciliation'/);
});

test('one-hand workflow bar is present without changing API contract', () => {
  assert.match(entrySource, /mWorkflowBar/);
  assert.match(entrySource, /data-workflow-tab="products"/);
  assert.match(entrySource, /data-workflow-tab="returns"/);
  assert.match(entrySource, /data-workflow-tab="payment"/);
  assert.match(css, /m-workflow-bar/);
  assert.match(css, /DELIVERY_REAL_WORKFLOW_UI_P1_START/);
});
