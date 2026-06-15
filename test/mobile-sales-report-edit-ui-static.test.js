'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const js = fs.readFileSync(path.join(__dirname, '..', 'public/mobile/js/sales.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/mobile/sales.html'), 'utf8');

test('sales report edit buttons use delegated click handling and explicit button type', () => {
  assert.match(js, /todayOrders\?\.addEventListener\('click'/);
  assert.match(js, /event\.target\.closest\('\[data-edit-order\]'/);
  assert.match(js, /<button type="button" class="ghost-btn small-btn" data-edit-order=/);
  assert.doesNotMatch(js, /querySelectorAll\('\[data-edit-order\]'\)\.forEach/);
});

test('mobile sales script cache version is bumped for edit fix', () => {
  assert.match(html, /sales\.js\?v=phase51-mobile-edit-posted-v1/);
});
