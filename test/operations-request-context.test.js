'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRequestId,
  requestContextMiddleware,
  getRequestContext,
  runWithRequestContext
} = require('../src/observability/requestContext');

function invoke(headers = {}) {
  const req = {
    method: 'GET',
    originalUrl: '/api/test?token=secret',
    headers,
    get(name) { return this.headers[String(name).toLowerCase()]; }
  };
  const responseHeaders = {};
  const res = { setHeader(name, value) { responseHeaders[name] = value; } };
  let context;
  requestContextMiddleware(req, res, () => { context = getRequestContext(); });
  return { req, responseHeaders, context };
}

test('request context accepts only bounded safe request IDs and always returns X-Request-Id', () => {
  assert.equal(normalizeRequestId('trace-12345678'), 'trace-12345678');
  assert.equal(normalizeRequestId('bad id'), '');
  const accepted = invoke({ 'x-request-id': 'client-trace-1234' });
  assert.equal(accepted.req.requestId, 'client-trace-1234');
  assert.equal(accepted.responseHeaders['X-Request-Id'], 'client-trace-1234');
  assert.equal(accepted.context.requestId, 'client-trace-1234');

  const generated = invoke({ 'x-request-id': 'x' });
  assert.match(generated.req.requestId, /^[a-f0-9-]{32,36}$/i);
  assert.equal(generated.responseHeaders['X-Request-Id'], generated.req.requestId);
});

test('request context propagates across asynchronous work and normalizes invalid IDs', async () => {
  await runWithRequestContext({ requestId: 'async-trace-1234' }, async () => {
    await Promise.resolve();
    assert.equal(getRequestContext().requestId, 'async-trace-1234');
  });
  await runWithRequestContext({ requestId: 'bad id' }, async () => {
    assert.match(getRequestContext().requestId, /^[a-f0-9-]{32,36}$/i);
  });
});
