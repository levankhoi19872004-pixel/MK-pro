'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/06-master-delivery.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');

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

test('changed master-delivery bundle has a new cache-busting version', () => {
  assert.match(indexHtml, /\/js\/app\/06-master-delivery\.js\?v=phase62-picking-zone-v1/);
});
