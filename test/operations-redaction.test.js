'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { redactText, redactValue, safeError } = require('../src/observability/redaction');
const { classifyError } = require('../src/observability/errorClassification');

test('redaction removes bearer tokens, JWTs, Mongo URIs and secret fields', () => {
  const jwt = 'eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop';
  const text = redactText(`Bearer abc.def.ghi ${jwt} mongodb+srv://user:pass@cluster/db`);
  assert.doesNotMatch(text, /abc\.def\.ghi/);
  assert.doesNotMatch(text, /user:pass/);
  assert.doesNotMatch(text, /eyJabcdefghijk/);

  const value = redactValue({ password: 'secret', nested: { refreshToken: 'token', safe: 'ok' } });
  assert.equal(value.password, '[REDACTED]');
  assert.equal(value.nested.refreshToken, '[REDACTED]');
  assert.equal(value.nested.safe, 'ok');
});

test('safe errors and classification keep diagnostics without leaking credentials', () => {
  const error = new Error('Mongo failed mongodb://root:pass@localhost/prod');
  error.code = 'MONGO_TIMEOUT';
  const serialized = safeError(error);
  assert.equal(classifyError(error, 500), 'DATABASE_ERROR');
  assert.doesNotMatch(serialized.message, /root:pass/);
  assert.equal(classifyError({ status: 409, code: 'DUPLICATE' }), 'CONFLICT');
  assert.equal(classifyError({ status: 403 }), 'AUTHORIZATION_ERROR');
});
