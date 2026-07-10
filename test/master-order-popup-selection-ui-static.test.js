'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'public/js/app/06-master-delivery.js'));
const readPublicIndex = require('./helpers/readPublicIndex');
const indexHtml = readPublicIndex(path.join(__dirname, '..'));
const desktopFacades = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'public/js/app/core/desktop-feature-facades.js'));

test('master-order popup delegates checkbox changes into the correct selection sets', () => {
  assert.match(source, /unmergedOrderList\.addEventListener\('change',\s*handleUnmergedChildSelectionChange\)/);
  assert.match(source, /selectedMasterChildOrderList\.addEventListener\('change',\s*handleGroupedChildSelectionChange\)/);
  assert.match(source, /syncMasterChildCheckboxSelection\(selectedUnmergedChildOrderIds,\s*check\)/);
  assert.match(source, /syncMasterChildCheckboxSelection\(selectedGroupedChildOrderCheckIds,\s*check\)/);
});

test('remove grouped child action reads the state populated by grouped checkbox changes', () => {
  assert.match(source, /const ids = \[\.\.\.selectedGroupedChildOrderCheckIds\]\.filter\(Boolean\)/);
  assert.match(source, /ids\.forEach\(\(id\) => selectedGroupedChildOrderIds\.delete\(id\)\)/);
  assert.match(source, /removeFromGroupedOrdersButton\.addEventListener\('click',\s*removeSelectedGroupedChildOrders\)/);
});

test('master-delivery bundle is registered behind the desktop feature loader', () => {
  assert.doesNotMatch(indexHtml, /<script src="\/js\/app\/06-master-delivery\.js/);
  assert.match(indexHtml, /\/js\/app\/core\/feature-module-loader\.js/);
  assert.match(desktopFacades, /masterOrders/);
  assert.match(desktopFacades, /\/js\/app\/06-master-delivery\.js\?v=phase69-unmerged-refresh-v1/);
});
