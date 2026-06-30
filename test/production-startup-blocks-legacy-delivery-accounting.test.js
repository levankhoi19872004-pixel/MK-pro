'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateRuntimeConfig } = require('../src/config/app.config');

function productionEnv(extra = {}) {
  return {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://localhost:27017/test',
    JWT_SECRET: 'x'.repeat(40),
    JWT_REFRESH_SECRET: 'y'.repeat(40),
    APP_URL: 'https://mk-pro.example.com',
    CORS_ORIGIN: 'https://mk-pro.example.com',
    ...extra
  };
}

test('production startup blocks legacy delivery accounting unless unsafe rollback is explicitly acknowledged', () => {
  assert.throws(
    () => validateRuntimeConfig(productionEnv({ USE_LEGACY_DELIVERY_ACCOUNTING: 'true' }), { profile: 'server' }),
    (err) => /USE_LEGACY_DELIVERY_ACCOUNTING/.test(String(err && err.message))
  );

  assert.doesNotThrow(() => validateRuntimeConfig(productionEnv({ USE_LEGACY_DELIVERY_ACCOUNTING: 'true', ALLOW_UNSAFE_LEGACY_AR_ROLLBACK: 'true' }), { profile: 'server' }));
});
