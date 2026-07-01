'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadRules() {
  const source = read('public/js/ui/clearable-search-inputs.js');
  const domReadyCallbacks = [];
  const document = {
    readyState: 'loading',
    addEventListener(type, callback) {
      if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
    }
  };
  const window = {
    addEventListener() {},
    setInterval() { return 1; }
  };
  const context = {
    window,
    document,
    Event: class Event {},
    MutationObserver: class MutationObserver {},
    Node: { ELEMENT_NODE: 1 },
    queueMicrotask,
    console
  };
  vm.runInNewContext(source, context, { filename: 'clearable-search-inputs.js' });
  return Array.from(window.ClearableSearchInputs.rules, (rule) => ({ ...rule }));
}

const EXPECTED_SELECTORS = [
  '#searchInput', '#customerSearchInput', '#salesOrderSearchInput', '#salesOrderStaffFilter',
  '#stockSearchInput', '#dmsInventorySearch', '#masterOrderSearch', '#customerStaffSearch',
  '#importProductSearch', '#salesCustomerSearch', '#salesStaffSearch', '#salesProductSearch',
  '#masterOrderForm [name="deliveryStaffCode"]', '#masterOrderForm [name="deliveryStaffName"]',
  '#unmergedOrderSearch', '#unmergedSalesStaffFilter', '#masterReturnDeliveryStaff',
  '#unmergedReturnOrderSearchInput', '#receiptSearchInput', '#cashbookSearchInput',
  '#debtCollectionSearchInput', '#returnOrderSearchInput', '#fundSearchInput',
  '#fundSummaryPersonSearch', '#deliveryCashSubmissionStaffCode', '#reportCatalogSearch', '#reportSearchInput',
  '#userSearchInput', '#promotionSearchAllInput', '#importShortageReportSearch', '#customerSearch', '#productSearch',
  '#debtCustomerSearch', '#mSearch', '#mDebtCustomerSearch'
];

test('registry covers exactly the 35 active search/autocomplete fields after retiring legacy web debt/delivery screens', () => {
  const rules = loadRules();
  assert.equal(rules.length, 35);
  assert.deepEqual(rules.map((rule) => rule.selector).sort(), EXPECTED_SELECTORS.sort());
  assert.equal(new Set(rules.map((rule) => rule.selector)).size, rules.length, 'selector must be unique');
});

test('registry never targets date/time, numeric, money, password, note or hidden controls', () => {
  const source = read('public/js/ui/clearable-search-inputs.js');
  const forbidden = [
    'dashboardMonth', 'salesOrderDateFrom', 'salesOrderDateTo', 'fundSummaryDateFrom', 'fundSummaryDateTo',
    'paidAmountInput', 'caseQtyInput', 'looseQtyInput', 'debtPaymentAmount', 'systemResetConfirm',
    'collectionCustomerSearch', 'mobileDebtCollectionNote', 'importShortageReportEditNote'
  ];
  forbidden.forEach((id) => assert.doesNotMatch(source, new RegExp(`selector:\\s*['\"]#${id}['\"]`)));
  assert.match(source, /INVALID_TYPES[\s\S]*datetime-local[\s\S]*number[\s\S]*password[\s\S]*hidden/);
});

test('all pages load one shared stylesheet and helper script', () => {
  const shell = read('public/index.shell.html');
  const main = read('public/fragments/index/07-index-body.html');
  const mobileSales = read('public/mobile/sales.html');
  const mobileDelivery = read('public/mobile/delivery.html');
  for (const html of [shell, mobileSales, mobileDelivery]) {
    assert.match(html, /97-clearable-search-inputs\.css\?v=global-search-clear-v1/);
  }
  for (const html of [main, mobileSales, mobileDelivery]) {
    assert.match(html, /clearable-search-inputs\.js\?v=global-search-clear-v1/);
  }
});

test('button accessibility and native search cancel replacement are explicit', () => {
  const js = read('public/js/ui/clearable-search-inputs.js');
  const css = read('public/css/97-clearable-search-inputs.css');
  assert.match(js, /button\.type = 'button'/);
  assert.match(js, /aria-label', 'Xóa nội dung tìm kiếm'/);
  assert.match(js, /title', 'Xóa tìm kiếm'/);
  assert.match(css, /width:28px/);
  assert.match(css, /height:28px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /search-cancel-button/);
  assert.match(css, /\[hidden\]\{display:none!important;\}/);
});

test('clear actions preserve existing search mode and never dispatch input plus change together', () => {
  const rules = loadRules();
  const actions = new Set(rules.map((rule) => rule.action));
  assert.deepEqual([...actions].sort(), ['click', 'input']);
  rules.filter((rule) => rule.action === 'click').forEach((rule) => assert.ok(rule.trigger));
  const source = read('public/js/ui/clearable-search-inputs.js');
  assert.doesNotMatch(source, /dispatchInput\(input[\s\S]{0,120}dispatchEvent\(new Event\('change'/);
});

test('autocomplete clear cancels pending work, removes hidden identity and closes suggestions', () => {
  const helper = read('public/js/ui/clearable-search-inputs.js');
  const engine = read('public/js/search/autocompleteEngine.js');
  assert.match(engine, /wrapped\.cancel/);
  assert.match(engine, /clearableSuppressAutocomplete/);
  assert.match(engine, /function cancel\(input\)/);
  assert.match(engine, /function clear\(input\)/);
  assert.match(helper, /config\.fill/);
  assert.match(helper, /target\.value = ''/);
  assert.match(helper, /__selectedSalesProduct = null/);
  assert.match(helper, /__selectedImportProduct = null/);
  assert.match(helper, /hideSuggestionBox/);
});

test('dynamic controls are handled by bounded observers, not a document.body observer', () => {
  const source = read('public/js/ui/clearable-search-inputs.js');
  assert.match(source, /\['\.app', '\.sales-app-page', '#mobileDeliveryRoot'\]/);
  assert.match(source, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(source, /observe\(document\.body/);
  assert.match(source, /stateByInput\.has\(input\)/, 'duplicate wrapper/listener guard required');
});

test('programmatic value assignment and form reset are synchronized without firing API calls', () => {
  const source = read('public/js/ui/clearable-search-inputs.js');
  assert.match(source, /setInterval\(syncAll, 300\)/);
  assert.match(source, /document\.addEventListener\('reset'/);
  assert.match(source, /document\.addEventListener\('visibilitychange', syncAll\)/);
  assert.match(source, /window\.addEventListener\('pageshow', syncAll\)/);
});

test('user search has only the debounced module listener, preventing duplicate API requests', () => {
  const bootstrap = read('public/js/bootstrap/02-delivery-system.js');
  const users = read('public/js/app/admin/08b-users.js');
  assert.doesNotMatch(bootstrap, /userSearchInput\)userSearchInput\.addEventListener\('input',loadUsers\)/);
  assert.match(users, /userSearchInput\)userSearchInput\.addEventListener\('input',debounce\(loadUsers,250\)\)/);
});

test('click strategies keep all other filters intact', () => {
  const source = read('public/js/ui/clearable-search-inputs.js');
  assert.doesNotMatch(source, /\.reset\(\)/);
  assert.doesNotMatch(source, /location\.reload/);
  assert.doesNotMatch(source, /window\.location/);
  assert.doesNotMatch(source, /querySelectorAll\(['\"]input/);
  assert.match(source, /input\.value = ''/);
});

test('realtime debounced fields clear through input so pending timers are replaced, not doubled by apply click', () => {
  const rules = loadRules();
  const bySelector = new Map(rules.map((rule) => [rule.selector, rule]));
  ['#salesOrderSearchInput', '#salesOrderStaffFilter', '#deliveryCashSubmissionStaffCode', '#mSearch', '#customerSearch']
    .forEach((selector) => assert.equal(bySelector.get(selector)?.action, 'input', selector));
});
