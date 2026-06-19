'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readPublicCss = require('./helpers/readPublicCss');

test('master-return-order screen uses list-only layout with popup create workspace', () => {
  const root = path.resolve(__dirname, '..');
  const html = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/index.html'));
  const js = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/debt/07d-master-return-orders.js'));
  const dom = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/state/00b-debt-return-fund-state.js'));
  const css = readPublicCss(root);

  assert.match(html, /id="openMasterReturnOrderModalButton"/);
  assert.match(html, /id="masterReturnOrderModal" class="modal-backdrop"/);
  assert.match(html, /id="closeMasterReturnOrderModalButton"/);
  assert.match(html, /id="selectedMasterReturnOrderList"/);
  assert.doesNotMatch(html, /class="master-return-split-layout"/);

  assert.match(dom, /const masterReturnOrderModal=document\.getElementById\('masterReturnOrderModal'\)/);
  assert.match(dom, /const openMasterReturnOrderModalButton=document\.getElementById\('openMasterReturnOrderModalButton'\)/);
  assert.match(dom, /const selectedMasterReturnOrderList=document\.getElementById\('selectedMasterReturnOrderList'\)/);

  assert.match(js, /function openMasterReturnOrderModal\(options=\{\}\)/);
  assert.match(js, /function closeMasterReturnOrderModal\(\)/);
  assert.match(js, /function resetMasterReturnOrderModal\(\)/);
  assert.match(js, /function renderSelectedMasterReturnOrderList\(\)/);
  assert.match(js, /window\.toggleSelectAllUnmergedReturnOrders=toggleSelectAllUnmergedReturnOrders/);
  assert.match(js, /closeMasterReturnOrderModal\(\);\n    showMessage\(masterReturnOrderMessage/);

  assert.match(css, /#masterReturnOrdersTab \.master-return-list-only-grid\{/);
  assert.match(css, /#masterReturnOrderModal \.master-return-modal-workspace\{/);
  assert.match(css, /#masterReturnOrderModal \.master-return-popup-layout\{/);
});
