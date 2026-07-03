'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const readPublicCss = require('./helpers/readPublicCss');

const root = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(path.join(root, file));

test('legacy master-return-order popup is no longer mounted in operational web UI', () => {
  const html = read('public/index.html');
  const js = read('public/js/app/debt/07d-master-return-orders.js');
  const dom = read('public/js/app/state/00b-debt-return-fund-state.js');
  const css = readPublicCss(root);

  assert.doesNotMatch(html, /id="masterReturnOrderModal"/);
  assert.doesNotMatch(html, /class="master-return-three-layer"/);
  assert.doesNotMatch(html, /id="moveToGroupedReturnOrdersButton"/);
  assert.doesNotMatch(html, /id="removeFromGroupedReturnOrdersButton"/);
  assert.doesNotMatch(html, /id="unmergedReturnDateFrom"/);
  assert.doesNotMatch(html, /id="unmergedReturnDateTo"/);
  assert.doesNotMatch(html, /id="masterReturnDeliveryStaffName"/);

  // Legacy JS/back-end compatibility may remain loaded, but must be inert because DOM nodes are not mounted.
  assert.match(dom, /const masterReturnOrderModal=document\.getElementById\('masterReturnOrderModal'\)/);
  assert.match(js, /if\(!masterReturnOrderModal\)return/);

  // Old CSS can stay as inert historical styling; removing UI is the operational contract.
  assert.match(css, /#masterReturnOrderModal \.master-return-three-layer\{/);
});
