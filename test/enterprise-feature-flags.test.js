'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readBoolean, snapshot } = require('../src/config/featureFlags');

test('enterprise feature flags are disabled safely unless explicitly enabled', () => {
  const previous = process.env.ENABLE_PURCHASING;
  delete process.env.ENABLE_PURCHASING;
  assert.equal(readBoolean('ENABLE_PURCHASING', false), false);
  process.env.ENABLE_PURCHASING = 'true';
  assert.equal(readBoolean('ENABLE_PURCHASING', false), true);
  if (previous === undefined) delete process.env.ENABLE_PURCHASING;
  else process.env.ENABLE_PURCHASING = previous;
  assert.equal(typeof snapshot().enterpriseCore, 'boolean');
});
