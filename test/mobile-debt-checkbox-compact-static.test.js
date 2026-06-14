'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('sales and delivery debt collection checkboxes are compact and scoped', () => {
  const css = read('public/mobile/mobile.css');
  const salesJs = read('public/mobile/js/sales.js');
  const deliveryJs = read('public/mobile/js/delivery-mobile-view.js');

  assert.match(salesJs, /class="mobile-debt-order-check"/);
  assert.match(deliveryJs, /class="m-debt-order-check"/);
  assert.match(css, /MOBILE_DEBT_COMPACT_CHECKBOX_V3_START/);
  assert.match(css, /\.debt-order-check-row\s*>\s*input\[type="checkbox"\]/);
  assert.match(css, /\.m-debt-order-row\s*>\s*input\[type="checkbox"\]/);
  assert.match(css, /width:\s*18px/);
  assert.match(css, /height:\s*18px/);
  assert.match(css, /min-height:\s*18px/);
  assert.match(css, /grid-template-columns:\s*20px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
});

test('compact checkbox patch does not introduce a global checkbox override', () => {
  const css = read('public/mobile/mobile.css');
  const patch = css.split('MOBILE_DEBT_COMPACT_CHECKBOX_V3_START')[1]
    .split('MOBILE_DEBT_COMPACT_CHECKBOX_V3_END')[0];

  assert.doesNotMatch(patch, /^\s*input\[type="checkbox"\]\s*\{/m);
  assert.doesNotMatch(patch, /^\s*input\s*\{/m);
});
