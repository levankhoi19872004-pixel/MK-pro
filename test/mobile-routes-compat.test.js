'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { createApp } = require('../src/app');

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const payload = body === undefined ? '' : JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          server.close(() => {
            let json = null;
            try { json = raw ? JSON.parse(raw) : null; } catch (_) {}
            resolve({ statusCode: res.statusCode, body: json, raw });
          });
        });
      });
      req.on('error', (err) => server.close(() => reject(err)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

test('mobile modular mount keeps required modular endpoint contracts reachable', async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const app = createApp();
  process.env.NODE_ENV = previousEnv;

  const cases = [
    ['POST', '/api/mobile/auth/login', {}, [400]],
    ['GET', '/api/mobile/catalog/customers', undefined, [401]],
    ['GET', '/api/mobile/catalog/products', undefined, [401]],
    ['POST', '/api/mobile/orders', {}, [401]],
    ['GET', '/api/mobile/delivery/orders', undefined, [401]],
    ['POST', '/api/mobile/delivery/return', {}, [401]],
    ['POST', '/api/mobile/delivery/save-money', {}, [401]],
    ['GET', '/api/mobile/delivery/report', undefined, [401]]
  ];

  for (const [method, path, body, expectedStatuses] of cases) {
    const res = await request(app, method, path, body);
    assert.ok(expectedStatuses.includes(res.statusCode), `${method} ${path} returned ${res.statusCode}: ${res.raw}`);
    assert.notEqual(res.statusCode, 404, `${method} ${path} must not fall through to API 404`);
    assert.equal(res.body && (res.body.ok === false || res.body.success === false || res.body.ok === true || res.body.success === true), true, `${method} ${path} must keep JSON response contract`);
  }
});
