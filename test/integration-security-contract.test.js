'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEndpoint, sanitizeHeaders } = require('../src/services/integrations/IntegrationService');

test('integration endpoint rejects hosts outside explicit allowlist', () => {
  const previous = process.env.INTEGRATION_ALLOWED_HOSTS;
  process.env.INTEGRATION_ALLOWED_HOSTS = 'api.example.com';
  assert.throws(() => validateEndpoint('https://127.0.0.1/internal'), /chưa được cho phép/);
  assert.equal(validateEndpoint('https://api.example.com/webhook'), 'https://api.example.com/webhook');
  if (previous === undefined) delete process.env.INTEGRATION_ALLOWED_HOSTS;
  else process.env.INTEGRATION_ALLOWED_HOSTS = previous;
});

test('integration headers drop unapproved forwarding headers', () => {
  const headers = sanitizeHeaders({ Authorization: 'Bearer x', Cookie: 'secret', 'X-Api-Key': 'k' });
  assert.equal(headers.Authorization, 'Bearer x');
  assert.equal(headers.Cookie, undefined);
  assert.equal(headers['X-Api-Key'], 'k');
});
