'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('global table alignment assets are loaded after module styles and application scripts', () => {
  const html = read('public/index.html');
  const moduleCss = html.indexOf('/css/90-excel-interaction.css');
  const alignmentCss = html.indexOf('/css/99-table-alignment.css');
  const bootstrapScript = html.indexOf('/js/bootstrap/03-tab-loader.js');
  const alignmentScript = html.indexOf('/js/ui/table-alignment.js');

  assert.ok(moduleCss >= 0 && alignmentCss > moduleCss, 'alignment stylesheet must load last');
  assert.ok(bootstrapScript >= 0 && alignmentScript > bootstrapScript, 'alignment controller must load after renderers');
});

test('alignment controller applies one semantic class to header and matching body column', () => {
  const source = read('public/js/ui/table-alignment.js');
  const css = read('public/css/99-table-alignment.css');

  assert.match(source, /function classifyColumn\(/);
  assert.match(source, /function alignBodyRow\(/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /ui-col--\$\{alignment\}/);
  assert.match(source, /spreadsheet-grid/);
  assert.match(css, /\.ui-data-table \.ui-col--right/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
});

test('report renderer emits the same alignment type on TH and TD', () => {
  const source = read('public/js/app/admin/08a-reports.js');

  assert.match(source, /function reportColumnAlignment\(column=\{\}\)/);
  assert.match(source, /<th class="report-col--\$\{reportColumnAlignment\(column\)\}">/);
  assert.match(source, /<td class="report-col--\$\{reportColumnAlignment\(column\)\}">/);
});

test('known structural column defects stay fixed', () => {
  const html = read('public/index.html');
  const css = read('public/css/99-table-alignment.css');

  assert.match(html, /id="userTable"><tr><td colspan="7">Đang tải/);
  assert.match(css, /grid-template-columns:minmax\(300px,1fr\) 82px 82px 118px 124px 124px/);
});
