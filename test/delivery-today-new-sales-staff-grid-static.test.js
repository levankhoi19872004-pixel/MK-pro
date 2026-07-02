'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('Delivery Today New has compact NVBH grid labels and columns', () => {
  assert.match(source, /NVBH thuộc NVGH đang chọn/);
  assert.match(source, /delivery-new-salesman-grid-wrap/);
  assert.match(source, /delivery-new-salesman-grid-head/);
  ['Chọn', 'NVBH', 'Đơn', 'PT', 'TM', 'CK', 'TT', 'HT', 'CN'].forEach((label) => {
    assert.match(source, new RegExp('>' + label + '<'));
  });
});

test('Delivery Today New does not render bulk NVBH select buttons', () => {
  assert.doesNotMatch(source, /Chọn tất cả NVBH/);
  assert.doesNotMatch(source, /Bỏ chọn tất cả NVBH/);
  assert.doesNotMatch(source, /deliveryTodayNewSelectAllSalesmen/);
  assert.doesNotMatch(source, /deliveryTodayNewClearAllSalesmen/);
});

test('Delivery Today New compact grid has checkbox state and visual rules', () => {
  assert.match(source, /data-salesman-key/);
  assert.match(source, /groupSelectionState/);
  assert.match(source, /input\.indeterminate/);
  assert.match(source, /is-selected/);
  assert.match(source, /is-unselected/);
  assert.match(source, /moneyDash/);
  assert.match(source, /reward-positive/);
  assert.match(source, /bank-positive/);
  assert.match(source, /delivery-new-debt/);
});
