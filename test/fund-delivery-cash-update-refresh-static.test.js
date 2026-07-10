'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('sửa phiếu nộp quỹ phải dựng lại số báo cáo từ ngày giao và NVGH hiện tại', () => {
  const service = read('src/services/fundService.js');

  assert.match(service, /async function updateDeliveryCashSubmission/);
  assert.match(service, /const rebuilt = hasConfirmedLines[\s\S]*await buildDeliverySubmissionDraft\(/);
  assert.match(service, /deliveryDate,/);
  assert.match(service, /deliveryStaffCode,/);
  assert.match(service, /submittedCashAmount,/);
  assert.match(service, /submittedBankAmount,/);
  assert.match(service, /if \(rebuilt\.error\) return rebuilt;/);
  assert.match(service, /\.\.\.refreshed/);
  assert.doesNotMatch(
    service,
    /differenceCashAmount: submittedCashAmount - money\(current\.reportCashAmount\)/
  );
});

test('cập nhật dùng đúng bản ghi cũ và chặn trùng mã ngày + NVGH', () => {
  const service = read('src/services/fundService.js');
  const repository = read('src/repositories/deliveryCashSubmissionRepository.js');

  assert.match(service, /isSameDeliveryCashSubmission/);
  assert.match(service, /findByIdOrCode\(refreshed\.code\)/);
  assert.match(service, /status: 409/);
  assert.match(service, /patchByIdOrCode\(idOrCode, updated\)/);
  assert.match(repository, /async function patchByIdOrCode/);
  assert.match(repository, /collectionRepository\.patchByIdentity/);
  assert.match(repository, /module\.exports = \{ findAll, findByIdOrCode, upsert, patchByIdOrCode \}/);
});

test('bản cập nhật giữ metadata gốc nhưng thay toàn bộ snapshot báo cáo mới', () => {
  const service = read('src/services/fundService.js');

  assert.match(service, /\.\.\.current,\s*\.\.\.refreshed,/s);
  assert.match(service, /createdAt: current\.createdAt \|\| refreshed\.createdAt/);
  assert.match(service, /createdBy: current\.createdBy \|\| refreshed\.createdBy/);
  assert.match(service, /status: 'pending'/);
  assert.match(service, /fundPosted: false/);
  assert.match(service, /orders: rebuilt\.orders/);
  assert.match(service, /Đã cập nhật phiếu nộp quỹ và các dòng ngày nộp thực tế/);
});
