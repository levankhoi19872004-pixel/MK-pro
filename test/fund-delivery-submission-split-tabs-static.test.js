'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('danh sách nộp quỹ được tách thành tab tiền mặt và chuyển khoản', () => {
  const html = read('public/index.html');

  assert.match(html, /data-delivery-subtab="cash"[^>]*>Tiền mặt</);
  assert.match(html, /data-delivery-subtab="bank"[^>]*>Chuyển khoản</);
  assert.match(html, /data-delivery-subpanel="cash"/);
  assert.match(html, /data-delivery-subpanel="bank"/);
  assert.match(html, /id="deliveryCashSubmissionTable"/);
  assert.match(html, /id="deliveryBankSubmissionTable"/);
  assert.match(html, /Báo cáo TM/);
  assert.match(html, /Thực nộp TM/);
  assert.match(html, /Báo cáo TK/);
  assert.match(html, /Thực nhận TK/);
});

test('frontend render chênh lệch độc lập theo tiền mặt và chuyển khoản', () => {
  const state = read('public/js/app/state/00b-debt-return-fund-state.js');
  const js = read('public/js/app/debt/07f-fund-ledger.js');

  assert.match(state, /const deliveryBankSubmissionTable=/);
  assert.match(state, /const deliverySubmissionTabButtons=/);
  assert.match(js, /function setActiveDeliverySubmissionTab/);
  assert.match(js, /reportField=isBank\?'reportBankAmount':'reportCashAmount'/);
  assert.match(js, /submittedField=isBank\?'submittedBankAmount':'submittedCashAmount'/);
  assert.match(js, /differenceField=isBank\?'differenceBankAmount':'differenceCashAmount'/);
  assert.match(js, /renderDeliverySubmissionRows\(rows,\{fundType:'cash'\}\)/);
  assert.match(js, /renderDeliverySubmissionRows\(rows,\{fundType:'bank'\}\)/);
});

test('hai tab dùng chung một phiếu và cùng thao tác sửa xác nhận', () => {
  const js = read('public/js/app/debt/07f-fund-ledger.js');
  assert.match(js, /fundRowCache\.delivery\[key\]=r/);
  assert.match(js, /fundActionButtons\('delivery',r\)/);
  assert.doesNotMatch(js, /\/api\/funds\/delivery-bank-submissions/);
});

test('CSS hiển thị sub-tab rõ ràng và responsive', () => {
  const css = read('public/css/10-operational-overrides.css');
  assert.match(css, /\.delivery-subtab-nav\{/);
  assert.match(css, /\.delivery-subtab-button\.active\{/);
  assert.match(css, /\.delivery-subtab-panel\.active\{/);
});
