'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

test('Phase231 backend exposes read-only fund dashboard endpoint from fundLedgers SSoT', () => {
  const routes = readSource('src/routes/fundRoutes.js');
  const controller = readSource('src/controllers/fundController.js');
  const service = readSource('src/services/accounting/FundDashboardReadService.js');

  assert.match(routes, /router\.get\('\/dashboard', viewFund, fundController\.getDashboard\)/);
  assert.match(controller, /FundDashboardReadService\.getFundDashboard/);
  assert.match(service, /CONTRACT_VERSION = 'fund-dashboard-v1'/);
  assert.match(service, /FundBalanceReadService\.getFundBalanceSummary/);
  assert.match(service, /source: 'fundLedgers'/);
  assert.match(service, /DeliveryCashInTransitReportService\.listDeliveryCashInTransit/);
  assert.match(service, /DeliveryCashSubmission\.aggregate/);
  assert.match(service, /DeliveryCashShortage\.aggregate/);
  assert.match(service, /fundLedgerRepository\.findAll/);
  assert.doesNotMatch(service, /\.(create|insertMany|updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|save)\s*\(/);
});

test('Phase231 fund UI opens on dashboard and dashboard uses a single read API', () => {
  const html = readSource('public/index.html');
  const state = readSource('public/js/app/state/00b-debt-return-fund-state.js');
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');

  assert.match(html, /data-fund-tab="fundDashboard"[^>]*>Tổng quan quỹ/);
  assert.match(html, /data-fund-panel="fundDashboard"/);
  assert.match(html, /id="fundDashboardCashInTransitTable"/);
  assert.match(html, /id="fundDashboardRecentTable"/);
  assert.match(state, /const fundDashboardAsOf=/);
  assert.match(state, /const fundConfirmPreviewModal=/);
  assert.match(js, /let activeFundTab='fundDashboard'/);
  assert.match(js, /fetch\(`\/api\/funds\/dashboard\?\$\{params\.toString\(\)\}`,\s*fundDashboardAbortController\?\{signal:fundDashboardAbortController\.signal\}:\{\}\)/);
  assert.match(js, /if\(activeFundTab==='fundDashboard'\)return loadFundDashboard\(\)/);
  assert.match(js, /setActiveFundTab\('fundDashboard'/);
});

test('Phase231 fund UI has financial confirmation preview and no browser confirm in fund source', () => {
  const html = readSource('public/index.html');
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');

  assert.match(html, /id="fundConfirmPreviewModal"/);
  assert.match(html, /id="fundConfirmPreviewSubmitButton"/);
  assert.match(js, /function openFundConfirmPreview/);
  assert.match(js, /submitFundConfirmPreview/);
  assert.doesNotMatch(js, /\bconfirm\s*\(/);
  assert.doesNotMatch(js, /window\.confirm\s*\(/);
});

test('Phase231 delivery fund tab uses operational labels for remittance review', () => {
  const html = readSource('public/index.html');
  const js = readSource('public/js/app/debt/07f-fund-ledger.js');

  assert.match(html, />Ngày nộp gần nhất</);
  assert.match(html, />Phải nộp</);
  assert.match(html, />Đã khai báo nộp</);
  assert.match(html, />Đã xác nhận nhận</);
  assert.match(html, />Còn thiếu\/thừa</);
  assert.match(html, />Đối soát</);
  assert.match(html, />Ghi quỹ</);
  assert.match(js, /type==='delivery'\?'Xử lý':'Sửa'/);
  assert.match(js, /type==='delivery'\?'Xử lý':'Xác nhận'/);
});
