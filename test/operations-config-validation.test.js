'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntimeConfig } = require('../src/config/app.config');

function base(overrides = {}) {
  return {
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/mkpro-test',
    JWT_SECRET: 'test-secret',
    ...overrides
  };
}

test('heartbeat stale window must be greater than heartbeat interval', () => {
  assert.throws(() => validateRuntimeConfig(base({
    OPERATIONS_HEARTBEAT_INTERVAL_MS: '20000',
    OPERATIONS_HEARTBEAT_STALE_MS: '15000'
  }), { profile: 'server' }), /OPERATIONS_HEARTBEAT_STALE_MS/);
  const config = validateRuntimeConfig(base({
    OPERATIONS_HEARTBEAT_INTERVAL_MS: '10000',
    OPERATIONS_HEARTBEAT_STALE_MS: '30000'
  }), { profile: 'server' });
  assert.equal(config.operations.heartbeatIntervalMs, 10000);
});
