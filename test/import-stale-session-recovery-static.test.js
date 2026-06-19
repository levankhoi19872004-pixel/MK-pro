'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', f));

test('import sessions persist temp file metadata and recover stale queued workers', () => {
  const session = read('src/services/importSessionService.js');
  const excel = read('src/services/excelImportService.js');
  const app = read('src/app.js');
  const temp = read('src/utils/importTempFileStore.js');
  assert.match(excel, /markQueued\(session\.id, \{ files: storedFiles \}\)/);
  assert.match(session, /recoverStaleImportSessions/);
  assert.match(session, /status: \{ \$in: \['queued', 'parsing'\] \}/);
  assert.match(session, /cleanupImportSession/);
  assert.match(app, /AUTO_RECOVER_STALE_IMPORTS/);
  assert.match(temp, /mode: 0o600/);
});
