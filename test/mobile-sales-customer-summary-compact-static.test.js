'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('mobile sales selected customer summary renders only two compact lines and hides empty phone text', () => {
  const source = read('public/mobile/js/sales.source/part-01b.jsfrag');
  assert.match(source, /function renderSelectedCustomerContext/);
  assert.match(source, /heading:\s*`\$\{code \|\| ''\}/);
  assert.match(source, /lines:\s*\[/);
  assert.match(source, /DS tháng/);
  assert.doesNotMatch(source, /`SĐT:\s*\$\{customerPhoneValue/);
  assert.doesNotMatch(source, /Chưa có SDT/);
  assert.doesNotMatch(source, /Chưa có SĐT/);
});

test('mobile sales customer summary css caps height and keeps two-line layout', () => {
  const cssSource = read('public/mobile/mobile.source/mobile-01.css');
  assert.match(cssSource, /#orderTab #selectedCustomer\.mobile-selected-customer-compact/);
  assert.match(cssSource, /max-height:\s*56px/);
  assert.match(cssSource, /text-overflow:\s*ellipsis/);
  assert.match(cssSource, /white-space:\s*nowrap/);
});

test('mobile sales page cache busts compact customer summary assets and marks the customer box compact', () => {
  const html = read('public/mobile/sales.html');
  assert.match(html, /mobile\.css\?v=phase158-customer-compact-v1/);
  assert.match(html, /sales\.js\?v=phase158-customer-compact-v1/);
  assert.match(html, /id="selectedCustomer" class="selected-box muted mobile-selected-customer-compact"/);
});
