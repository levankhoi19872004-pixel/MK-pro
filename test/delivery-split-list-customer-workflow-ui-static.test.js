'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const stateSource = fs.readFileSync('public/mobile/js/delivery-state.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');

function block(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return source.slice(start, end);
}

test('phase27 defines separate list mode and customer workflow mode tabs', () => {
  assert.match(stateSource, /viewMode: 'list'/);
  assert.match(source, /LIST_MODE_TABS/);
  assert.match(source, /CUSTOMER_MODE_TABS/);
  const listTabs = block('var LIST_MODE_TABS', 'var CUSTOMER_MODE_TABS');
  assert.match(listTabs, /label: 'Khách giao'/);
  assert.match(listTabs, /label: 'Đối soát'/);
  assert.match(listTabs, /label: 'Công nợ'/);
  assert.doesNotMatch(listTabs, /label: 'Hàng giao'/);
  assert.doesNotMatch(listTabs, /label: 'Hàng trả'/);
  assert.doesNotMatch(listTabs, /label: 'Thu tiền'/);

  const customerTabs = block('var CUSTOMER_MODE_TABS', 'function isCustomerMode');
  assert.match(customerTabs, /label: 'Hàng giao'/);
  assert.match(customerTabs, /label: 'Hàng trả'/);
  assert.match(customerTabs, /label: 'Thu tiền'/);
  assert.doesNotMatch(customerTabs, /label: 'Khách giao'/);
  assert.doesNotMatch(customerTabs, /label: 'Đối soát'/);
  assert.doesNotMatch(customerTabs, /label: 'Công nợ'/);
});

test('phase27 hides global filter and KPI blocks in customer mode', () => {
  assert.match(source, /id="mDeliveryKpis"/);
  assert.match(source, /id="mDeliveryFilter"/);
  assert.match(source, /function renderListChromeVisibility/);
  assert.match(source, /kpis\.hidden = !listMode/);
  assert.match(source, /filter\.hidden = !listMode/);
});

test('phase27 customer mode has back-to-list customer context', () => {
  assert.match(source, /id="mCustomerContext"/);
  assert.match(source, /data-back-to-list/);
  assert.match(source, /← Danh sách/);
  assert.match(source, /function switchToListMode/);
});

test('phase27 product tab has local product search without changing return quantities', () => {
  assert.match(stateSource, /productSearchKeyword/);
  assert.match(source, /id="mProductSearch"/);
  assert.match(source, /Tìm sản phẩm \/ mã hàng/);
  assert.match(source, /function filterProductRows/);
  assert.match(source, /data-product-search-text/);
  assert.match(source, /row\.hidden = !matched/);
  assert.match(source, /Không tìm thấy sản phẩm trong đơn này/);
  assert.doesNotMatch(source, /renderProducts\(el\('mBody'\)\);\s*\}\);/);
});

test('phase27 no longer renders six static tabs at all times', () => {
  assert.match(source, /tabListForCurrentMode\(\)\.map/);
  assert.doesNotMatch(source, /<button data-m-tab="products">Hàng giao<\/button>.*<button data-m-tab="debt">Công nợ<\/button>/s);
  assert.match(css, /DELIVERY_SPLIT_LIST_CUSTOMER_WORKFLOW_UI_START/);
});

test('phase27 keeps backend/API contracts untouched', () => {
  assert.match(source, /DeliveryCore\.saveReturn/);
  assert.match(source, /DeliveryCore\.savePayment/);
  assert.match(source, /DeliveryCore\.confirmDelivery/);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/delivery\/reconciliation['"],\s*\{\s*method:\s*['"]POST/);
});
