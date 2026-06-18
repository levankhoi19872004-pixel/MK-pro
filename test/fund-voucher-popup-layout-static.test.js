'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('mỗi tab quỹ có nút tạo phiếu riêng và form nằm trong popup tương ứng', () => {
  const html = read('public/index.html');

  assert.match(html, /data-fund-panel="deliverySubmission"[\s\S]*?id="createDeliveryCashSubmissionButton"/);
  assert.match(html, /data-fund-panel="expenseVoucher"[\s\S]*?id="createExpenseVoucherButton"/);
  assert.match(html, /data-fund-panel="bankTransfer"[\s\S]*?id="createFundTransferButton"/);

  assert.match(html, /id="deliveryCashSubmissionModal"[\s\S]*?id="deliveryCashSubmissionForm"/);
  assert.match(html, /id="expenseVoucherModal"[\s\S]*?id="expenseVoucherForm"/);
  assert.match(html, /id="fundTransferModal"[\s\S]*?id="fundTransferForm"/);

  assert.equal((html.match(/id="deliveryCashSubmissionForm"/g) || []).length, 1);
  assert.equal((html.match(/id="expenseVoucherForm"/g) || []).length, 1);
  assert.equal((html.match(/id="fundTransferForm"/g) || []).length, 1);
});

test('nút tạo và nút sửa mở đúng popup, lưu thành công đóng popup', () => {
  const state = read('public/js/app/state/00a-catalog-orders-state.js') + read('public/js/app/state/00b-debt-return-fund-state.js');
  const fundUi = read('public/js/app/debt/07f-fund-ledger.js');

  assert.match(state, /const createDeliveryCashSubmissionButton=/);
  assert.match(state, /const createExpenseVoucherButton=/);
  assert.match(state, /const createFundTransferButton=/);

  assert.match(fundUi, /bindFundVoucherModal\('delivery',createDeliveryCashSubmissionButton/);
  assert.match(fundUi, /bindFundVoucherModal\('expense',createExpenseVoucherButton/);
  assert.match(fundUi, /bindFundVoucherModal\('transfer',createFundTransferButton/);
  assert.match(fundUi, /openFundVoucherModal\(type\);/);
  assert.match(fundUi, /closeFundVoucherModal\('delivery'\)/);
  assert.match(fundUi, /closeFundVoucherModal\('expense'\)/);
  assert.match(fundUi, /closeFundVoucherModal\('transfer'\)/);
});

test('asset quỹ được cache-bust để trình duyệt nhận giao diện popup và bảng tiền cần thu mới', () => {
  const html = read('public/index.html');
  assert.match(html, /css\/overrides\/10-operational-01\.css\?v=phase79-source-split-v1/);
  assert.match(html, /css\/overrides\/10-operational-04\.css\?v=phase79-source-split-v1/);
  assert.match(html, /00b-debt-return-fund-state\.js\?v=phase61-delivery-fund-split-tabs-v1/);
  assert.match(html, /07f-fund-ledger\.js\?v=phase61-delivery-fund-split-tabs-v1/);
});


test('popup nộp quỹ tự tải bảng tiền mặt và tài khoản theo ngày giao + NVGH', () => {
  const html = read('public/index.html');
  const state = read('public/js/app/state/00b-debt-return-fund-state.js');
  const fundUi = read('public/js/app/debt/07f-fund-ledger.js');
  const routes = read('src/routes/fundRoutes.js');
  const service = read('src/services/fundService.js');

  assert.match(html, /id="deliveryCashSubmissionPreview"[\s\S]*?id="deliveryCashSubmissionPreviewTable"/);
  assert.match(html, /Tiền mặt cần thu/);
  assert.match(html, /Tài khoản cần thu/);
  assert.match(html, /id="deliveryCashSubmissionCashInput"/);
  assert.match(html, /id="deliveryCashSubmissionBankInput"/);

  assert.match(state, /const deliveryCashSubmissionPreviewTable=/);
  assert.match(state, /const deliveryCashSubmissionReportCash=/);
  assert.match(state, /const deliveryCashSubmissionReportBank=/);

  assert.match(fundUi, /delivery-cash-submissions\/preview/);
  assert.match(fundUi, /scheduleDeliveryCashSubmissionPreview/);
  assert.match(fundUi, /deliveryCashSubmissionDate\.addEventListener\('change'/);
  assert.match(fundUi, /deliveryCashSubmissionStaffCode\.addEventListener\('input'/);
  assert.match(fundUi, /AbortController/);
  assert.match(fundUi, /reportOldDebtCashAmount/);
  assert.match(fundUi, /reportOldDebtBankAmount/);

  assert.match(routes, /post\('\/delivery-cash-submissions\/preview'/);
  assert.match(service, /async function buildDeliverySubmissionDraft/);
  assert.match(service, /reportCashAmount/);
  assert.match(service, /reportBankAmount/);
});
