'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sourceBundle = require('./helpers/sourceBundle.util');
const js = `${sourceBundle.readSource('public/mobile/js/sales.js')}\n${sourceBundle.readSource('public/mobile/js/sales-ux.js')}`;
const html = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'public/mobile/sales.html'));

test('sales report edit buttons use delegated click handling and explicit button type', () => {
  assert.match(js, /todayOrders\?\.addEventListener\('click'/);
  assert.match(js, /event\.target\.closest\('\[data-edit-order\]'/);
  assert.match(js, /<button type="button" class="ghost-btn small-btn" data-edit-order=/);
  assert.doesNotMatch(js, /querySelectorAll\('\[data-edit-order\]'\)\.forEach/);
});

test('mobile sales script cache version is bumped for edit fix', () => {
  assert.match(html, /sales\.js\?v=(phase86-production-hardening-v1|phase152-order-modal-v1)/);
});
