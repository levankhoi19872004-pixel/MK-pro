'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('master orders uses the shared toolbar contract and approved action order', () => {
  const html = read('public/fragments/index/02-index-body.html') + read('public/fragments/index/03-index-body.html');
  const start = html.indexOf('<section id="masterOrdersTab"');
  const end = html.indexOf('<div class="master-order-list-head">', start);
  const toolbar = html.slice(start, end);
  assert.match(toolbar, /class="ui-list-toolbar"/);
  assert.match(toolbar, /class="ui-page-header"/);
  assert.match(toolbar, /class="ui-search-filter-bar"/);
  assert.ok(toolbar.indexOf('exportSelectedMasterOrdersButton') < toolbar.indexOf('openMasterOrderModalButton'));
  assert.ok(toolbar.indexOf('applyMasterOrderFiltersButton') < toolbar.indexOf('clearMasterOrderFiltersButton'));
  assert.ok(toolbar.indexOf('clearMasterOrderFiltersButton') < toolbar.indexOf('reloadMasterOrdersButton'));
});

test('master orders keeps the existing filter parameter contract', () => {
  const source = read('public/js/app/06-master-delivery.js');
  for (const parameter of ['q', 'dateFrom', 'dateTo', 'excludeInactive', 'limit']) {
    assert.match(source, new RegExp(`params\\.set\\('${parameter}'`));
  }
});

test('master orders apply, clear and reload each issue one request', async () => {
  const nodes = new Map();
  function node(value = '') {
    const listeners = [];
    return {
      value,
      textContent: value,
      disabled: false,
      dataset: {},
      style: { minWidth: '' },
      listeners,
      getBoundingClientRect: () => ({ width: 90 }),
      setAttribute() {},
      removeAttribute() {},
      addEventListener(type, handler, options = {}) {
        listeners.push({ type, handler, capture: options.capture === true });
      }
    };
  }
  for (const id of ['applyMasterOrderFiltersButton', 'clearMasterOrderFiltersButton', 'reloadMasterOrdersButton']) nodes.set(id, node(id));
  nodes.set('masterOrderSearch', node('MO-001'));
  nodes.set('masterOrderDateFrom', node('2026-06-01'));
  nodes.set('masterOrderDateTo', node('2026-06-19'));

  let listRequests = 0;
  let moduleRequests = 0;
  const context = {
    document: { getElementById: (id) => nodes.get(id) || null },
    today: () => '2026-06-19',
    async loadMasterOrders() { listRequests += 1; },
    async loadMasterOrderModule() { moduleRequests += 1; }
  };
  context.window = context;
  vm.runInNewContext(read('public/js/ui/toolbar-actions.js'), context);
  vm.runInNewContext(read('public/js/ui/master-orders-toolbar.js'), context);

  async function click(id, legacyHandler) {
    const target = nodes.get(id);
    if (legacyHandler) target.listeners.push({ type: 'click', capture: false, handler: legacyHandler });
    let stopped = false;
    const event = { stopImmediatePropagation() { stopped = true; } };
    for (const listener of [...target.listeners].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      if (stopped) break;
      await listener.handler(event);
    }
  }

  await click('applyMasterOrderFiltersButton');
  assert.equal(listRequests, 1);
  await click('clearMasterOrderFiltersButton');
  assert.equal(listRequests, 2);
  assert.equal(nodes.get('masterOrderSearch').value, '');
  assert.equal(nodes.get('masterOrderDateFrom').value, '2026-06-19');
  assert.equal(nodes.get('masterOrderDateTo').value, '2026-06-19');

  nodes.get('masterOrderSearch').value = 'KEEP';
  await click('reloadMasterOrdersButton', context.loadMasterOrderModule);
  assert.equal(moduleRequests, 1);
  assert.equal(nodes.get('masterOrderSearch').value, 'KEEP');
});

test('master orders responsive rules are scoped to its tab', () => {
  const css = read('public/css/96-ui-toolbar-system.css');
  assert.match(css, /#masterOrdersTab \.ui-search-filter-bar/);
  assert.match(css, /#masterOrdersTab \.ui-field-search/);
  assert.match(css, /max-width:1199px/);
  assert.match(css, /max-width:767px/);
});
