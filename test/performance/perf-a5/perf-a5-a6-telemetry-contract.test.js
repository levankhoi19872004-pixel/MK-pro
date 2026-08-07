'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildContract } = require('../../../scripts/performance/perf-a5/export-a6-telemetry-contract');

const ROOT = path.resolve(__dirname, '../../..');

function source(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('A6 telemetry contract covers every performance-program hot endpoint', () => {
  const contract = buildContract();
  const paths = new Set(contract.targets.map((row) => row.path));
  for (const expected of [
    '/api/new/delivery-today/adjustments/bulk-commit',
    '/api/new/delivery-today/orders',
    '/api/new/delivery-today/suggestions',
    '/api/dashboard/sales-staff',
    '/api/dashboard/delivery-summary'
  ]) assert.equal(paths.has(expected), true, expected);
});

test('API monitor exports p95, query count, rows, status and concurrency evidence', () => {
  const text = source('src/middlewares/apiMonitor.middleware.js');
  for (const token of ['p95Ms', 'avgDbQueries', 'maxDbQueries', 'avgRows', 'statusCounts', 'maxConcurrentObserved']) {
    assert.match(text, new RegExp(token));
  }
});

test('process telemetry exposes memory, event-loop, request and capacity snapshots', () => {
  const text = source('src/observability/performanceTelemetry.js');
  for (const token of ['memorySnapshot', 'eventLoopSnapshot', 'requestsSnapshot', 'capacitySnapshot', 'highWater']) {
    assert.match(text, new RegExp(token));
  }
});
