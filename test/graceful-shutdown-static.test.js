'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('server installs graceful shutdown for HTTP, jobs and MongoDB', () => {
  const app = read('src/app.js');
  const db = read('src/config/db.js');
  assert.match(app, /function installGracefulShutdown/);
  assert.match(app, /stopReconciliationJob\(\)/);
  assert.match(app, /server\.close/);
  assert.match(app, /mongoose\.disconnect\(\)/);
  assert.match(app, /process\.once\('SIGTERM'/);
  assert.doesNotMatch(db, /process\.exit\(1\)/);
  assert.match(db, /throw error/);
});
