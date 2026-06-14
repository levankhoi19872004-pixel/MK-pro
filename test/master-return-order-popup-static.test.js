'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('master-return-order screen uses list-only layout with popup create workspace', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public/js/app/07-debt-cashbook.js'), 'utf8');
  const dom = fs.readFileSync(path.join(root, 'public/js/app/00-dom-state.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

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
