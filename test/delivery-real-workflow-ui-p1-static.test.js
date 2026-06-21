'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const ordersViewSource = fs.readFileSync('public/mobile/js/delivery-orders-view.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');
const combined = entrySource + '\n' + ordersViewSource;

test('phase22 keeps real NVGH workflow as first-class tabs', () => {
  ['Đơn giao', 'Hàng giao', 'Trả hàng', 'Thu tiền', 'Công nợ'].forEach((label) => {
    assert.match(entrySource, new RegExp(label));
  });
  assert.match(entrySource, /mReconShortcut/);
  assert.doesNotMatch(entrySource, /data-m-tab="reconciliation"/);
});

test('route KPI focuses on orders, receivable, returns and remaining debt', () => {
  ['mKpiTotal', 'mKpiPending', 'mKpiDelivered', 'mKpiPt', 'mKpiTh', 'mKpiCn'].forEach((id) => {
    assert.match(entrySource, new RegExp(id));
  });
  assert.match(ordersViewSource, /total:\s*0, pending:\s*0, delivered:\s*0/);
  assert.match(ordersViewSource, /a\.pending \+= delivered \? 0 : 1/);
});

test('order card is workflow-oriented, not shipper-only', () => {
  assert.match(ordersViewSource, /orderProductSummary/);
  assert.match(ordersViewSource, /m-order-workflow-summary/);
  assert.match(ordersViewSource, /Hàng giao/);
  assert.match(ordersViewSource, /Trả hàng/);
  assert.match(ordersViewSource, /Thu tiền/);
  assert.match(ordersViewSource, /data-open-tab=\"products\"/);
  assert.match(ordersViewSource, /flowButton\('Trả hàng', key, 'returns'\)/);
  assert.match(ordersViewSource, /flowButton\('Thu tiền', key, 'payment', 'primary'\)/);
  assert.doesNotMatch(ordersViewSource, />Đã giao<\/button>/);
});

test('returns and payment keep the correct delivery sequence', () => {
  assert.match(entrySource, /Bước 1\/4 · Kiểm hàng giao/);
  assert.match(entrySource, /Bước 2\/4 · Hàng trả nếu có/);
  assert.match(entrySource, /Bước 3\/4 · Thu tiền & xác nhận/);
  assert.match(entrySource, /Còn thiếu \/ ghi công nợ/);
  assert.match(entrySource, /Lưu thu tiền & xác nhận giao/);
});

test('one-hand workflow bar is present without changing API contract', () => {
  assert.match(entrySource, /mWorkflowBar/);
  assert.match(entrySource, /data-workflow-tab="products"/);
  assert.match(entrySource, /data-workflow-tab="returns"/);
  assert.match(entrySource, /data-workflow-tab="payment"/);
  assert.match(css, /m-workflow-bar/);
  assert.match(css, /DELIVERY_REAL_WORKFLOW_UI_P1_START/);
});
