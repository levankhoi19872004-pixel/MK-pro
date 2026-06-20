'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('operational endpoints and release detail keep public/private boundaries', () => {
  const security = read('src/middlewares/apiSecurity.middleware.js');
  const routes = read('src/routes/systemRoutes.js');
  assert.match(security, /api\\\/health\\\/live/);
  assert.match(security, /api\\\/health\\\/ready/);
  assert.match(routes, /system\/operations.*requireRole\(\['admin', 'manager'\]\)/);
  assert.match(routes, /system\/release.*requireRole\(\['admin', 'manager'\]\)/);
});

test('worker shutdown stops claiming, waits, then uses lease-safe failure rather than blind completion', () => {
  const worker = read('src/jobs/backgroundJobWorker.js');
  assert.match(worker, /stopped = true/);
  assert.match(worker, /while \(active\.size && Date\.now\(\) < deadline\)/);
  assert.match(worker, /BACKGROUND_JOB_EXECUTOR_EXIT/);
  assert.doesNotMatch(worker, /complete\([^\n]+WORKER_SHUTDOWN/);
});

test('release manifest and restore drill are executable controls, not documentation only', () => {
  const manifest = read('scripts/generate-release-manifest.js');
  const restore = read('scripts/restore-drill.js');
  assert.match(manifest, /sourceSha256/);
  assert.match(manifest, /bundleSha256/);
  assert.match(restore, /ISOLATED_NON_PRODUCTION_DB/);
  assert.match(restore, /persistDataSnapshot/);
  assert.match(restore, /compareBackupIntegrity/);
  assert.match(restore, /runReconciliation/);
});
