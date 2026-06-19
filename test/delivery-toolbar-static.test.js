'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('delivery toolbar uses shared controls in the approved order', () => {
  const source = read('public/js/ui/delivery-toolbar.js');
  assert.match(source, /header\.classList\.add\('ui-list-toolbar'\)/);
  assert.match(source, /filters\.classList\.add\('ui-search-filter-bar'\)/);
  assert.match(source, /\[searchField,deliveryField,salesField,dateField,statusField,actions\]/);
  assert.ok(source.indexOf("apply.textContent='Tìm kiếm'") < source.indexOf("clear.textContent='Xóa lọc'"));
  assert.ok(source.indexOf("clear.textContent='Xóa lọc'") < source.indexOf("reload.textContent='Tải lại'"));
});

test('delivery toolbar removes legacy auto-load listeners before binding actions', () => {
  const source = read('public/js/ui/delivery-toolbar.js');
  for (const id of ['deliveryCoreSearch', 'deliveryCoreDate', 'deliveryCoreStatus', 'deliveryCoreReload']) {
    assert.match(source, new RegExp(`cloneControl\\('${id}'\\)`));
  }
  assert.match(source, /ToolbarActions\?\.run/);
  assert.match(source, /search\.addEventListener\('keydown'/);
});

test('delivery clear resets every filter while reload leaves values untouched', () => {
  const source = read('public/js/ui/delivery-toolbar.js');
  assert.match(source, /search\.value=''/);
  assert.match(source, /deliveryStaff\.value=''/);
  assert.match(source, /salesStaff\.value=''/);
  assert.match(source, /date\.value=todayVietnam\(\)/);
  assert.match(source, /status\.value='all'/);
  assert.match(source, /reload\.addEventListener\('click',\(\)=>run\(reload,'Đang tải\.\.\.'\)\)/);
});

test('delivery default date and status use the canonical filter names in source and runtime', () => {
  const source = read('public/js/delivery/delivery-web-view.source/part-03.jsfrag');
  const runtime = read('public/js/delivery/delivery-web-view.js');
  assert.match(source, /f\.date/);
  assert.match(source, /f\.statusFilter/);
  assert.match(runtime, /f\.date\|\|f\.q/);
  assert.match(runtime, /f\.statusFilter&&"all"!==f\.statusFilter/);
});

test('delivery source hash remains synchronized after the scoped filter fix', () => {
  const manifest = JSON.parse(read('config/source-bundles.json'));
  const entry = manifest.bundles.find((item) => item.target === 'public/js/delivery/delivery-web-view.js');
  const source = entry.parts.map(read).join('');
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(hash, entry.sourceSha256);
});

test('delivery danger action is separated and responsive CSS stays scoped', () => {
  const adapter = read('public/js/ui/delivery-toolbar.js');
  const css = read('public/css/96-ui-toolbar-system.css');
  assert.match(adapter, /clear\.classList\.add\('danger'\)/);
  assert.match(adapter, /actions\.insertBefore\(clear,submit\)/);
  assert.match(css, /#deliveryTodayTab \.delivery-v46-filters\.ui-search-filter-bar/);
  assert.match(css, /#deliveryTodayTab \.delivery-v46-actions-danger-separated/);
  assert.match(css, /max-width:1199px/);
  assert.match(css, /max-width:767px/);
});
