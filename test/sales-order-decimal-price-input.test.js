'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return require('./helpers/sourceBundle.util').readSource(path.join(root, relativePath));
}

test('sales order line price accepts decimal DMS values', () => {
  const source = read('public/js/app/05-sales-orders.js');

  assert.match(
    source,
    /class="sales-line-input price"[^>]*type="number"[^>]*min="0"[^>]*step="any"/,
    'Ô giá trên từng dòng đơn phải có step="any" để chấp nhận đơn giá DMS thập phân'
  );
});

test('new sales item price accepts decimal values', () => {
  const html = read('public/index.html');

  assert.match(
    html,
    /id="salesPrice"[^>]*type="number"[^>]*min="0"[^>]*step="any"/,
    'Ô giá khi thêm sản phẩm phải có step="any"'
  );
});

test('sales order script remains cache-busted after later patches', () => {
  const html = read('public/index.html');
  assert.match(html, /05-sales-orders\.js\?v=phase86-production-hardening-v1/);
  assert.match(html, /05-sales-orders\.part02\.js\?v=phase86-production-hardening-v1/);
  assert.match(html, /05-sales-orders\.part03\.js\?v=phase86-production-hardening-v1/);
  assert.match(html, /05-sales-orders\.part04\.js\?v=phase86-production-hardening-v1/);
});
