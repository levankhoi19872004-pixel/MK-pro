'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('public/mobile/delivery.html', 'utf8');
const entrySource = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const stateModule = fs.readFileSync('public/mobile/js/delivery-state.js', 'utf8');
const uiModule = fs.readFileSync('public/mobile/js/delivery-ui-utils.js', 'utf8');
const ordersModule = fs.readFileSync('public/mobile/js/delivery-orders-view.js', 'utf8');

test('delivery mobile loads modular dependencies before the entrypoint', () => {
  const stateIndex = html.indexOf('/mobile/js/delivery-state.js');
  const uiIndex = html.indexOf('/mobile/js/delivery-ui-utils.js');
  const ordersIndex = html.indexOf('/mobile/js/delivery-orders-view.js');
  const entryIndex = html.indexOf('/mobile/js/delivery-mobile-view.js');
  assert.ok(stateIndex > 0, 'state module should be loaded');
  assert.ok(uiIndex > stateIndex, 'ui utils should load after state');
  assert.ok(ordersIndex > uiIndex, 'orders view should load after ui utils');
  assert.ok(entryIndex > ordersIndex, 'entrypoint should load after modules');
});

test('delivery state is isolated in delivery-state module', () => {
  assert.match(stateModule, /window\.DeliveryMobileState/);
  assert.match(stateModule, /function createInitialState\(\)/);
  assert.match(stateModule, /returnsCache:\s*\{\}/);
  assert.match(stateModule, /debtLimit:\s*DELIVERY_DEBT_PAGE_LIMIT/);
  assert.doesNotMatch(entrySource, /var state = \{\s*selectedKey:/);
  assert.match(entrySource, /var state = deliveryMobileState\.createInitialState\(\)/);
});

test('common mobile UI helpers are isolated in delivery-ui-utils module', () => {
  assert.match(uiModule, /window\.DeliveryMobileUiUtils/);
  assert.match(uiModule, /function selectedOrderSummary\(order\)/);
  assert.match(uiModule, /function orderQuickActions\(order\)/);
  assert.match(uiModule, /function copyText\(value\)/);
  assert.match(entrySource, /var selectedOrderSummary = deliveryMobileUi\.selectedOrderSummary/);
  assert.match(entrySource, /var copyText = deliveryMobileUi\.copyText/);
});

test('orders rendering and KPI mapping are isolated in orders view module', () => {
  assert.match(ordersModule, /window\.DeliveryMobileOrdersView/);
  assert.match(ordersModule, /function buildOrderKpi\(order\)/);
  assert.match(ordersModule, /function renderOrderCard\(order, options\)/);
  assert.match(entrySource, /var buildRouteKpi = deliveryOrdersView\.buildRouteKpi/);
  assert.match(entrySource, /return deliveryOrdersView\.renderOrderCard\(order, \{ selectedKey: state\.selectedKey \}\)/);
});

test('entrypoint remains the coordinator and keeps public DeliveryMobileView API', () => {
  assert.match(entrySource, /window\.DeliveryMobileView = \{ load: load, select: select, renderShell: renderShell \}/);
  assert.match(entrySource, /function render\(\)/);
  assert.match(entrySource, /function load\(options\)/);
  assert.doesNotMatch(entrySource, /import\s+.*from/);
});
