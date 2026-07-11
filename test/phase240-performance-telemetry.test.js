'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('performance telemetry collector is bounded, resettable and tracks request lifecycle once', () => {
  process.env.PERF_TELEMETRY_ENABLED = 'false';
  process.env.PERF_MAX_SAMPLES = '3';
  const telemetry = require('../src/observability/performanceTelemetry');
  telemetry.reset();

  for (let i = 0; i < 16; i += 1) telemetry.sampleNow();
  assert.ok(telemetry._private.samples.length <= 10);

  const finish = telemetry.recordRequestStart();
  assert.equal(telemetry._private.counters.activeRequests, 1);
  finish({ statusCode: 200, responseBytes: 123 });
  finish({ statusCode: 500, responseBytes: 999 });
  assert.equal(telemetry._private.counters.activeRequests, 0);
  assert.equal(telemetry._private.counters.completedRequests, 1);
  assert.equal(telemetry._private.counters.status2xx, 1);
  assert.equal(telemetry._private.counters.responseBytesTotal, 123);
  assert.equal(telemetry._private.requestBuckets.length, 60);

  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.version, 'performance-summary-v1');
  assert.ok(['healthy', 'watch', 'critical', 'unknown'].includes(snapshot.capacity.status));
  telemetry.stop();
});

test('performance baseline routes are protected and reset is admin-only', () => {
  const routes = read('src/routes/systemRoutes.js');
  assert.match(routes, /system\/performance-baseline', requireRole\(\['admin', 'manager'\]\)/);
  assert.match(routes, /system\/performance-baseline\/reset', requireRole\(\['admin'\]\)/);

  const security = read('src/middlewares/apiSecurity.middleware.js');
  assert.doesNotMatch(security, /performance-baseline/);
});

test('api monitor query trace uses safe shape labels instead of raw filters', () => {
  const source = read('src/middlewares/apiMonitor.middleware.js');
  const describeStart = source.indexOf('function describeMongooseExec');
  const describeEnd = source.indexOf('function pushQueryTrace');
  const describeBody = source.slice(describeStart, describeEnd);
  assert.match(source, /function describeQueryShape/);
  assert.match(source, /fields=\[/);
  assert.match(source, /stages=\[/);
  assert.doesNotMatch(describeBody, /compactJson\(query\)/);
  assert.doesNotMatch(describeBody, /compactJson\(pipeline\)/);
  assert.match(source, /maskTraceValue/);
});

test('benchmark safety rejects write-like endpoints before making requests', () => {
  const run = spawnSync(process.execPath, ['scripts/performance/api-benchmark.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PERF_ENDPOINTS: '/api/system/reset',
      PERF_IN_PROCESS: '1'
    },
    encoding: 'utf8'
  });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}${run.stdout}`, /write-like endpoint/);
});

test('phase240 scripts and ui wiring are present without source-bundle changes', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['benchmark:api'], 'node scripts/performance/api-benchmark.js');
  assert.equal(pkg.scripts['benchmark:phase240'], 'node scripts/benchmark-phase240-capacity.js');
  assert.match(read('public/fragments/index/07-index-body.html'), /reloadPerformanceBaselineButton/);
  assert.match(read('public/js/app/09-system.js'), /loadPerformanceBaseline/);
  assert.match(read('public/js/bootstrap/02-delivery-system.js'), /resetPerformanceBaselineStats/);
});
