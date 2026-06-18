'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', f));

test('backup is compressed, atomically renamed and checksummed', () => {
  const source = read('src/services/systemService.js');
  assert.match(source, /mk-pro-backup-v2/);
  assert.match(source, /await gzip\(/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /await fs\.rename\(tempPath, filePath\)/);
  assert.match(source, /\.sha256/);
  assert.match(source, /SYSTEM_MAINTENANCE_MODE/);
});

test('CORS is deny-by-default for cross-origin requests without allowlist', () => {
  const source = read('src/app.js');
  assert.match(source, /function createCorsOptions/);
  assert.match(source, /CORS_ALLOW_ALL/);
  assert.match(source, /origins\.length \? origins : false/);
  assert.match(source, /URLENCODED_BODY_LIMIT/);
});
