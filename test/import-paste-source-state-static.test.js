'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readSource } = require('./helpers/sourceBundle.util');

function read(file) {
  return readSource(path.join(__dirname, '..', file));
}

test('paste preview is treated as a real import source and commit is not blocked by missing file input', () => {
  const importUi = read('public/js/app/admin/08d-import-excel.js');
  const pasteBindings = read('public/js/components/excel-interaction/ExcelFeatureBindings.js');
  const html = read('public/fragments/index/06-index-body.html');

  assert.match(importUi, /currentImportSource/);
  assert.match(importUi, /inferImportPreviewSource/);
  assert.match(importUi, /clipboard-paste/);
  assert.match(importUi, /importSource:currentImportSource==='paste'\?'paste':'file'/);
  assert.match(importUi, /if\(!importPreviewRows\.length\)\{[\s\S]*hasFile[\s\S]*Chưa có dữ liệu preview/);
  assert.doesNotMatch(importUi, /if\(!files\.length\)\{showMessage\(importDataMessage,'Bạn chưa chọn file Excel'/);

  assert.match(pasteBindings, /renderImportPreviewFromExcel\(\{\.\.\.json,source:'clipboard-paste'\}\)/);
  assert.match(pasteBindings, /Đã tạo bản xem trước từ dữ liệu dán/);
  assert.match(html, /importPreviewSourceNotice/);
  assert.match(html, /Vui lòng chọn file Excel hoặc dán trực tiếp dữ liệu từ Excel/);
});

test('backend paste preview creates an import session using the same commit pipeline', () => {
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const routes = read('src/routes/excelInteractionRoutes.js');
  const controller = read('src/controllers/excelInteractionController.js');

  assert.match(routes, /router\.post\('\/import\/preview'/);
  assert.match(controller, /previewPastedRows/);
  assert.match(preview, /async function previewPastedRows/);
  assert.match(preview, /createUploadedSession/);
  assert.match(preview, /savePreviewResult/);
  assert.match(preview, /source: 'clipboard-paste'/);
  assert.match(preview, /sessionId: session\.id/);
});
