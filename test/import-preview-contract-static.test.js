'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('import preview frontend posts before polling backend-created session', () => {
  const ui = read('public/js/app/admin/08d-import-excel.js');
  const postIndex = ui.indexOf("fetch('/api/import/preview'");
  const sessionFromPostIndex = ui.indexOf("const sessionId=String(json.sessionId||json.importSessionId||'').trim()", postIndex);
  const pollIndex = ui.indexOf('waitImportPreviewSession(sessionId)', sessionFromPostIndex);

  assert.ok(postIndex >= 0, 'preview UI must call POST /api/import/preview');
  assert.ok(sessionFromPostIndex > postIndex, 'sessionId must be taken from POST response');
  assert.ok(pollIndex > sessionFromPostIndex, 'polling must start only after POST returns sessionId');

  const waitFunction = ui.slice(ui.indexOf('async function waitImportPreviewSession'), ui.indexOf('async function downloadImportBlob'));
  const previewFunction = ui.slice(ui.indexOf('async function previewImportExcelSilent'), ui.indexOf('async function handleImportExcelAction'));
  assert.doesNotMatch(`${waitFunction}
${previewFunction}`, /makeId\(['"]IMP|Date\.now\(\).*IMP|Math\.random\(\).*IMP/);
});

test('import preview frontend stops on missing/not-found session instead of infinite queued polling', () => {
  const ui = read('public/js/app/admin/08d-import-excel.js');
  assert.match(ui, /Thiếu mã phiên import do backend tạo/);
  assert.match(ui, /Backend preview không trả importSessionId/);
  assert.match(ui, /status==='not_found'/);
  assert.match(ui, /!res\.ok\|\|!json\.ok/);
  assert.match(ui, /cache:'no-store'/);
});

test('import preview backend logs POST, session creation, enqueue and not-found poll', () => {
  const controller = read('src/controllers/importExportController.js');
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const commit = read('src/services/import/importCommit.impl.js');

  assert.match(controller, /\[IMPORT_PREVIEW_POST_STARTED\]/);
  assert.match(preview, /\[IMPORT_PREVIEW_SESSION_CREATED\]/);
  assert.match(preview, /\[IMPORT_PREVIEW_JOB_ENQUEUED\]/);
  assert.match(commit, /\[IMPORT_PREVIEW_POLL_SESSION_NOT_FOUND\]/);
  assert.match(commit, /IMPORT_SESSION_NOT_FOUND/);
});
