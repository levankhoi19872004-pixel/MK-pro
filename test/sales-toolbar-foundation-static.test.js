'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('sales pilot uses the shared page header and search-filter contract', () => {
  const html = read('public/fragments/index/02-index-body.html');
  const toolbar = html.slice(html.indexOf('<div class="ui-list-toolbar">'), html.indexOf('<div class="sales-order-list-head"'));
  assert.match(toolbar, /class="ui-page-header"/);
  assert.match(toolbar, /class="ui-page-actions"/);
  assert.match(toolbar, /class="ui-search-filter-bar"/);
  assert.match(toolbar, /class="ui-toolbar-actions"/);
  assert.ok(toolbar.indexOf('exportSelectedSalesOrdersButton') < toolbar.indexOf('openCreateSalesOrderButton'));
  assert.ok(toolbar.indexOf('applySalesOrderFiltersButton') < toolbar.indexOf('clearSalesOrderFiltersButton'));
  assert.ok(toolbar.indexOf('clearSalesOrderFiltersButton') < toolbar.indexOf('reloadSalesOrdersButton'));
});

test('sales filter params and clear behavior retain the current API contract', () => {
  const querySource = read('public/js/app/05-sales-orders.source/part-03.jsfrag');
  const bindingSource = read('public/js/ui/sales-toolbar-pilot.js');
  for (const parameter of ['dateFrom', 'dateTo', 'dateType', 'source', 'q', 'salesStaffCode']) {
    assert.match(querySource, new RegExp(`params\\.set\\('${parameter}'`));
  }
  assert.match(bindingSource, /salesOrderSearchInput\.value=''/);
  assert.match(bindingSource, /clearSalesOrderStaffDataset\(\)/);
  assert.match(bindingSource, /const defaultDate=typeof today==='function'\?today\(\)/);
  assert.match(bindingSource, /salesOrderDateFrom\.value=defaultDate/);
  assert.match(bindingSource, /salesOrderDateTo\.value=defaultDate/);
  assert.match(bindingSource, /salesOrderSourceFilter\.value=''/);
  assert.match(bindingSource, /stopImmediatePropagation\(\)/);
  assert.match(bindingSource, /loadSalesOrders\(\{page:1,append:false\}\)/);
});

test('shared toolbar action guard disables duplicate clicks and restores the button', async () => {
  const context = { window: {} };
  vm.runInNewContext(read('public/js/ui/toolbar-actions.js'), context);
  let resolveTask;
  let calls = 0;
  const task = () => {
    calls += 1;
    return new Promise((resolve) => { resolveTask = resolve; });
  };
  const attributes = new Map();
  const button = {
    dataset: {},
    disabled: false,
    textContent: 'Tải lại',
    style: { minWidth: '' },
    getBoundingClientRect: () => ({ width: 82 }),
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key)
  };

  const first = context.window.ToolbarActions.run(button, task, { loadingText: 'Đang tải...' });
  const second = context.window.ToolbarActions.run(button, task, { loadingText: 'Đang tải...' });
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Đang tải...');
  assert.equal(attributes.get('aria-busy'), 'true');
  resolveTask('done');
  assert.equal(await first, 'done');
  assert.equal(await second, undefined);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Tải lại');
  assert.equal(attributes.has('aria-busy'), false);
});

test('sales pilot applies, clears, and reloads with exactly one request per action', async () => {
  const nodes = new Map();
  function input(value = '') {
    return { value, dataset: {}, hidden: false, innerHTML: '' };
  }
  function button(text) {
    const listeners = [];
    return {
      textContent: text,
      disabled: false,
      dataset: {},
      style: { minWidth: '' },
      listeners,
      getBoundingClientRect: () => ({ width: 90 }),
      setAttribute() {},
      removeAttribute() {},
      addEventListener(type, handler, options = {}) { listeners.push({ type, handler, capture: options.capture === true }); }
    };
  }
  nodes.set('applySalesOrderFiltersButton', button('Tìm'));
  nodes.set('clearSalesOrderFiltersButton', button('Xóa lọc'));
  nodes.set('reloadSalesOrdersButton', button('Tải lại'));
  nodes.set('salesOrderStaffFilterSuggestions', input());
  let requests = 0;
  const context = {
    document: { getElementById: (id) => nodes.get(id) || null },
    salesOrderSearchTimer: null,
    salesOrderSearchInput: input('SO-001'),
    salesOrderStaffFilter: input('BH01 - An'),
    salesOrderDateFrom: input('2026-06-01'),
    salesOrderDateTo: input('2026-06-19'),
    salesOrderSourceFilter: input('dms'),
    clearTimeout,
    today: () => '2026-06-19',
    clearSalesOrderStaffDataset() { context.salesOrderStaffFilter.dataset = {}; },
    async loadSalesOrders() { requests += 1; }
  };
  context.window = context;
  vm.runInNewContext(read('public/js/ui/toolbar-actions.js'), context);
  vm.runInNewContext(read('public/js/ui/sales-toolbar-pilot.js'), context);

  async function click(id, addLegacyReload = false) {
    const target = nodes.get(id);
    let stopped = false;
    const event = { stopImmediatePropagation() { stopped = true; } };
    if (addLegacyReload) target.listeners.push({ type: 'click', capture: false, handler: () => context.loadSalesOrders() });
    for (const listener of [...target.listeners].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      if (stopped) break;
      await listener.handler(event);
    }
  }

  await click('applySalesOrderFiltersButton');
  assert.equal(requests, 1);
  await click('clearSalesOrderFiltersButton');
  assert.equal(requests, 2);
  assert.equal(context.salesOrderSearchInput.value, '');
  assert.equal(context.salesOrderStaffFilter.value, '');
  assert.equal(context.salesOrderDateFrom.value, '2026-06-19');
  assert.equal(context.salesOrderDateTo.value, '2026-06-19');
  assert.equal(context.salesOrderSourceFilter.value, '');
  context.salesOrderSearchInput.value = 'GIU-NGUYEN';
  context.salesOrderSourceFilter.value = 'sales_app';
  await click('reloadSalesOrdersButton', true);
  assert.equal(requests, 3);
  assert.equal(context.salesOrderSearchInput.value, 'GIU-NGUYEN');
  assert.equal(context.salesOrderSourceFilter.value, 'sales_app');
});

test('shared toolbar CSS exposes approved tokens and responsive breakpoints', () => {
  const css = read('public/css/96-ui-toolbar-system.css');
  for (const token of ['--toolbar-control-height', '--toolbar-gap', '--toolbar-group-gap', '--search-width-sm', '--search-width-md', '--search-width-lg', '--filter-width-sm', '--filter-width-md', '--filter-width-lg']) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /max-width:1199px/);
  assert.match(css, /min-width:768px/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /max-width:767px/);
});
