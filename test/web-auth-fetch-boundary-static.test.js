'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('web UI patches fetch to use HttpOnly cookie auth and automatic refresh for API requests', () => {
  const src = read('public/js/auth-guard.js');

  assert.match(src, /WEB_AUTH_FETCH_BOUNDARY_START/);
  assert.match(src, /window\.fetch\s*=\s*window\.authFetch/);
  assert.match(src, /headers\.delete\(['"]Authorization['"]\)/);
  assert.match(src, /credentials:'same-origin'/);
  assert.doesNotMatch(src, /localStorage\.setItem\([^\n]*(mk_web_token|v43_mobile_token)/);
  assert.match(src, /res\.status\s*===\s*401/);
});

test('index uses cache-busted auth guard with fetch boundary version', () => {
  const src = read('public/index.html');

  assert.match(src, /auth-fetch-boundary-v1/);
  assert.doesNotMatch(src, /auth-guard-v1/);
});
