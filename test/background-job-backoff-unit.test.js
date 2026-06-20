'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/background-jobs/BackgroundJobService');

test('retry backoff grows exponentially and is capped', () => {
  const a = service.retryDelayMs(1);
  const b = service.retryDelayMs(2);
  const c = service.retryDelayMs(3);
  assert.ok(a > 0);
  assert.ok(b >= a);
  assert.ok(c >= b);
  assert.ok(service.retryDelayMs(100) <= Number(process.env.BACKGROUND_JOB_RETRY_MAX_MS || 5 * 60 * 1000));
});

test('running write jobs cannot be force-cancelled', () => {
  assert.equal(service.CANCELLABLE_WHILE_RUNNING.has('export_excel'), true);
  assert.equal(service.CANCELLABLE_WHILE_RUNNING.has('import_preview'), true);
  assert.equal(service.CANCELLABLE_WHILE_RUNNING.has('import_commit'), false);
  assert.equal(service.CANCELLABLE_WHILE_RUNNING.has('reconciliation'), false);
});
