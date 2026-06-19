'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createImportPreviewQueue } = require('../src/jobs/importPreviewQueue');

function waitFor(predicate, timeoutMs = 3000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('Timed out waiting for queue'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

function createHarness() {
  const calls = {
    started: [],
    failed: [],
    completed: [],
    cleaned: []
  };

  const queue = createImportPreviewQueue({
    workerPath: path.join(__dirname, 'fixtures', 'import-preview-terminal.worker.js'),
    timeoutMs: 2000,
    exitGraceMs: 500,
    maxConcurrency: 1,
    importSessionService: {
      async markWorkerStarted(id, details) {
        calls.started.push({ id, details });
        return { id };
      },
      async markFailed(id, message, details) {
        calls.failed.push({ id, message, details });
        return { id, status: 'failed' };
      },
      async finalizePreview(id, details) {
        calls.completed.push({ id, details });
        return { id, status: 'preview_ready' };
      }
    },
    async cleanupImportFiles(files) {
      calls.cleaned.push(files);
    }
  });

  return { queue, calls };
}

test('queue preserves structured worker error instead of overwriting it with exit code 1', async () => {
  const { queue, calls } = createHarness();

  queue.enqueueImportPreviewJob({
    sessionId: 'IMP-FAIL',
    mode: 'failure',
    files: [{ path: '/tmp/failure.xlsx' }]
  });

  await waitFor(() => queue.getImportPreviewQueueStats().activeJobs === 0);

  assert.equal(calls.failed.length, 1);
  assert.equal(calls.failed[0].message, 'Lỗi dữ liệu gốc từ worker');
  assert.equal(calls.failed[0].details.stage, 'validating');
  assert.equal(calls.failed[0].details.code, 'TEST_VALIDATION_ERROR');
  assert.equal(calls.completed.length, 0);
  assert.equal(calls.cleaned.length, 1);
});

test('queue finalizes preview only after structured completion message', async () => {
  const { queue, calls } = createHarness();

  queue.enqueueImportPreviewJob({
    sessionId: 'IMP-SUCCESS',
    mode: 'success',
    files: [{ path: '/tmp/success.xlsx' }]
  });

  await waitFor(() => queue.getImportPreviewQueueStats().activeJobs === 0);

  assert.equal(calls.failed.length, 0);
  assert.equal(calls.completed.length, 1);
  assert.equal(calls.completed[0].id, 'IMP-SUCCESS');
  assert.equal(calls.completed[0].details.summary.total, 2);
});
