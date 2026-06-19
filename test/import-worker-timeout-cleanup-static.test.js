'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'src/jobs/importPreviewQueue.js'));

test('parent process marks timed out import failed and removes temp files', () => {
  assert.match(source, /recordFailure/);
  assert.match(source, /markFailed\(job\.payload\.sessionId/);
  assert.match(source, /cleanup(?:Import)?Files\(job\.payload\.files/);
  assert.match(source, /timedOut = true/);
});
