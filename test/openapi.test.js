'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const openApiPath = path.join(__dirname, '..', 'docs', 'openapi.json');

test('OpenAPI document is valid JSON and has required sections', () => {
  const doc = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));

  assert.equal(doc.openapi, '3.0.3');
  assert.equal(doc.info.title, 'KHO Minh Khai Pro V45 API');
  assert.ok(doc.paths['/api/products']);
  assert.ok(doc.paths['/api/sales-orders']);
  assert.ok(doc.paths['/api/master-orders']);
  assert.ok(doc.paths['/api/mobile/login']);
  assert.ok(doc.components.securitySchemes.bearerAuth);
});

test('every documented operation has at least one success response', () => {
  const doc = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);

  for (const [route, pathItem] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      assert.ok(operation.responses, `${method.toUpperCase()} ${route} missing responses`);
      assert.ok(operation.responses['200'] || operation.responses['201'], `${method.toUpperCase()} ${route} missing 200/201 response`);
    }
  }
});
