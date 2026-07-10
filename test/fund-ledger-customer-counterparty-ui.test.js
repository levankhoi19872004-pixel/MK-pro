'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadCounterpartyHelpers() {
  const file = path.join(ROOT, 'public/js/app/01-utils-print-tabs.js');
  const source = require('./helpers/sourceBundle.util').readSource(file);
  const marker = '// UI_CANONICAL_STAFF_FIELDS_END';
  const end = source.indexOf(marker);
  assert.ok(end > 0, 'Không tìm thấy vùng helper canonical UI');

  const context = vm.createContext({
    window: { V45Common: {} }
  });
  vm.runInContext(source.slice(0, end + marker.length), context, { filename: file });
  return context;
}

test('Sổ quỹ ưu tiên khách hàng cho nguồn thu công nợ', () => {
  const helpers = loadCounterpartyHelpers();
  const label = helpers.canonicalFundCounterpartyLabel({
    sourceType: 'debtCollection',
    customerCode: '4499569',
    customerName: 'Vân Xô',
    deliveryStaffCode: 'ghtt',
    deliveryStaffName: 'Thành GH Tiền Hải'
  });

  assert.equal(label, '4499569 - Vân Xô');
});

test('Sổ quỹ vẫn hiển thị NVGH cho nguồn nộp quỹ giao hàng', () => {
  const helpers = loadCounterpartyHelpers();
  const label = helpers.canonicalFundCounterpartyLabel({
    sourceType: 'DELIVERY_CASH_SUBMISSION',
    customerCode: '4499569',
    customerName: 'Vân Xô',
    deliveryStaffCode: 'ghtt',
    deliveryStaffName: 'Thành GH Tiền Hải'
  });

  assert.equal(label, 'ghtt - Thành GH Tiền Hải');
});

test('Phiếu thu công nợ cũ thiếu khách hàng vẫn fallback người thu để không mất thông tin', () => {
  const helpers = loadCounterpartyHelpers();
  const label = helpers.canonicalFundCounterpartyLabel({
    refType: 'debt_collection',
    deliveryStaffCode: 'ghtt',
    deliveryStaffName: 'Thành GH Tiền Hải'
  });

  assert.equal(label, 'ghtt - Thành GH Tiền Hải');
});

test('Bảng Sổ quỹ sử dụng helper đối tượng theo nguồn', () => {
  const file = path.join(ROOT, 'public/js/app/debt/07f-fund-ledger.js');
  const source = require('./helpers/sourceBundle.util').readSource(file);
  assert.match(source, /canonicalFundCounterpartyLabel\(e\)/);
  assert.doesNotMatch(source, /const staffLabel=canonicalFundStaffLabel\(e\)/);
});


test('index cache-busts các script Sổ quỹ đã sửa', () => {
  const file = path.join(ROOT, 'public/index.html');
  const source = require('./helpers/sourceBundle.util').readSource(file);
  assert.match(source, /01-utils-print-tabs\.js\?v=phase62-picking-zone-v1/);
  assert.match(source, /07f-fund-ledger\.js\?v=phase230-remittance-lines-v1/);
  assert.match(source, /07f-fund-ledger\.part02\.js\?v=phase230-remittance-lines-v1/);
  assert.match(source, /07f-fund-ledger\.part03\.js\?v=phase230-remittance-lines-v1/);
  assert.match(source, /07f-fund-ledger\.part04\.js\?v=phase230-remittance-lines-v1/);
  assert.match(source, /07f-fund-ledger\.part05\.js\?v=phase230-remittance-lines-v1/);
});
