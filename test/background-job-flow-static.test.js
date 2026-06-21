'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('import preview keeps optional persistent queue and import commit defaults to web direct', () => {
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const controller = read('src/controllers/importExportController.js');
  const directCommit = read('src/services/import/ImportWebDirectCommitService.js');

  assert.match(preview, /process\.env\.IMPORT_PREVIEW_ASYNC === 'true'/);
  assert.match(preview, /submitImportPreview/);
  assert.doesNotMatch(preview, /enqueueImportPreviewJob\(/);

  assert.match(controller, /ImportWebDirectCommitService\.commitSession/);
  assert.doesNotMatch(controller, /submitImportCommit\(req\)/);
  assert.match(directCommit, /excelImportService\.commit/);
  assert.doesNotMatch(directCommit, /BackgroundJobService|JobSubmissionService|submitImportCommit/);
});

test('invoice export defaults to direct workbook download and keeps async job compatibility', () => {
  const frontend = read('public/js/app/admin/08f-vat-export.js');
  const controller = read('src/controllers/importExportController.js');
  assert.match(frontend, /waitForExportJob/);
  assert.match(frontend, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(frontend, /artifact/);
  assert.doesNotMatch(frontend, /respond-async/);
  assert.match(controller, /exportExcelDirect/);
  assert.match(controller, /EXPORT_ASYNC_ENABLED/);
  assert.match(controller, /submitExport/);
});

test('scheduled reconciliation only enqueues and uses deterministic schedule idempotency', () => {
  const scheduler = read('src/jobs/reconciliationJob.js');
  assert.match(scheduler, /submitReconciliation/);
  assert.match(scheduler, /reconciliation:scheduled/);
  assert.doesNotMatch(scheduler, /ReconciliationService\.runReconciliation/);
});

test('import and reconciliation side-effect jobs do not auto retry', () => {
  const submit = read('src/services/background-jobs/JobSubmissionService.js');
  assert.match(submit, /import-commit:\$\{sessionId\}/);
  assert.match(submit, /maxAttempts: 1/);
});
