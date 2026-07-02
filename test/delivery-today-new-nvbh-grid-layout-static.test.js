'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'),
  'utf8'
);

const salesmanGridColumns = /grid-template-columns:\s*42px\s+minmax\(220px,1\.6fr\)\s+70px\s+repeat\(6,minmax\(92px,1fr\)\)/;

function salesmanRowRenderBody() {
  const rowStart = source.indexOf('return \'<div class="delivery-new-salesman-grid delivery-new-salesman-grid-row');
  assert.ok(rowStart > 0, 'missing salesman grid row render');
  const renderStart = rowStart;
  const renderEnd = source.indexOf("'</div>';", rowStart);
  assert.ok(renderEnd > renderStart, 'missing complete salesman row render string');
  return source.slice(renderStart, renderEnd + "'</div>';".length);
}

test('Delivery Today New NVBH grid rows must not use display contents', () => {
  assert.doesNotMatch(
    source,
    /delivery-new-salesman-grid-row\s*\{[^}]*display\s*:\s*contents/i
  );
  assert.doesNotMatch(
    source,
    /delivery-new-salesman-grid-row[^;{}]*display\s*:\s*contents/i
  );
});

test('Delivery Today New NVBH header and row use the same grid layout', () => {
  assert.match(source, /delivery-new-salesman-grid-head/);
  assert.match(source, /delivery-new-salesman-grid-row/);
  assert.match(source, /delivery-new-salesman-grid-row\s*\{[^}]*display\s*:\s*grid/i);
  assert.match(source, salesmanGridColumns);
});

test('Delivery Today New NVBH row keeps all KPI cells inside one row', () => {
  const rowBody = salesmanRowRenderBody();

  assert.match(rowBody, /delivery-new-salesman-check-cell/);
  assert.match(rowBody, /delivery-new-salesman-name/);
  assert.match(rowBody, /delivery-new-salesman-num/);
  assert.match(rowBody, /delivery-new-salesman-money/);
  assert.match(rowBody, /group\.orderCount/);
  assert.match(rowBody, /group\.originalAmount/);
  assert.match(rowBody, /group\.cashAmount/);
  assert.match(rowBody, /group\.bankAmount/);
  assert.match(rowBody, /group\.returnedAmount/);
  assert.match(rowBody, /group\.finalDebtAmount/);
});

test('Delivery Today New NVBH grid has all 9 columns', () => {
  ['Chọn', 'NVBH', 'Đơn', 'PT', 'TM', 'CK', 'TT', 'HT', 'CN'].forEach((label) => {
    assert.match(source, new RegExp('>' + label + '<'));
  });
});

test('Delivery Today New NVBH grid only enables vertical scroll for long lists', () => {
  assert.match(source, /delivery-new-salesman-grid-wrap\{[^}]*overflow-x\s*:\s*auto[^}]*overflow-y\s*:\s*visible[^}]*max-height\s*:\s*none/i);
  assert.match(source, /delivery-new-salesman-grid-wrap\.is-scrollable\{[^}]*max-height\s*:\s*260px[^}]*overflow-y\s*:\s*auto/i);
  assert.match(source, /groups\.length\s*>\s*6\s*\?\s*' is-scrollable'/);
});
