'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const read = (file) => require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));

test('stale import recovery preserves sessions backed by an active persistent job', () => {
  const session = read('src/services/importSessionService.js');
  const excel = read('src/services/import/preview/importPreview.impl.js');
  const app = read('src/app.js');
  const queue = read('src/services/background-jobs/BackgroundJobService.js');

  assert.match(excel, /submitImportPreview/);
  assert.match(session, /recoverStaleImportSessions/);
  assert.match(session, /status: \{ \$in: \['queued', 'parsing'\] \}/);
  assert.match(session, /type: 'import_preview'/);
  assert.match(session, /status: \{ \$in: \['pending', 'running', 'cancel_requested'\] \}/);
  assert.match(session, /protectedSessions\.has\(sessionId\)/);
  assert.match(session, /preserved/);
  assert.match(session, /cleanupImportSession/);
  assert.match(queue, /leaseExpiresAt/);
  assert.match(app, /AUTO_RECOVER_STALE_IMPORTS/);
});
