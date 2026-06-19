'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/06-master-delivery.js'));
const state = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/state/00a-catalog-orders-state.js'));
const html = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/index.html'));

test('master-order popup exposes a dedicated reload button for unmerged children', () => {
  assert.match(html, /id="reloadUnmergedOrdersButton"[^>]*>Tải lại<\/button>/);
  assert.match(state, /const reloadUnmergedOrdersButton=document\.getElementById\('reloadUnmergedOrdersButton'\)/);
  assert.match(source, /reloadUnmergedOrdersButton\.addEventListener\('click',\s*reloadUnmergedChildOrdersNow\)/);
});

test('all unmerged-order filters reload the server-side list', () => {
  assert.match(source, /unmergedSourceFilter\.addEventListener\('change',\s*reloadUnmergedChildOrdersNow\)/);
  assert.match(source, /unmergedDateFrom\.addEventListener\('change',\s*reloadUnmergedChildOrdersNow\)/);
  assert.match(source, /unmergedDateTo\.addEventListener\('change',\s*reloadUnmergedChildOrdersNow\)/);
  assert.match(source, /unmergedOrderSearch\.addEventListener\('input',\s*scheduleUnmergedChildOrdersReload\)/);
  assert.match(source, /unmergedSalesStaffFilter\.addEventListener\('input',\s*scheduleUnmergedChildOrdersReload\)/);
});

test('unmerged-order reload guards against stale async responses', () => {
  assert.match(source, /let unmergedOrderRequestSeq = 0/);
  assert.match(source, /const requestSeq = \+\+unmergedOrderRequestSeq/);
  assert.match(source, /if \(requestSeq !== unmergedOrderRequestSeq\) return/);
  assert.match(source, /UNMERGED_ORDER_RELOAD_DEBOUNCE_MS = 350/);
});

test('unmerged-order API request includes current date, source and sales staff filters', () => {
  assert.match(source, /function buildUnmergedChildOrderParams/);
  for (const key of ['q', 'source', 'dateFrom', 'dateTo', 'salesStaff']) {
    assert.match(source, new RegExp(`params\\.set\\('${key}'`));
  }
});
