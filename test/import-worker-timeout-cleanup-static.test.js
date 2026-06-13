'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src/jobs/importPreviewQueue.js'), 'utf8');

test('parent process marks timed out import failed and removes temp files', () => {
  assert.match(source, /recordFailure/);
  assert.match(source, /markFailed\(job\.payload\.sessionId/);
  assert.match(source, /cleanupImportFiles\(job\.payload\.files/);
  assert.match(source, /timedOut = true/);
});
