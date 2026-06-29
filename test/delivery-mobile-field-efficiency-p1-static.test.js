'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const view = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const ordersView = fs.readFileSync('public/mobile/js/delivery-orders-view.js', 'utf8');
const contract = fs.readFileSync('public/mobile/js/delivery-mobile-contract.js', 'utf8');
const css = fs.readFileSync('public/mobile/mobile.source/mobile-04.css', 'utf8');

test('delivery header is compact and moves secondary actions to overflow menu', () => {
  assert.match(contract, /moreMenuClass:\s*'m-delivery-more-menu'/);
  assert.match(view, /m-delivery-header-compact/);
  assert.match(view, /m-delivery-secondary-actions/);
  assert.match(view, /m-delivery-more-menu/);
  assert.match(css, /m-delivery-more-menu/);
  assert.doesNotMatch(view, /hidden-test markers/);
});

test('main KPIs are reduced to route count and must-collect only', () => {
  assert.match(contract, /routeCountId:\s*'mKpiTotalOrders'/);
  assert.match(contract, /mustCollectId:\s*'mKpiPt'/);
  assert.match(contract, /pendingLegacyId:\s*'mKpiPendingOrders'/);
  assert.match(view, /id="mKpiTotalOrders"/);
  assert.match(view, /id="mKpiPt"/);
  assert.match(view, /id="mKpiPendingOrders"[^>]*hidden/);
  assert.match(view, /<span>Phải thu<\/span>/);
  assert.doesNotMatch(view, /<span>Trả hàng<\/span>[\s\S]*id="mDeliveryKpis"/);
});

test('primary navigation is contract-driven for list and customer modes', () => {
  assert.match(contract, /listMode:\s*\['orders',\s*'reconciliation',\s*'debt'\]/);
  assert.match(contract, /customerMode:\s*\['products',\s*'payment',\s*'customerReconciliation',\s*'debt'\]/);
  assert.match(view, /\{ key:\s*'orders', label:\s*'Khách giao' \}/);
  assert.match(view, /data-m-tab="' \+ esc\(tab\.key\) \+ '"/);
});

test('order card is compact and only exposes must-collect financial metric', () => {
  assert.match(contract, /mustCollectLabel:\s*'Phải thu'/);
  assert.match(ordersView, /m-order-card-compact/);
  assert.match(ordersView, /must-collect-only/);
  assert.match(ordersView, /Phải thu:/);
  assert.match(ordersView, /data-financial-metric="must-collect"/);
  assert.doesNotMatch(ordersView, /data-financial-metric="return"/);
  assert.doesNotMatch(ordersView, /data-financial-metric="debt"/);
});

test('selected order bottom action supports one-hand field operation', () => {
  assert.match(contract, /baseClass:\s*'m-delivery-bottom-action'/);
  assert.match(view, /m-delivery-bottom-action/);
  assert.match(view, /classList\.add\('active'\)/);
  assert.match(css, /m-delivery-bottom-action\.active/);
});
