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
