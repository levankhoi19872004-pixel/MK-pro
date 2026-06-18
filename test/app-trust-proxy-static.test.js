'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('Express app configures trust proxy before rate limiters', () => {
  const src = read('src/app.js');

  assert.match(src, /function\s+configureTrustProxy\s*\(/);
  assert.match(src, /TRUST_PROXY/);
  assert.match(src, /app\.set\(['"]trust proxy['"]/);

  const createAppIndex = src.indexOf('function createApp()');
  const trustProxyIndex = src.indexOf('configureTrustProxy(app);');
  const apiLimiterIndex = src.indexOf("app.use('/api', createApiLimiter())");

  assert.ok(createAppIndex >= 0, 'createApp() must exist');
  assert.ok(trustProxyIndex > createAppIndex, 'configureTrustProxy(app) must be called inside createApp()');
  assert.ok(apiLimiterIndex > trustProxyIndex, 'trust proxy must be configured before /api rate limiter');
});

test('configureTrustProxy is exported for regression checks', () => {
  const src = read('src/app.js');

  assert.match(src, /configureTrustProxy/);
  assert.match(src, /module\.exports\s*=\s*\{[\s\S]*configureTrustProxy/);
});
