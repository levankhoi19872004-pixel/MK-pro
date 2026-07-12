const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag'), 'utf8');
const handlerSource = fs.readFileSync(path.join(root, 'public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag'), 'utf8');

test('delivery fund submission actions have distinct business captions', () => {
  assert.match(source, /const editLabel=type==='delivery'\?'Sửa phiếu':'Sửa'/);
  assert.match(source, /const confirmLabel='Xác nhận'/);
  assert.doesNotMatch(source, /type==='delivery'\?'Xử lý'/);
  assert.match(source, /type==='delivery'\?'Sửa phiếu':'Sửa'/);
  assert.match(source, /const confirmLabel='Xác nhận'/);
});

test('delivery action buttons keep the existing handlers and action contract', () => {
  assert.match(source, /data-fund-action="edit"/);
  assert.match(source, /data-fund-action="confirm"/);
  assert.match(handlerSource, /if\(action==='edit'\)editFundVoucher\(type,code\)/);
  assert.match(handlerSource, /if\(action==='confirm'\)confirmFundVoucher\(type,code,button\)/);
  const confirmSource = fs.readFileSync(path.join(root, 'public/js/app/debt/07f-fund-ledger.source/part-02b.jsfrag'), 'utf8');
  assert.match(confirmSource, /if\(type==='delivery'\)return confirmDeliveryCashSubmission\(code,triggerButton\)/);
});

test('delivery action buttons expose specific tooltip and accessible labels', () => {
  assert.match(source, /Mở phiếu nộp quỹ để chỉnh sửa thông tin đã khai báo\./);
  assert.match(source, /Xác nhận phiếu nộp và ghi nhận các dòng đủ điều kiện vào sổ quỹ\./);
  assert.match(source, /aria-label="\$\{escapeHtml\(`\$\{editLabel\} \$\{rawCode\}`\)\}"/);
  assert.match(source, /aria-label="\$\{escapeHtml\(`\$\{confirmLabel\} phiếu \$\{rawCode\}`\)\}"/);
});
