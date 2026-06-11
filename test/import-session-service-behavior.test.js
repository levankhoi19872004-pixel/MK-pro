'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('import session service uses Mongo model instead of RAM Map', () => {
  const src = read('src/services/importSessionService.js');

  assert.match(src, /require\(['"]\.\.\/models\/ImportSession['"]\)/);
  assert.doesNotMatch(src, /const sessions = new Map\(\)/);
  assert.match(src, /createUploadedSession/);
  assert.match(src, /savePreviewResult/);
  assert.match(src, /markImporting/);
  assert.match(src, /markDone/);
  assert.match(src, /selectRows/);
});
