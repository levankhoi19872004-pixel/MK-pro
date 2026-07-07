'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const jobServicePath = path.join(root, 'src/services/readModelSyncJob.service.js');
const modelPath = path.join(root, 'src/models/ReadModelSyncJob.js');
const indexPath = path.join(root, 'src/services/mongoIndexService.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('read model sync job outbox has idempotent enqueue and deferred drain', () => {
  const source = read(jobServicePath);
  assert.match(source, /TYPE_AR_DEBT_READMODEL_SYNC\s*=\s*'AR_DEBT_READMODEL_SYNC'/);
  assert.match(source, /enqueueArDebtSyncJobs/);
  assert.match(source, /updateOne\s*\(\s*{\s*idempotencyKey:\s*idem\s*}/);
  assert.match(source, /upsert:\s*true/);
  assert.match(source, /setImmediate\s*\(/);
  assert.match(source, /drainPendingJobs/);
  assert.match(source, /markFailed/);
});

test('readModelSyncJobs model and indexes exist', () => {
  const model = read(modelPath);
  const indexes = read(indexPath);
  assert.match(model, /readModelSyncJobs/);
  assert.match(indexes, /readModelSyncJobs/);
  assert.match(indexes, /uniq_read_model_sync_jobs_idempotency_key/);
  assert.match(indexes, /idx_read_model_sync_jobs_status_next_created/);
  assert.match(indexes, /idx_read_model_sync_jobs_customer_status/);
});



test('read model sync job upsert keeps $set and $setOnInsert paths disjoint', () => {
  const source = read(jobServicePath);
  assert.match(source, /const\s+insertOnlyDoc\s*=\s*{/);
  assert.match(source, /\$setOnInsert:\s*insertOnlyDoc/);
  assert.doesNotMatch(source, /\$setOnInsert:\s*doc/);

  const match = source.match(/const\s+insertOnlyDoc\s*=\s*{([\s\S]*?)\n\s*};/);
  assert.ok(match, 'insertOnlyDoc block not found');
  const insertOnlyBlock = match[1];
  for (const field of ['source', 'status', 'updatedAt', 'nextRunAt', 'sourceIds', 'customerCode', 'actor', 'reason', 'metadata']) {
    assert.doesNotMatch(insertOnlyBlock, new RegExp(`\\b${field}\\s*:`), `${field} must not appear in $setOnInsert because it is updated via $set`);
  }
});
