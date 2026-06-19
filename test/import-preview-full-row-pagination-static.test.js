'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('session preview vẫn lưu toàn bộ dòng trong collection và có API phân trang', () => {
  const sessionService = read('src/services/importSessionService.js');
  const routes = read('src/routes/importExportRoutes.js');
  const controller = read('src/controllers/importExportController.js');
  assert.match(sessionService, /ImportSessionRow\.insertMany/);
  assert.match(sessionService, /async function listSessionRows/);
  assert.match(sessionService, /\$skip:\s*safeOffset/);
  assert.match(sessionService, /\$limit:\s*safeLimit/);
  assert.match(sessionService, /\$ifNull:\s*\['\$previewRow', '\$normalizedRow'\]/);
  assert.match(routes, /\/sessions\/:sessionId\/rows/);
  assert.match(controller, /excelImportService\.getSessionRows/);
});

test('frontend tải đủ toàn bộ dòng theo từng trang thay vì dùng sample 100 dòng', () => {
  const ui = read('public/js/app/admin/08d-import-excel.js');
  assert.match(ui, /IMPORT_SESSION_ROWS_PAGE_SIZE=500/);
  assert.match(ui, /async function loadAllImportSessionRows/);
  assert.match(ui, /\/api\/import\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/rows/);
  assert.match(ui, /if\(rows\.length!==expected\)/);
  assert.match(ui, /const rows=await loadAllImportSessionRows/);
});

test('worker không được làm mất chế độ update khi chạy async', () => {
  const worker = read('src/jobs/importPreview.worker.js');
  const runner = read('src/jobs/importPreviewRunner.js');
  assert.match(worker, /importMode: payload\.importMode \|\| 'create'/);
  assert.match(runner, /prefer that value/);
  assert.match(runner, /buildPreviewFromRows\(\{ type, rows, userName, importMode: effectiveImportMode \}\)/);
});
