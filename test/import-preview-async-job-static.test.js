'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('import preview supports async worker queue instead of only inline job', () => {
  const service = read('src/services/excelImportService.js');
  const queue = read('src/jobs/importPreviewQueue.js');
  const worker = read('src/jobs/importPreview.worker.js');
  const job = read('src/jobs/importExcelJob.js');
  const model = read('src/models/ImportSession.js');
  const tempStore = read('src/utils/importTempFileStore.js');

  assert.match(service, /IMPORT_PREVIEW_ASYNC/);
  assert.match(service, /enqueueImportPreviewJob/);
  assert.match(service, /saveImportFiles/);
  assert.match(service, /status:\s*'queued'/);
  assert.match(service, /getSessionStatus/);

  assert.match(queue, /child_process/);
  assert.match(queue, /fork/);
  assert.match(queue, /IMPORT_JOB_TIMEOUT_MS/);
  assert.match(queue, /IMPORT_JOB_MAX_OLD_SPACE_MB/);

  assert.match(worker, /runImportPreviewJob/);
  assert.match(worker, /connectDB/);
  assert.match(worker, /markFailed/);
  assert.match(worker, /cleanupImportFiles/);

  assert.match(job, /fs\.readFile|readFile/);
  assert.match(job, /updateProgress/);
  assert.match(model, /'queued'/);
  assert.match(model, /queuedAt/);
  assert.match(model, /progress/);
  assert.match(tempStore, /saveImportFiles/);
  assert.match(tempStore, /cleanupImportFiles/);
});

test('excel import routes expose session status endpoint', () => {
  const excelRoute = read('src/routes/excelImportRoutes.js');
  const importExportRoute = read('src/routes/importExportRoutes.js');
  const runtimeRoute = read('src/routes/importRuntimeRoutes.js');
  const excelController = read('src/controllers/excelImportController.js');
  const importExportController = read('src/controllers/importExportController.js');
  const runtimeController = read('src/controllers/importRuntimeController.js');

  assert.match(excelRoute, /\/sessions\/:sessionId/);
  assert.match(importExportRoute, /\/sessions\/:sessionId/);
  assert.match(runtimeRoute, /\/sessions\/:sessionId/);

  assert.match(excelController, /sessionStatus/);
  assert.match(importExportController, /sessionStatus/);
  assert.match(runtimeController, /sessionStatus/);
});
