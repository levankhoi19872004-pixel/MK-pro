'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const moduleSource = [
  'public/mobile/js/delivery-ui-utils.js',
  'public/mobile/js/delivery-orders-view.js'
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const source = entrySource + '\n' + moduleSource;
const css = ['public/mobile/mobile.source/mobile-03.css', 'public/mobile/mobile.source/mobile-04.css']
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

test('delivery mobile main screen uses compact field KPIs', () => {
  ['Tổng đơn', 'Chưa giao', 'Đã giao', 'Phải thu'].forEach((label) => {
    assert.match(source, new RegExp(label));
  });
  assert.match(source, /mKpiTotalOrders/);
  assert.match(source, /mKpiPendingOrders/);
  assert.match(source, /mKpiDeliveredOrders/);
  assert.doesNotMatch(entrySource, /mKpiTm|mKpiCk|mKpiHt|mKpiCn/);
  assert.doesNotMatch(source, /<span>PT<\/span>|<span>TM<\/span>|<span>CK<\/span>|<span>CN<\/span>/);
});

test('delivery order cards expose primary field actions without API changes', () => {
  assert.match(source, /function orderQuickActions/);
  assert.match(source, /data-order-confirm/);
  assert.match(source, /data-order-pay/);
  assert.match(source, /Bản đồ/);
  assert.match(source, /google\.com\/maps\/search/);
  assert.doesNotMatch(moduleSource, /Copy địa chỉ/);
});

test('delivery mobile error states include retry actions', () => {
  assert.match(source, /mRetryLoad/);
  assert.match(source, /mRetryDebt/);
  assert.match(source, /Thử lại/);
});

test('delivery mobile touch targets are at least 44px in CSS', () => {
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*380px\)/);
  assert.match(css, /@media \(min-width:\s*390px\)/);
  assert.match(css, /@media \(min-width:\s*412px\)/);
  assert.match(css, /@media \(min-width:\s*768px\)/);
});

test('potentially destructive skip-return action requires confirmation', () => {
  assert.match(source, /Bỏ qua hàng trả sẽ ghi số lượng trả về 0/);
  assert.match(source, /window\.confirm/);
});
