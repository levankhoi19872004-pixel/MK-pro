'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT,file),'utf8');

test('global CSS and bootstrap manifests are small', () => {
  assert.ok(read('public/style.css').split(/\r?\n/).length < 10);
  assert.ok(read('public/app.js').split(/\r?\n/).length < 10);
  assert.ok(read('public/js/app/00-dom-state.js').split(/\r?\n/).length < 10);
});

test('index loads CSS and JavaScript modules in explicit order', () => {
  const html=read('public/index.html');
  assert.match(html,/\/css\/00-base\.css/);
  assert.match(html,/\/css\/70-master-return-orders\.css/);
  assert.match(html,/\/js\/app\/state\/00a-catalog-orders-state\.js/);
  assert.match(html,/\/js\/bootstrap\/03-tab-loader\.js/);
  assert.doesNotMatch(html,/src="\/app\.js/);
  assert.doesNotMatch(html,/href="\/style\.css/);
});

test('duplicate sales and master order events are not in bootstrap', () => {
  const all=[read('public/js/bootstrap/01-catalog-orders.js'),read('public/js/bootstrap/02-delivery-system.js'),read('public/js/bootstrap/03-tab-loader.js')].join('\n');
  assert.doesNotMatch(all,/selectAllSalesOrdersButton.*addEventListener/);
  assert.doesNotMatch(all,/openMasterOrderModalButton.*addEventListener/);
  assert.match(read('public/js/app/05-sales-orders.js'),/selectAllSalesOrdersButton.*addEventListener/);
  assert.match(read('public/js/app/06-master-delivery.js'),/openMasterOrderModalButton.*addEventListener/);
});
