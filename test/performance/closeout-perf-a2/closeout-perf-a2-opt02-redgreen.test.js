'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('CL-A2-REQ-003/007: sync bulk flag exists and defaults OFF', () => {
  const flags = read('src/config/featureFlags.js');
  assert.match(flags, /closeoutSyncBulkV1:\s*\(\)\s*=>\s*readBoolean\('PERF_CLOSEOUT_SYNC_BULK_V1',\s*false\)/);
});

test('CL-A2-REQ-003: read-model sync service supports one bulkWrite for N groups', () => {
  const svc = read('src/services/readModelSyncJob.service.js');
  assert.match(svc, /async function enqueueArDebtSyncJobsBulk/);
  assert.match(svc, /ReadModelSyncJob\.bulkWrite\(/);
  assert.match(svc, /enqueueArDebtSyncJobsBulk,/);
});

test('CL-A2-REQ-003/004: post-commit handler switches to bulk only under feature flag and keeps scheduler', () => {
  const handler = read('src/services/accounting/closeout/CloseoutPostCommitHandler.js');
  assert.match(handler, /closeoutSyncBulkV1/);
  assert.match(handler, /enqueueArDebtSyncJobsBulk/);
  assert.match(handler, /scheduleDrain/);
  assert.match(handler, /warnings/);
});
