'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('import preview and commit use persistent background jobs', () => {
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const controller = read('src/controllers/importExportController.js');
  assert.match(preview, /submitImportPreview/);
  assert.doesNotMatch(preview, /enqueueImportPreviewJob\(/);
  assert.match(controller, /submitImportCommit/);
  assert.match(controller, /Prefer|prefersAsync/);
});

test('invoice export UI polls job and downloads artifact without changing file endpoint semantics', () => {
  const frontend = read('public/js/app/admin/08f-vat-export.js');
  const controller = read('src/controllers/importExportController.js');
  assert.match(frontend, /waitForExportJob/);
  assert.match(frontend, /respond-async/);
  assert.match(frontend, /artifact/);
  assert.match(controller, /waitForTerminal/);
  assert.match(controller, /openDownloadStream/);
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
