'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('enterprise operations console is authenticated and exposes only guarded APIs', () => {
  const html = source('public/enterprise.html');
  const js = source('public/js/enterprise-app.js');
  const systemFragment = source('public/fragments/index/06-index-body.html');

  assert.match(html, /\/js\/auth-guard\.js/);
  assert.match(html, /type="module" src="\/js\/enterprise-app\.js/);
  assert.match(systemFragment, /href="\/enterprise\.html"/);

  for (const endpoint of [
    '/api/enterprise/status',
    '/api/enterprise/readiness',
    '/api/purchase/orders',
    '/api/warehouse-advanced/reservations',
    '/api/analytics/projections',
    '/api/field-operations/plans',
    '/api/delivery-planning/plans',
    '/api/integrations/jobs'
  ]) assert.match(js, new RegExp(endpoint.replaceAll('/', '\\/')));

  assert.doesNotMatch(js, /\.innerHTML\s*=/);
});

test('offline sync updates failed rows within one IndexedDB transaction', () => {
  const js = source('public/mobile/js/offline-sync.js');
  const markResults = js.slice(js.indexOf('async function markResults'), js.indexOf('export async function syncPending'));
  assert.match(markResults, /db\.transaction\(STORE_NAME, 'readwrite'\)/);
  assert.doesNotMatch(markResults, /Promise\.all\(/);
  assert.match(markResults, /request\.onsuccess/);
});
