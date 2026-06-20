'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('import preview uses the persistent background queue instead of only inline execution', () => {
  const service = read('src/services/excelImportService.js');
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const submission = read('src/services/background-jobs/JobSubmissionService.js');
  const worker = read('src/jobs/backgroundJobWorker.js');
  const executor = read('src/jobs/backgroundJobExecutor.worker.js');
  const handler = read('src/services/background-jobs/BackgroundJobHandlers.js');
  const model = read('src/models/BackgroundJob.js');
  const artifactStore = read('src/services/background-jobs/GridFsArtifactStore.js');

  assert.match(service, /preview:\s*preview\.preview/);
  assert.match(preview, /IMPORT_PREVIEW_ASYNC/);
  assert.match(preview, /submitImportPreview/);
  assert.match(preview, /markQueued\(session\.id/);
  assert.doesNotMatch(preview, /enqueueImportPreviewJob\(/);
  assert.match(service, /getSessionStatus/);

  assert.match(submission, /putImportInput/);
  assert.match(submission, /import-preview:\$\{sessionId\}/);
  assert.match(worker, /child_process|fork/);
  assert.match(worker, /BACKGROUND_JOB_CONCURRENCY/);
  assert.match(worker, /--max-old-space-size=/);
  assert.match(executor, /connectDB/);
  assert.match(handler, /runImportPreviewJob/);
  assert.match(handler, /readBuffer/);
  assert.match(handler, /remove\(item\.fileId\)/);

  assert.match(model, /'pending'/);
  assert.match(model, /leaseExpiresAt/);
  assert.match(model, /progress/);
  assert.match(artifactStore, /GridFSBucket/);
  assert.match(artifactStore, /cleanupExpired/);
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
