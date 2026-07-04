'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('delivery adjustment popup treats reason as optional and does not block zero-difference saves', () => {
  const ui = read('public/js/app/new/91-delivery-today-new.js');

  assert.match(ui, /Lý do điều chỉnh \/ tùy chọn/);
  assert.match(ui, /Có thể để trống/);
  assert.doesNotMatch(ui, /Vui lòng nhập lý do điều chỉnh/);
  assert.doesNotMatch(ui, /Không có chênh lệch để điều chỉnh/);
  assert.doesNotMatch(ui, /if \(!reason\)[\s\S]{0,120}setModalError\('adjustment'/);
  assert.doesNotMatch(ui, /!correctedReturnItems\.length\s*&&\s*!cashLines\.length[\s\S]{0,180}return;/);
});

test('correction service does not reject empty reason or no financial delta', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');

  assert.match(service, /function correctionReason\(input = \{\}\)/);
  assert.match(service, /function correctionAuditReason\(input = \{\}\)/);
  assert.match(service, /Điều chỉnh không ghi lý do/);
  assert.doesNotMatch(service, /DELIVERY_CLOSEOUT_CORRECTION_REASON_REQUIRED/);
  assert.doesNotMatch(service, /Bắt buộc nhập lý do điều chỉnh/);
  assert.doesNotMatch(service, /DELIVERY_CLOSEOUT_CORRECTION_EMPTY/);
  assert.doesNotMatch(service, /Không có chênh lệch hàng trả hoặc tiền thu để điều chỉnh/);
  assert.match(service, /No-change corrections are intentionally allowed/);
});

test('correction service still keeps negative corrected payment validation', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');

  assert.match(service, /if \(money\(line\.newAmount\) < 0\)/);
  assert.match(service, /DELIVERY_CLOSEOUT_CORRECTION_NEGATIVE_CASH/);
  assert.match(service, /Tiền mặt sau điều chỉnh/);
  assert.match(service, /Chuyển khoản sau điều chỉnh/);
  assert.match(service, /Trả thưởng sau điều chỉnh/);
});

test('no-change correction response does not claim a zero AR-DEBT-ADJUSTMENT ledger was posted', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');

  assert.match(service, /không sinh AR-DEBT-ADJUSTMENT vì không có chênh lệch công nợ/);
  assert.match(service, /ledgerEntry && ledgerEntry\.code/);
});
