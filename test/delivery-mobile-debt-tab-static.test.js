'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('delivery mobile replaces report tab with independent debt tab', () => {
  const source = read('public/mobile/js/delivery-mobile-view.js');

  assert.match(source, /tab:\s*'orders'/);
  assert.match(source, /debts:\s*\[\]/);
  assert.match(source, /debtSummary:\s*\{\}/);
  assert.match(source, /selectedDebtIndex:\s*-1/);
  assert.match(source, /debtLoaded:\s*false/);
  assert.match(source, /debtLoading:\s*false/);

  assert.match(source, /data-m-tab="debt">Công nợ/);
  assert.doesNotMatch(source, /data-m-tab="report">Báo cáo/);
  assert.doesNotMatch(source, /state\.tab\s*=\s*['"]report['"]/);
  assert.doesNotMatch(source, /function renderReport\(/);

  assert.match(source, /if \(state\.tab === 'debt'\) loadDeliveryDebts\(\)/);
  assert.match(source, /if \(state\.tab === 'debt'\) return renderDebtApp\(body\)/);
});

test('delivery mobile debt tab uses shared mobile debts API and pending collection submit API', () => {
  const source = read('public/mobile/js/delivery-mobile-view.js');
  const html = read('public/mobile/delivery.html');

  assert.match(source, /\/api\/mobile\/debts\?collectorType=delivery&includePendingCollections=1&includePaid=0&limit=100/);
  assert.match(source, /function renderDebtApp\(body\)/);
  assert.match(source, /function renderDebtCustomers\(rows\)/);
  assert.match(source, /function renderDebtCustomerDetail\(customer\)/);
  assert.match(source, /function submitDeliveryDebtCollectionFromDebtTab\(event, customer\)/);
  assert.match(source, /\/api\/mobile\/debt-collections/);
  assert.match(source, /collectorType:\s*'delivery'/);
  assert.match(source, /Công nợ chỉ giảm sau khi kế toán xác nhận trên web/);

  assert.match(html, /delivery-debt-tab-v1/);
});
