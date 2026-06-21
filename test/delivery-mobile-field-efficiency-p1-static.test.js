'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const ordersModule = fs.readFileSync('public/mobile/js/delivery-orders-view.js', 'utf8');
const uiModule = fs.readFileSync('public/mobile/js/delivery-ui-utils.js', 'utf8');
const css = ['public/mobile/mobile.source/mobile-03.css', 'public/mobile/mobile.source/mobile-04.css']
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

test('delivery header is compact and moves secondary actions to overflow menu', () => {
  assert.match(entrySource, /m-delivery-header-compact/);
  assert.match(entrySource, /Giao hàng hôm nay/);
  assert.match(entrySource, /m-delivery-more-menu/);
  assert.match(entrySource, /data-m-menu-tab="reconciliation"/);
  assert.match(entrySource, /data-m-menu-tab="products"/);
  assert.doesNotMatch(entrySource, /Đồng bộ 100% với Đơn giao hôm nay/);
  assert.match(css, /m-delivery-header-compact\{min-height:64px/);
});

test('main KPIs are reduced to route count and must-collect only', () => {
  assert.match(entrySource, /mKpiTotalOrders/);
  assert.match(entrySource, /mKpiPendingOrders/);
  assert.match(entrySource, /mKpiDeliveredOrders/);
  assert.match(entrySource, /mKpiPt/);
  assert.doesNotMatch(entrySource, /mKpiTm|mKpiCk|mKpiTh|mKpiHt|mKpiCn/);
  assert.match(ordersModule, /totalOrders/);
  assert.match(ordersModule, /pendingOrders/);
  assert.match(ordersModule, /deliveredOrders/);
});

test('primary navigation is limited to four delivery tabs', () => {
  assert.match(entrySource, /m-delivery-tabs-main/);
  assert.match(entrySource, /<button data-m-tab="orders"/);
  assert.match(entrySource, /<button data-m-tab="payment"/);
  assert.match(entrySource, /<button data-m-tab="returns"/);
  assert.match(entrySource, /<button data-m-tab="debt"/);
  assert.doesNotMatch(entrySource, /<button data-m-tab="products"/);
  assert.doesNotMatch(entrySource, /<button data-m-tab="reconciliation"/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('order card is compact and only exposes must-collect financial metric', () => {
  assert.match(ordersModule, /m-order-card-compact/);
  assert.match(ordersModule, /Phải thu:/);
  assert.match(ordersModule, /NVBH:/);
  assert.match(uiModule, /data-order-confirm/);
  assert.match(uiModule, /data-order-pay/);
  assert.doesNotMatch(ordersModule, /<em>Tiền mặt<\/em>|<em>Chuyển khoản<\/em>|<em>Trả thưởng<\/em>|<em>Công nợ<\/em>/);
  assert.match(uiModule, /Đã giao/);
  assert.match(uiModule, /Thu tiền/);
  assert.match(uiModule, /Bản đồ/);
});

test('selected order bottom action supports one-hand field operation', () => {
  assert.match(entrySource, /function renderBottomAction\(\)/);
  assert.match(entrySource, /m-delivery-bottom-action active/);
  assert.match(entrySource, /data-bottom-pay/);
  assert.match(entrySource, /data-bottom-return/);
  assert.match(entrySource, /phoneHref\(phone\)/);
  assert.match(css, /position:fixed;left:8px;right:8px;bottom:max\(8px,env\(safe-area-inset-bottom\)\)/);
});
