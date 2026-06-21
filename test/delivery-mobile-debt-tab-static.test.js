'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('delivery mobile replaces report tab with independent debt tab', () => {
  const source = [
    read('public/mobile/js/delivery-mobile-view.js'),
    read('public/mobile/js/delivery-state.js')
  ].join('\n');

  assert.match(source, /tab:\s*'orders'/);
  assert.match(source, /debts:\s*\[\]/);
  assert.match(source, /debtSummary:\s*\{\}/);
  assert.match(source, /selectedDebtIndex:\s*-1/);
  assert.match(source, /debtSubtab:\s*'customers'/);
  assert.match(source, /selectedDebtKey:\s*''/);
  assert.match(source, /debtLoaded:\s*false/);
  assert.match(source, /debtLoading:\s*false/);

  assert.match(source, /data-m-tab="debt">Công nợ/);
  assert.doesNotMatch(source, /data-m-tab="report">Báo cáo/);
  assert.doesNotMatch(source, /state\.tab\s*=\s*['"]report['"]/);
  assert.doesNotMatch(source, /function renderReport\(/);

  assert.match(source, /if \(state\.tab === 'debt'\) loadDeliveryDebts\(false\)/);
  assert.match(source, /if \(state\.tab === 'debt'\) return renderDebtApp\(body\)/);
});

test('delivery mobile debt tab uses shared mobile debts API and pending collection submit API', () => {
  const source = read('public/mobile/js/delivery-mobile-view.js');
  const html = read('public/mobile/delivery.html');

  assert.match(source, /function buildDeliveryDebtUrl\(page\)/);
  assert.match(source, /params\.set\('collectorType', 'delivery'\)/);
  assert.match(source, /params\.set\('includePendingCollections', '1'\)/);
  assert.match(source, /params\.set\('includePaid', '0'\)/);
  assert.match(source, /params\.set\('limit', String\(state\.debtLimit \|\| DELIVERY_DEBT_PAGE_LIMIT\)\)/);
  assert.match(source, /function renderDebtApp\(body\)/);
  assert.match(source, /function renderDebtCustomers\(entries\)/);
  assert.match(source, /function renderDebtCustomerDetail\(customer\)/);
  assert.match(source, /function submitDeliveryDebtCollectionFromDebtTab\(event, customer\)/);
  assert.match(source, /\/api\/mobile\/debt-collections/);
  assert.match(source, /collectorType:\s*'delivery'/);
  assert.match(source, /Công nợ chỉ giảm sau khi kế toán xác nhận trên web/);

  assert.match(html, /delivery-mobile-view\.js/);
  assert.match(source, /mDebtCustomersSubtab/);
  assert.match(source, /mDebtCollectSubtab/);
  assert.match(source, /setDeliveryDebtSubtab/);
  assert.match(source, /debt-submit-bar/);
  assert.match(source, /Đang chờ KT/);
});
