'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('web UI patches fetch to attach Authorization bearer token for /api requests', () => {
  const src = read('public/js/auth-guard.js');

  assert.match(src, /WEB_AUTH_FETCH_BOUNDARY_START/);
  assert.match(src, /window\.fetch\s*=\s*window\.authFetch/);
  assert.match(src, /headers\.set\(['"]Authorization['"],\s*['"]Bearer ['"]/);
  assert.match(src, /res\.status\s*===\s*401/);
});

test('index uses cache-busted auth guard with fetch boundary version', () => {
  const src = read('public/index.html');

  assert.match(src, /auth-fetch-boundary-v1/);
  assert.doesNotMatch(src, /auth-guard-v1/);
});
