'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

test('Phase91 adds new Delivery Today and Debt menu entries without removing legacy entries', () => {
  const nav = read('public/fragments/index/01-index-body.html');
  assert.match(nav, /data-tab="deliveryTodayTab">Đơn giao hôm nay</);
  assert.match(nav, /data-tab="deliveryTodayNewTab">Đơn giao hôm nay \(New\)</);
  assert.match(nav, /data-tab="debtTab">Công nợ</);
  assert.match(nav, /data-tab="debtNewTab">Công nợ \(New\)</);
});

test('Phase91 new tabs have isolated roots and isolated frontend scripts', () => {
  const body = read('public/fragments/index/03-index-body.html');
  const scripts = read('public/fragments/index/07-index-body.html');
  assert.match(body, /id="deliveryTodayNewTab"/);
  assert.match(body, /id="deliveryTodayNewRoot"/);
  assert.match(body, /id="debtNewTab"/);
  assert.match(body, /id="debtNewRoot"/);
  assert.match(scripts, /\/js\/app\/new\/91-delivery-today-new\.js/);
  assert.match(scripts, /\/js\/app\/new\/92-debt-new\.js/);
});

test('Phase91 new backend routes are registered under /api/new namespace', () => {
  const routesIndex = read('src/routes/index.js');
  const routes = read('src/routes/newOperationsRoutes.js');
  assert.match(routesIndex, /newOperationsRoutes/);
  assert.match(routesIndex, /app\.use\('\/api\/new', newOperationsRoutes\)/);
  assert.match(routes, /\/delivery-today\/orders/);
  assert.match(routes, /\/debt\/customers/);
});
