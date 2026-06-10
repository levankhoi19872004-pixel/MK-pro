'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const appPath = path.join(__dirname, '..', 'src', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');

test('Express trust proxy is configured before API rate limiter', () => {
  assert.match(source, /function\s+configureTrustProxy\s*\(app\)/, 'configureTrustProxy helper must exist');
  assert.match(source, /app\.set\(['"]trust proxy['"],\s*1\)/, 'production/Render fallback should trust one proxy hop');

  const createAppIndex = source.indexOf('function createApp()');
  const configureCallIndex = source.indexOf('configureTrustProxy(app);', createAppIndex);
  const limiterIndex = source.indexOf("app.use('/api', createApiLimiter())", createAppIndex);

  assert.ok(configureCallIndex > createAppIndex, 'configureTrustProxy must be called inside createApp');
  assert.ok(limiterIndex > configureCallIndex, 'trust proxy must be configured before express-rate-limit middleware');
});
