'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('Sổ quỹ tổng hợp được gắn đúng vào tab Quỹ và có đủ bộ lọc/KPI/bảng/chi tiết', () => {
  const main = read('public/fragments/index/04-index-body.html');
  const modals = read('public/fragments/index/05-index-body.html');
  assert.match(main, /data-fund-tab="fundSummaryBook"[^>]*>Sổ quỹ tổng hợp</);
  assert.match(main, /data-fund-panel="fundSummaryBook"/);
  for (const id of [
    'fundSummaryDateFrom', 'fundSummaryDateTo', 'fundSummaryPersonSearch',
    'fundSummaryRoleFilter', 'fundSummaryTransactionFilter', 'fundSummaryFundFilter',
    'applyFundSummaryFiltersButton', 'resetFundSummaryFiltersButton', 'exportFundSummaryButton',
    'fundSummaryDepositedKpi', 'fundSummaryExpenseKpi', 'fundSummaryNetKpi',
    'fundSummaryPeopleKpi', 'fundSummaryDepositCountKpi', 'fundSummaryExpenseCountKpi',
    'fundSummaryTableBody'
  ]) assert.match(main, new RegExp(`id="${id}"`));
  assert.match(modals, /id="fundSummaryDetailModal"/);
  assert.match(modals, /id="fundSummaryDetailTable"/);
});

test('frontend mặc định ngày Việt Nam, gọi API tổng hợp/chi tiết/export và không tải toàn lịch sử', () => {
  const source = read('public/js/app/debt/07g-fund-summary.js');
  assert.match(source, /timeZone:\s*'Asia\/Ho_Chi_Minh'/);
  assert.match(source, /\/api\/funds\/summary\?/);
  assert.match(source, /\/api\/funds\/summary\/\$\{encodeURIComponent\(state\.detail\.personKey\)\}\/transactions/);
  assert.match(source, /\/api\/funds\/summary\/export\?/);
  assert.match(source, /params\.set\('fromDate'/);
  assert.match(source, /params\.set\('toDate'/);
  assert.doesNotMatch(source, /limit['"],\s*['"]1000000/);
});

test('route báo cáo dùng cùng quyền viewFund và đặt export trước personKey động', () => {
  const routes = read('src/routes/fundRoutes.js');
  assert.match(routes, /router\.get\('\/summary', viewFund, fundController\.getSummary\)/);
  assert.match(routes, /router\.get\('\/summary\/export', viewFund, fundController\.exportSummary\)/);
  assert.match(routes, /router\.get\('\/summary\/:personKey\/transactions', viewFund, fundController\.getSummaryTransactions\)/);
  assert.ok(routes.indexOf("'/summary/export'") < routes.indexOf("'/summary/:personKey/transactions'"));
});

test('phiếu chi mới lưu metadata người nhận nhưng vẫn giữ tương thích trường receiverName cũ', () => {
  const model = read('src/models/ExpenseVoucher.js');
  const source = require('./helpers/sourceBundle.util').readSource('src/services/fundService.js');
  assert.match(model, /receiverCode:\s*String/);
  assert.match(model, /receiverName:\s*String/);
  assert.match(model, /receiverRole:\s*String/);
  assert.match(source, /receiverCode:\s*String\(body\.receiverCode/);
  assert.match(source, /receiverName:\s*String\(body\.receiverName/);
  assert.match(source, /receiverRole:\s*String\(body\.receiverRole/);
  assert.match(source, /receiverCode:\s*updated\.receiverCode/);
});

test('source bundle Quỹ chuyển tab tổng hợp sang module riêng và ẩn toolbar cũ', () => {
  const source = require('./helpers/sourceBundle.util').readSource('public/js/app/debt/07f-fund-ledger.js');
  assert.match(source, /activeFundTab==='fundSummaryBook'/);
  assert.match(source, /window\.FundSummaryBook/);
  assert.match(source, /commonToolbar\.hidden=activeFundTab==='fundSummaryBook'/);
  const scripts = read('public/fragments/index/07-index-body.html');
  assert.match(scripts, /07g-fund-summary\.js/);
  const shell = read('public/index.shell.html');
  assert.match(shell, /61-fund-summary\.css/);
});
