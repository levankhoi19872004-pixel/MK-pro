'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/excelImportService.js'), 'utf8');

test('full import queue marks session failed and removes temp files', () => {
  assert.match(source, /IMPORT_PREVIEW_QUEUE_FULL|enqueueImportPreviewJob/);
  assert.match(source, /markFailed\(session\.id/);
  assert.match(source, /cleanupImportFiles\(storedFiles\)/);
  assert.match(source, /status: Number\(err\.statusCode/);
});
