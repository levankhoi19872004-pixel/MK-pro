'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('Delivery Today New main screen is list-only and opens adjustment popup', () => {
  const shellStart = source.indexOf('root.innerHTML');
  const shellEnd = source.indexOf('var dateInput', shellStart);
  const shell = source.slice(shellStart, shellEnd);
  assert.equal(shell.includes('delivery-v46-detail-panel'), false);
  assert.match(shell, /Thao tác/);
  assert.match(source, /Điều chỉnh/);
  assert.match(shell, /deliveryTodayNewAdjustmentModal/);
});

test('Delivery Today New adjustment popup has business tabs and delivery return quantity input', () => {
  assert.match(source, /Tổng quan/);
  assert.match(source, /Hàng giao/);
  assert.match(source, /Hàng trả/);
  assert.match(source, /Thu tiền/);
  assert.match(source, /Công nợ/);
  assert.match(source, /Lịch sử/);
  assert.match(source, /SL trả đúng/);
  assert.match(source, /oldReturnQty/);
  assert.match(source, /newReturnQty/);
  assert.match(source, /adjustmentQty/);
  assert.match(source, /adjustmentAmount/);
});

test('Delivery Today New adjustment popup posts only Phase92 correction contract', () => {
  assert.match(source, /\/api\/new\/delivery-today\/closeouts\//);
  assert.match(source, /correctedReturnItems/);
  assert.match(source, /correctedCashLines/);
  assert.match(source, /reason/);
  assert.match(source, /note/);
  assert.doesNotMatch(source, /\/api\/return-orders/);
  assert.doesNotMatch(source, /AR-SALE-REVERSAL/);
  assert.doesNotMatch(source, /stockTransactions/);
  assert.doesNotMatch(source, /InventoryPostingService/);
  assert.doesNotMatch(source, /ReturnArPostingService/);
});

test('Delivery Today New payment correction renders DOM delta cells and final-amount semantics', () => {
  assert.doesNotMatch(source, /<span id="deliveryCashDeltaText"/);
  assert.match(source, /detailCellValueId\('Chênh lệch tiền mặt', 'deliveryCashDeltaText'/);
  assert.match(source, /detailCellValueId\('Chênh lệch chuyển khoản', 'deliveryBankDeltaText'/);
  assert.match(source, /detailCellValueId\('Chênh lệch trả thưởng', 'deliveryRewardDeltaText'/);
  assert.match(source, /detailCellValueId\('Tổng chênh lệch tiền thu', 'deliveryCashTotalDeltaText'/);
  assert.match(source, /parseVietnameseMoney/);
  assert.match(source, /formatVietnameseMoney/);
  assert.match(source, /cashDeltaAmount\s*=\s*correctedCashAmount\s*-\s*currentCashAmount/);
  assert.match(source, /bankDeltaAmount\s*=\s*correctedBankAmount\s*-\s*currentBankAmount/);
  assert.match(source, /rewardDeltaAmount\s*=\s*correctedRewardAmount\s*-\s*currentRewardAmount/);
  assert.doesNotMatch(source, /oldCash\s*\+\s*newCash/);
  assert.doesNotMatch(source, /currentCashAmount\s*\+\s*correctedCashAmount/);
});



test('Delivery Today New correction modal labels final amounts and keeps disabled tab text readable', () => {
  assert.match(source, /Tiền mặt sau điều chỉnh/);
  assert.match(source, /Chuyển khoản sau điều chỉnh/);
  assert.match(source, /Trả thưởng sau điều chỉnh/);
  assert.doesNotMatch(source, /Tiền mặt đúng/);
  assert.doesNotMatch(source, /Chuyển khoản đúng/);
  assert.doesNotMatch(source, /Trả thưởng đúng/);
  assert.match(source, /Nhập số tiền cuối cùng muốn ghi nhận/);
  assert.match(source, /delivery-new-tab:disabled/);
  assert.match(source, /delivery-new-tab\.is-disabled/);
  assert.match(source, /opacity:1/);
  assert.match(source, /background:#f1f5f9/);
  assert.match(source, /color:#64748b/);
  assert.match(source, /delivery-new-tab\.active\{background:#2563eb;color:#fff/);
  assert.match(source, /placeholder="Nhập số tiền cuối cùng"/);
  assert.match(source, /deltaMoney/);
});

test('Delivery Today New adjustment modal close button stays actionable and explains correction mode', () => {
  assert.match(source, /aria-label="Đóng modal điều chỉnh đơn giao"/);
  assert.match(source, /closeTop\.addEventListener\('click', closeAdjustmentPopup\)/);
  assert.match(source, /closeBottom\.addEventListener\('click', closeAdjustmentPopup\)/);
  assert.doesNotMatch(source, /deliveryTodayNewModalCloseTop[\s\S]{0,160}disabled/);
  assert.match(source, /Đơn đã chốt sổ\. Tab Thu tiền cho phép tạo correction tiền thu/);
  assert.match(source, /Dữ liệu tiền thu hiện tại đang âm/);
});


test('Phase108 payment correction preserves explicit zero final amounts on the frontend', () => {
  assert.match(source, /function hasMoneyInputValue\(input\)/);
  assert.match(source, /function readCorrectedMoney\(inputValue, fallbackValue\)/);
  assert.match(source, /String\(input\)\.trim\(\) !== ''/);
  assert.match(source, /return parseVietnameseMoney\(inputValue\)/);
  assert.match(source, /var newCash = readCorrectedMoney\([\s\S]*oldCash\)/);
  assert.match(source, /var newBank = readCorrectedMoney\([\s\S]*oldBank\)/);
  assert.match(source, /var newReward = readCorrectedMoney\([\s\S]*oldReward\)/);
  assert.doesNotMatch(source, /parseVietnameseMoney\([^\n]+\)\s*\|\|\s*oldCash/);
  assert.doesNotMatch(source, /parseVietnameseMoney\([^\n]+\)\s*\|\|\s*currentCashAmount/);
  assert.doesNotMatch(source, /correctedCashAmount\s*\|\|\s*currentCashAmount/);
  assert.match(source, /if \(hasMoneyInputValue\(el\.value\)\) \{\s*el\.value = formatVietnameseMoney\(el\.value\);\s*\}/);
});


test('Phase109 correction UI explains final-state persistence and shows full version state history', () => {
  assert.match(source, /Hệ thống lưu giá trị này làm trạng thái mới/);
  assert.match(source, /chỉ dùng để ghi lịch sử/);
  assert.match(source, /Tiền mặt mới/);
  assert.match(source, /Chuyển khoản mới/);
  assert.match(source, /Trả thưởng mới/);
  assert.match(source, /Công nợ mới/);
  assert.match(source, /CL tiền mặt/);
  assert.match(source, /CL chuyển khoản/);
  assert.match(source, /CL trả thưởng/);
});
