'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('persistent queue has idempotency, lease, retry, dead-letter, progress and cancellation contracts', () => {
  const model = read('src/models/BackgroundJob.js');
  const service = read('src/services/background-jobs/BackgroundJobService.js');
  assert.match(model, /idempotencyKey/);
  assert.match(model, /leaseExpiresAt/);
  assert.match(model, /dead_letter/);
  assert.match(model, /cancel_requested/);
  assert.match(service, /findOneAndUpdate/);
  assert.match(service, /retryDelayMs/);
  assert.match(service, /deadLetterExpiredLeases/);
  assert.match(service, /JOB_NOT_CANCELLABLE_RUNNING/);
});

test('worker is a separate process with concurrency, timeout and memory limits', () => {
  const worker = read('src/jobs/backgroundJobWorker.js');
  const script = read('scripts/background-job-worker.js');
  assert.match(worker, /BACKGROUND_JOB_CONCURRENCY/);
  assert.match(worker, /--max-old-space-size=/);
  assert.match(worker, /BACKGROUND_JOB_TIMEOUT/);
  assert.match(worker, /heartbeat/);
  assert.match(script, /runLoop/);
});

test('export artifacts are stored and streamed through GridFS', () => {
  const store = read('src/services/background-jobs/GridFsArtifactStore.js');
  const controller = read('src/controllers/backgroundJobController.js');
  assert.match(store, /GridFSBucket/);
  assert.match(store, /openUploadStream/);
  assert.match(store, /openDownloadStream/);
  assert.match(controller, /\.pipe\(res\)/);
});

test('financial writers remain outside background job infrastructure', () => {
  const handlers = read('src/services/background-jobs/BackgroundJobHandlers.js');
  assert.doesNotMatch(handlers, /FundLedger|ArLedger|StockTransaction\.create|Inventory\.update/);
  assert.match(handlers, /ReconciliationService\.runReconciliation/);
  assert.match(handlers, /excelImportService\.commit/);
  assert.match(handlers, /importExportService\.exportToExcel/);
});
