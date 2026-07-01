'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('retired debt compatibility helper keeps overpaid customers out of open debt status', () => {
  const src = read('public/js/app/debt/07a-debt-core.js');
  assert.match(src, /function matchDebtStatus\(row=\{\}, status=''\)/);
  assert.match(src, /return debt>0;/);
  assert.doesNotMatch(src, /return hasOpenDebt\(d\.debt\) \|\| isOverpaidDebt\(d\.debt\);/);
  assert.match(src, /window\.__legacyDebtScreenRetired = true/);
});

test('Debt New collection tab blocks submission until payable debt orders are selected', () => {
  const src = read('public/js/app/new/92-debt-new.js');
  assert.match(src, /function selectedDebtOrders\(customer\)/);
  assert.match(src, /openDebt\(order\) > 0/);
  assert.match(src, /Tick các đơn còn nợ để lập phiếu thu chờ xác nhận/);
  assert.match(src, /if \(!selected\.length\) throw new Error\('Cần chọn ít nhất một đơn nợ\.'\)/);
  assert.match(src, /if \(amount > maxAmount\) throw new Error\('Số tiền thu vượt tổng nợ đơn đã chọn\.'\)/);
});


test('Debt New sends canonical debt API filter params and does not require customer q when NVGH is present', () => {
  const src = read('public/js/app/new/92-debt-new.js');
  assert.match(src, /return Boolean\(f\.q \|\| f\.customerCode \|\| f\.orderCode \|\| f\.salesman \|\| f\.salesStaffCode \|\| f\.delivery \|\| f\.deliveryStaffCode\)/);
  assert.match(src, /salesStaffCode: normalizedText\(state\.selectedFilters\.salesStaffCode\)/);
  assert.match(src, /deliveryStaffCode: normalizedText\(state\.selectedFilters\.deliveryStaffCode\)/);
  assert.match(src, /status: byId\('debtNewStatus'\) \? byId\('debtNewStatus'\)\.value : 'open'/);
  assert.match(src, /var params = new URLSearchParams\(filters\(\)\)/);
});
