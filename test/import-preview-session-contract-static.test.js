'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('import preview frontend creates backend session before polling', () => {
  const source = read('public/js/app/admin/08d-import-excel.js');
  const postIndex = source.indexOf("fetch('/api/import/preview'");
  const pollCallIndex = source.indexOf('return await waitImportPreviewSession(sessionId', postIndex);

  assert.ok(postIndex > 0, 'preview flow must POST the Excel file to backend');
  assert.ok(pollCallIndex > postIndex, 'polling must start only after backend returns a real sessionId');
  assert.match(source, /Backend preview không trả importSessionId/);
  assert.doesNotMatch(source, /makeId\(['"]IMP/);
});

test('import session polling fails closed for unknown sessions and exposes worker queue state', () => {
  const service = read('src/services/import/importCommit.impl.js');
  const controller = read('src/controllers/importExportController.js');
  const ui = read('public/js/app/admin/08d-import-excel.js');

  assert.match(service, /IMPORT_PREVIEW_POLL_SESSION_NOT_FOUND/);
  assert.match(service, /IMPORT_SESSION_NOT_FOUND/);
  assert.match(service, /BackgroundJob/);
  assert.match(service, /idempotencyKey:\s*`import-preview:\$\{safeSessionId\}`/);
  assert.match(service, /backgroundJob/);
  assert.match(controller, /Cache-Control',\s*'no-store'/);
  assert.match(ui, /Worker Service/);
  assert.match(ui, /npm run worker:background/);
});
