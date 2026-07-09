'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const retired = require('../config/retired-flows.json');
function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }

test('retired flow registry records replacement flow and reason for every retired/compatibility flow', () => {
  assert.ok(retired.length >= 8, 'retired-flows registry should not be empty');
  retired.forEach((flow) => {
    assert.ok(flow.id, 'retired flow needs id');
    assert.ok(flow.status, `${flow.id} needs status`);
    assert.ok(flow.reason, `${flow.id} needs reason`);
    assert.ok(flow.replacementFlow, `${flow.id} needs replacementFlow`);
  });
});

test('hard-retired namespaces are mounted only through retiredRoute guard', () => {
  const routes = read('src/routes/index.js');
  assert.match(routes, /app\.use\('\/api\/delivery-today',\s*retiredRoute\('legacy-web-delivery-today-alias'/);
  assert.match(routes, /app\.use\('\/api\/mobile-legacy',\s*retiredRoute\('mobile-legacy'/);
});

test('main return order UI does not re-expose master return order menu/tab', () => {
  const returnHtml = read('public/fragments/index/07-index-body.html');
  const printTabs = read('public/js/app/01-utils-print-tabs.js');
  assert.doesNotMatch(returnHtml, /data-tab="masterReturnOrdersTab"/);
  assert.doesNotMatch(returnHtml, /Đơn tổng trả hàng/);
  assert.match(printTabs, /deprecatedTabRedirects=\{masterReturnOrdersTab:'returnOrdersTab'\}/);
});
