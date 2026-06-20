'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27099/mkpro-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { createApp } = require('../src/app');

function request(server, pathname, headers = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, path: pathname, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
    });
    req.once('error', reject);
    req.end();
  });
}

test('liveness is dependency-free, readiness fails closed, and request ID is returned', async (t) => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const live = await request(server, '/api/health/live', { 'x-request-id': 'health-trace-1234' });
  assert.equal(live.statusCode, 200);
  assert.equal(live.body.status, 'ok');
  assert.equal(live.headers['x-request-id'], 'health-trace-1234');
  assert.equal(Object.hasOwn(live.body, 'version'), false);

  const ready = await request(server, '/api/health/ready');
  assert.equal(ready.statusCode, 503);
  assert.equal(ready.body.ok, false);
  assert.equal(ready.body.checks.database, false);
});
