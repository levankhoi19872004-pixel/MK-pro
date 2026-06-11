'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('Excel import is two-phase and direct import is disabled', () => {
  const service = read('src/services/excelImportService.js');
  const sessionService = read('src/services/importSessionService.js');
  const model = read('src/models/ImportSession.js');
  const controller = read('src/controllers/excelImportController.js');
  const importExportController = read('src/controllers/importExportController.js');
  const job = read('src/jobs/importExcelJob.js');
  const ui = read('public/js/app/08-reports-users-promotions-import-excel.js');

  assert.match(model, /preview_ready/);
  assert.match(model, /importing/);
  assert.match(model, /done/);
  assert.match(model, /failed/);
  assert.match(model, /uniq_importSessions_id/);
  assert.match(model, /ttl_importSessions_createdAt/);

  assert.match(sessionService, /ImportSession/);
  assert.doesNotMatch(sessionService, /new Map\(\)/);

  assert.match(job, /runImportPreviewJob/);
  assert.match(job, /parseExcelBuffer/);

  assert.match(service, /buildPreviewFromRows/);
  assert.match(service, /createUploadedSession/);
  assert.match(service, /markImporting/);
  assert.match(service, /markDone/);
  assert.match(service, /Import trực tiếp đã bị khóa/);
  assert.match(service, /Bắt buộc xác nhận bằng importSessionId từ bước preview/);

  assert.match(controller, /status\(410\)/);
  assert.doesNotMatch(controller, /excelImportService\.importDirect/);
  assert.match(importExportController, /status\(410\)/);
  assert.doesNotMatch(importExportController, /excelImportService\.importDirect/);

  assert.match(ui, /importSessionId:importPreviewSessionId/);
  assert.doesNotMatch(ui, /rows:selectedRows/);
});

test('Excel upload routes only accept xlsx with bounded memory upload', () => {
  for (const file of ['src/routes/excelImportRoutes.js', 'src/routes/importRuntimeRoutes.js', 'src/routes/importExportRoutes.js']) {
    const src = read(file);

    assert.match(src, /multer\.memoryStorage\(\)/, file);
    assert.match(src, /IMPORT_MAX_FILE_SIZE/, file);
    assert.match(src, /files:\s*20/, file);
    assert.match(src, /\.xlsx\$/i, file);
  }
});
