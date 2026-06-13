'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('sales order modal uses compact option A layout and keeps product list as primary workspace', () => {
  const html = read('public/index.html');
  const css = read('public/style.css');

  assert.match(html, /sales-order-head-meta/);
  assert.match(html, /sales-compact-options/);
  assert.match(html, /class="sales-vat-note" hidden/);
  assert.match(html, />Thêm sản phẩm</);

  assert.match(css, /PHASE 19: Sales order compact workspace - Option A/);
  assert.match(css, /width:min\(94vw,1500px\)/);
  assert.match(css, /grid-template-rows:auto auto minmax\(0,1fr\) auto/);
  assert.match(css, /sales-items-panel[\s\S]*border-radius:9px/);
  assert.match(css, /sales-items-table tbody tr[\s\S]*height:34px/);
});

test('VAT note is shown only when non-invoice mode is selected', () => {
  const source = read('public/js/app/05-sales-orders.js');

  assert.match(source, /function syncVatConditionalUi\(\)/);
  assert.match(source, /note\.hidden=required/);
  assert.match(source, /classList\.toggle\('vat-note-visible',!required\)/);
  assert.match(source, /input\[name="vatInvoiceRequired"\][\s\S]*addEventListener\('change',syncVatConditionalUi\)/);
});
