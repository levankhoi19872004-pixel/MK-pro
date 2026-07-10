'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

test('Phase117 keeps only New Delivery Today and New Debt menu entries', () => {
  const nav = read('public/fragments/index/01-index-body.html');
  assert.doesNotMatch(nav, /data-tab="deliveryTodayTab">Đơn giao hôm nay</);
  assert.match(nav, /data-tab="deliveryTodayNewTab">Đơn giao hôm nay \(New\)</);
  assert.doesNotMatch(nav, /data-tab="debtTab">Công nợ</);
  assert.match(nav, /data-tab="debtNewTab">Công nợ \(New\)</);
  assert.match(nav, /data-tab="debtCollectionsTab">Thu nợ chờ xác nhận</);
});

test('Phase117 New tabs remain isolated and legacy web screens are not mounted', () => {
  const body = read('public/fragments/index/03-index-body.html');
  const scripts = read('public/fragments/index/07-index-body.html');
  assert.match(body, /id="deliveryTodayNewTab"/);
  assert.match(body, /id="deliveryTodayNewRoot"/);
  assert.match(body, /id="debtNewTab"/);
  assert.match(body, /id="debtNewRoot"/);
  assert.doesNotMatch(body, /id="deliveryTodayTab"/);
  assert.doesNotMatch(body, /id="debtTab"/);
  assert.match(scripts, /\/js\/app\/core\/feature-module-loader\.js/);
  assert.match(scripts, /\/js\/app\/core\/desktop-feature-facades\.js/);
  assert.doesNotMatch(scripts, /<script src="\/js\/app\/new\/91-delivery-today-new\.js/);
  assert.doesNotMatch(scripts, /<script src="\/js\/app\/new\/92-debt-new\.js/);
  const facades = read('public/js/app/core/desktop-feature-facades.js');
  assert.match(facades, /deliveryTodayNew/);
  assert.match(facades, /\/js\/app\/new\/91-delivery-today-new\.js/);
  assert.match(facades, /debtNew/);
  assert.match(facades, /\/js\/app\/new\/92-debt-new\.js/);
  assert.doesNotMatch(scripts, /\/js\/delivery\/delivery-core\.js/);
  assert.doesNotMatch(scripts, /\/js\/delivery\/delivery-web-view\.js/);
  assert.doesNotMatch(scripts, /\/js\/ui\/delivery-toolbar\.js/);
});

test('Phase117 new backend routes are registered and legacy delivery-today routes are retired', () => {
  const routesIndex = read('src/routes/index.js');
  const masterRoutes = read('src/routes/masterOrderRoutes.js');
  const routes = read('src/routes/newOperationsRoutes.js');
  assert.match(routesIndex, /newOperationsRoutes/);
  assert.match(routesIndex, /app\.use\('\/api\/new', newOperationsRoutes\)/);
  assert.match(routes, /\/delivery-today\/orders/);
  assert.match(routes, /\/debt\/customers/);
  assert.match(routesIndex, /legacy-web-delivery-today-alias/);
  assert.match(masterRoutes, /legacy-master-order-delivery-today/);
  assert.match(masterRoutes, /replacement: '\/api\/new\/delivery-today\/orders'/);
});
