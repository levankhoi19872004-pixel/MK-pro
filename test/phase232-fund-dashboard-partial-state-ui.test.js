'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

test('Phase232 frontend keeps top-level partial status and does not render unavailable as zero', () => {
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');

  assert.match(js, /renderFundDashboard\(json\)/);
  assert.match(js, /payload\.status\|\|data\.status/);
  assert.match(js, /Một phần dữ liệu chưa tải được/);
  assert.match(js, /function fundDashboardMoney\(value\)/);
  assert.match(js, /return '—'/);
  assert.doesNotMatch(js, /money\(pending\.amount\|\|0\)/);
  assert.doesNotMatch(js, /money\(overdue\.amount\|\|0\)/);
  assert.doesNotMatch(js, /money\(shortages\.amount\|\|0\)/);
});

test('Phase232 financial confirmation modal fails closed when DOM is missing', () => {
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');

  assert.match(js, /Không mở được màn xác nhận ghi quỹ/);
  assert.match(js, /throw error/);
  assert.doesNotMatch(js, /Promise\.resolve\(\)\.then\(onConfirm\)/);
  assert.doesNotMatch(js, /\bconfirm\s*\(/);
  assert.doesNotMatch(js, /window\.confirm\s*\(/);
});

test('Phase232 dashboard request is abortable and old responses cannot overwrite new filters', () => {
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');

  assert.match(js, /fundDashboardRequestSeq/);
  assert.match(js, /fundDashboardAbortController\.abort\(\)/);
  assert.match(js, /new AbortController\(\)/);
  assert.match(js, /requestSeq!==fundDashboardRequestSeq/);
});

test('Phase232 dashboard is lazy-loaded from active funds tab and queue drill-down applies filter', () => {
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');
  const html = readSource('public/index.html');

  assert.match(js, /data-tab="fundsTab"/);
  assert.match(js, /classList\.contains\('active'\)/);
  assert.match(js, /fundDashboardActiveFilter=filter/);
  assert.match(js, /pendingRemittances/);
  assert.match(js, /overdueDeliveryCash/);
  assert.match(js, /unresolvedShortages/);
  assert.match(html, /data-fund-dashboard-filter="unresolvedShortages"/);
});
