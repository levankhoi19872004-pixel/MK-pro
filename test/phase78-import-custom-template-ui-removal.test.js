'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => require('./helpers/sourceBundle.util').readSource(path.join(root, relativePath));

test('màn hình Import không còn khu vực tự tạo mẫu import', () => {
  const html = read('public/index.html');

  assert.doesNotMatch(html, /Tự tạo mẫu import/);
  assert.doesNotMatch(html, /custom-import-designer/);
  assert.doesNotMatch(html, /customImportTemplate/);
  assert.match(html, /id="downloadImportTemplateButton"/);
  assert.match(html, /id="commitImportButton"/);
  assert.match(html, /id="importPreviewTable"/);
});

test('frontend không còn binding và handler của mẫu import tự tạo', () => {
  const state = read('public/js/app/state/00c-admin-system-state.js');
  const importScript = read('public/js/app/admin/08d-import-excel.js');
  const combined = `${state}\n${importScript}`;

  assert.doesNotMatch(combined, /customImportTemplate/);
  assert.doesNotMatch(combined, /customImportMapping/);
  assert.doesNotMatch(combined, /loadImportFieldOptions/);
  assert.doesNotMatch(combined, /templateId/);
  assert.match(importScript, /formData\.append\('type',importDataType\.value\)/);
  assert.match(importScript, /fetch\('\/api\/import\/preview'/);
});

test('CSS riêng của khu vực đã gỡ được loại bỏ', () => {
  const css = read('public/css/00-base.css');

  assert.doesNotMatch(css, /custom-import-designer/);
  assert.doesNotMatch(css, /custom-template-panel/);
  assert.match(css, /\.compact-toolbar/);
});
