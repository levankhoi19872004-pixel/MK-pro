'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
let app;
try {
  require.resolve('dotenv');
  ({ app } = require('../src/app'));
} catch (err) {
  app = null;
}

function request(server, path) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('Swagger UI and OpenAPI JSON are mounted before legacy guard', { skip: app ? false : 'dependencies are not installed; run npm install before integration tests' }, async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const html = await request(server, '/api/docs');
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /SwaggerUIBundle/);

  const json = await request(server, '/api/docs/openapi.json');
  assert.equal(json.statusCode, 200);
  const doc = JSON.parse(json.body);
  assert.equal(doc.info.title, 'KHO Minh Khai Pro V45 API');
});
