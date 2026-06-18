'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'src/services/excelImportService.js'));

test('full import queue marks session failed and removes temp files', () => {
  assert.match(source, /IMPORT_PREVIEW_QUEUE_FULL|enqueueImportPreviewJob/);
  assert.match(source, /markFailed\(session\.id/);
  assert.match(source, /cleanupImportFiles\(storedFiles\)/);
  assert.match(source, /status: Number\(err\.statusCode/);
});
