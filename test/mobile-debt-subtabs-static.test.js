'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('sales debt tab separates customer list and collection workflow into two subtabs', () => {
  const html = read('public/mobile/sales.html');
  const js = read('public/mobile/js/sales.js');
  const css = read('public/mobile/mobile.css');

  assert.match(html, /id="debtCustomersSubtab"/);
  assert.match(html, /id="debtCollectSubtab"/);
  assert.match(html, /id="debtCustomersPanel"/);
  assert.match(html, /id="debtCollectPanel"/);
  assert.match(html, /id="debtCustomerSearch"/);
  assert.match(html, /id="debtCustomerSort"/);
  assert.match(js, /function setDebtSubtab\(/);
  assert.match(js, /function openDebtCollection\(/);
  assert.match(js, /selectedDebtCustomerKey/);
  assert.match(js, /debtFormDirty/);
  assert.match(js, /Đang chờ KT/);
  assert.match(js, /setDebtSubtab\('customers', \{ restoreScroll: true \}\)/);
  assert.match(css, /\.debt-submit-bar\s*\{/);
  assert.match(css, /position:\s*sticky/);
});

test('delivery debt tab uses the same two-subtab interaction and preserves list position', () => {
  const js = read('public/mobile/js/delivery-mobile-view.js');
  const css = read('public/mobile/mobile.css');

  assert.match(js, /debtSubtab:\s*'customers'/);
  assert.match(js, /id="mDebtCustomersSubtab"/);
  assert.match(js, /id="mDebtCollectSubtab"/);
  assert.match(js, /function setDeliveryDebtSubtab\(/);
  assert.match(js, /function openDeliveryDebtCollection\(/);
  assert.match(js, /debtListScrollTop/);
  assert.match(js, /mChooseDebtCustomer/);
  assert.match(js, /debt-submit-bar/);
  assert.match(css, /MOBILE_DEBT_SUBTABS_V2_START/);
});
