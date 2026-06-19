'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('return order toolbar follows the shared search, clear and reload contract', () => {
  const html = read('public/fragments/index/04-index-body.html');
  const start = html.indexOf('<section id="returnOrdersTab"');
  const end = html.indexOf('<div class="return-order-list-card', start);
  const toolbar = html.slice(start, end);
  assert.match(toolbar, /class="ui-list-toolbar"/);
  assert.match(toolbar, /class="ui-page-header"/);
  assert.match(toolbar, /ui-search-filter-bar/);
  assert.ok(toolbar.indexOf('returnOrderSearchInput') < toolbar.indexOf('returnOrderDateFrom'));
  assert.ok(toolbar.indexOf('applyReturnOrderFiltersButton') < toolbar.indexOf('clearReturnOrderFiltersButton'));
  assert.ok(toolbar.indexOf('clearReturnOrderFiltersButton') < toolbar.indexOf('reloadReturnOrdersButton'));
});

test('return order clear resets today while reload preserves current values', () => {
  const source = read('public/js/app/debt/07b-return-orders.js');
  assert.match(source, /returnOrderDateFrom\.value=today\(\)/);
  assert.match(source, /returnOrderDateTo\.value=today\(\)/);
  assert.match(source, /runReturnOrderLoad\(clearReturnOrderFiltersButton,'Đang xóa\.\.\.'\)/);
  assert.match(source, /runReturnOrderLoad\(reloadReturnOrdersButton,'Đang tải\.\.\.'\)/);
  for (const parameter of ['q', 'dateFrom', 'dateTo', 'page', 'limit', 'excludeInactive']) {
    assert.match(source, new RegExp(`params\\.set\\('${parameter}'`));
  }
});

test('master return separates page, filter and batch actions', () => {
  const html = read('public/fragments/index/03-index-body.html');
  const start = html.indexOf('<section id="masterReturnOrdersTab"');
  const end = html.indexOf('<div id="masterReturnOrderTable"', start);
  const toolbar = html.slice(start, end);
  assert.match(toolbar, /class="ui-list-toolbar"/);
  assert.match(toolbar, /class="ui-page-actions"/);
  assert.match(toolbar, /class="ui-search-filter-bar master-return-filter-bar"/);
  assert.match(toolbar, /class="master-return-batch-actions"/);
  assert.ok(toolbar.indexOf('applyMasterReturnFiltersButton') < toolbar.indexOf('clearMasterReturnFiltersButton'));
  assert.ok(toolbar.indexOf('clearMasterReturnFiltersButton') < toolbar.indexOf('reloadMasterReturnOrdersButton'));
  assert.ok(toolbar.indexOf('reloadMasterReturnOrdersButton') < toolbar.indexOf('receiveSelectedMasterReturnOrdersButton'));
});

test('master return dates no longer auto-load and toolbar actions are guarded', () => {
  const source = read('public/js/app/debt/07d-master-return-orders.js');
  assert.doesNotMatch(source, /masterReturnOrderDateFrom\.addEventListener\('change'/);
  assert.doesNotMatch(source, /masterReturnOrderDateTo\.addEventListener\('change'/);
  assert.match(source, /ToolbarActions\?\.run/);
  assert.match(source, /masterReturnOrderDateFrom\.value=today\(\)/);
  assert.match(source, /masterReturnOrderDateTo\.value=today\(\)/);
});

test('master return popup keeps its primary action last', () => {
  const html = read('public/fragments/index/03-index-body.html');
  const start = html.indexOf('<div class="button-row master-return-popup-actions">');
  const end = html.indexOf('</div>', start);
  const actions = html.slice(start, end);
  assert.ok(actions.indexOf('clearMasterReturnSelectionButton') < actions.indexOf('reloadUnmergedReturnOrdersButton'));
  assert.ok(actions.indexOf('reloadUnmergedReturnOrdersButton') < actions.indexOf('Tạo đơn tổng trả'));
});

test('return responsive rules remain scoped to the two return screens', () => {
  const css = read('public/css/96-ui-toolbar-system.css');
  assert.match(css, /#returnOrdersTab \.return-order-filter-grid/);
  assert.match(css, /#masterReturnOrdersTab \.master-return-filter-bar/);
  assert.match(css, /#masterReturnOrdersTab \.master-return-batch-actions/);
  assert.match(css, /#masterReturnOrdersTab \.ui-action-sensitive/);
});
