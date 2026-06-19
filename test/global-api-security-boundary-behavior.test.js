'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
let createApp;
try {
  require.resolve('dotenv');
  ({ createApp } = require('../src/app'));
} catch (err) {
  createApp = null;
}

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);

    server.listen(0, () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : '';

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => {
          server.close();
          let parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch (err) { parsed = text; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

test('dangerous API routes require authentication by default', { skip: createApp ? false : 'dependencies are not installed; run npm install before integration tests' }, async () => {
  const app = createApp();

  const targets = [
    ['POST', '/api/master-orders/delivery-today/confirm-accounting'],
    ['POST', '/api/system/reset'],
    ['POST', '/api/funds/expenses'],
    ['DELETE', '/api/users/test-user-id'],
    ['POST', '/api/sales-orders']
  ];

  for (const [method, path] of targets) {
    const res = await request(app, method, path, {});
    assert.equal(res.status, 401, `${method} ${path} must require auth`);
  }
});

test('public status route is still accessible', { skip: createApp ? false : 'dependencies are not installed; run npm install before integration tests' }, async () => {
  const app = createApp();
  const res = await request(app, 'GET', '/api/system/status');
  assert.notEqual(res.status, 401);
});
