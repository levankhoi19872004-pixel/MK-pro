'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const readPublicCss = require('./helpers/readPublicCss');

const root = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(path.join(root, file));

test('master-return-order screen uses production three-layer popup workspace', () => {
  const html = read('public/index.html');
  const js = read('public/js/app/debt/07d-master-return-orders.js');
  const dom = read('public/js/app/state/00b-debt-return-fund-state.js');
  const css = readPublicCss(root);

  assert.match(html, /id="masterReturnOrderModal" class="modal-backdrop"/);
  assert.match(html, /class="master-return-three-layer"/);
  assert.match(html, /1\. Thông tin đơn tổng trả/);
  assert.match(html, /2\. Phiếu trả chưa gộp/);
  assert.match(html, /3\. Phiếu trả được chọn/);
  assert.match(html, /id="moveToGroupedReturnOrdersButton"/);
  assert.match(html, /id="removeFromGroupedReturnOrdersButton"/);
  assert.match(html, /id="unmergedReturnDateFrom"/);
  assert.match(html, /id="unmergedReturnDateTo"/);
  assert.match(html, /id="masterReturnDeliveryStaffName"[^>]*readonly/);
  assert.doesNotMatch(html, /class="master-return-popup-layout"/);

  assert.match(dom, /const moveToGroupedReturnOrdersButton=document\.getElementById\('moveToGroupedReturnOrdersButton'\)/);
  assert.match(dom, /const removeFromGroupedReturnOrdersButton=document\.getElementById\('removeFromGroupedReturnOrdersButton'\)/);
  assert.match(dom, /const submitMasterReturnOrderButton=document\.getElementById\('submitMasterReturnOrderButton'\)/);

  assert.match(js, /let availableReturnOrders = \[\]/);
  assert.match(js, /let selectedReturnOrders = \[\]/);
  assert.match(js, /const checkedAvailableReturnIds = new Set\(\)/);
  assert.match(js, /const checkedSelectedReturnIds = new Set\(\)/);
  assert.match(js, /function moveSelectedReturnOrdersToGrouped\(\)/);
  assert.match(js, /function removeSelectedReturnOrdersFromGrouped\(\)/);
  assert.match(js, /let unmergedReturnRequestSeq = 0/);
  assert.match(js, /let masterReturnSubmitInFlight = false/);
  assert.match(js, /payload\.returnOrderIds=selectedReturnOrders\.map\(masterReturnOrderIdentity\)/);

  assert.match(css, /#masterReturnOrderModal \.master-return-three-layer\{/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/);
  assert.match(css, /#masterReturnOrderModal \.master-return-layer-info\{/);
  assert.match(css, /grid-column:1 \/ -1!important/);
  assert.match(css, /#masterReturnOrderModal \.master-return-popup-list\{/);
  assert.match(css, /@media\(max-width:1150px\)/);
});
