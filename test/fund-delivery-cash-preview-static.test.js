'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('popup nộp quỹ có bảng tiền mặt và tài khoản theo ngày/NVGH', () => {
  const html = read('public/index.html');

  assert.match(html, /id="deliveryCashSubmissionDate"[^>]*name="deliveryDate"/);
  assert.match(html, /id="deliveryCashSubmissionStaffCode"[^>]*name="deliveryStaffCode"/);
  assert.match(html, /id="deliveryCashSubmissionPreview"/);
  assert.match(html, /id="deliveryCashSubmissionReportCash"/);
  assert.match(html, /id="deliveryCashSubmissionReportBank"/);
  assert.match(html, /id="deliveryCashSubmissionPreviewTable"/);
  assert.match(html, /Tiền mặt cần thu/);
  assert.match(html, /Tài khoản cần thu/);
  assert.match(html, /Thực nộp tiền mặt/);
  assert.match(html, /Thực nhận tài khoản/);
});

test('frontend tự tải preview khi đổi ngày hoặc mã NVGH và render đối chiếu', () => {
  const state = read('public/js/app/state/00b-debt-return-fund-state.js');
  const js = read('public/js/app/debt/07f-fund-ledger.js');

  assert.match(state, /const deliveryCashSubmissionDate=/);
  assert.match(state, /const deliveryCashSubmissionStaffCode=/);
  assert.match(state, /const deliveryCashSubmissionPreviewTable=/);
  assert.match(js, /fetch\('\/api\/funds\/delivery-cash-submissions\/preview'/);
  assert.match(js, /body:JSON\.stringify\(filters\)/);
  assert.match(js, /deliveryCashSubmissionDate\.addEventListener\('change'/);
  assert.match(js, /deliveryCashSubmissionStaffCode\.addEventListener\('input'/);
  assert.match(js, /renderDeliveryCashSubmissionPreview\(json\)/);
  assert.match(js, /updateDeliveryCashSubmissionDifference/);
  assert.match(js, /deliveryCashSubmissionCashInput\.value=Math\.round/);
  assert.match(js, /deliveryCashSubmissionBankInput\.value=Math\.round/);
});

test('preview dùng API nghiệp vụ hiện hữu và tổng tiền chuẩn từ fundService', () => {
  const routes = read('src/routes/fundRoutes.js');
  const controller = read('src/controllers/fundController.js');
  const service = read('src/services/fundService.js');

  assert.match(routes, /post\('\/delivery-cash-submissions\/preview'/);
  assert.match(controller, /fundService\.buildDeliverySubmissionDraft/);
  assert.match(service, /reportCashAmount/);
  assert.match(service, /reportBankAmount/);
  assert.match(service, /reportCurrentOrderCashAmount/);
  assert.match(service, /reportCurrentOrderBankAmount/);
  assert.match(service, /reportOldDebtCashAmount/);
  assert.match(service, /reportOldDebtBankAmount/);
  assert.match(service, /DeliveryPaymentStateReadService\.resolvePaymentStatesForOrders/);
  assert.match(service, /DeliveryPaymentStateReadService\.stateForOrder/);
  assert.match(service, /normalizeText\(pickDeliveryStaffCode\(row\)/);
  assert.doesNotMatch(service, /numberFromRow\(row, \['cashAmount', 'cashCollected'\]\)/);
});

test('CSS hỗ trợ popup rộng, KPI và bảng cuộn trực quan', () => {
  const css = read('public/css/10-operational-overrides.css');

  assert.match(css, /\.fund-voucher-modal-card\{width:min\(980px,96vw\)/);
  assert.match(css, /\.delivery-cash-preview-kpis/);
  assert.match(css, /\.delivery-cash-preview-table-scroll/);
  assert.match(css, /\.delivery-cash-preview-table thead th\{position:sticky/);
  assert.match(css, /\.delivery-cash-preview-table tfoot th\{position:sticky/);
});
