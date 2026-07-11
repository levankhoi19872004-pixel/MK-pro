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

test('Phase241 sampling uses one canonical scheduler and snapshot is read-only', () => {
  process.env.PERF_TELEMETRY_ENABLED = 'false';
  const telemetry = require('../src/observability/performanceTelemetry');
  telemetry.stop();
  telemetry.reset();
  const before = telemetry.snapshot().sampleSequence;
  telemetry.snapshot();
  telemetry.snapshot();
  assert.equal(telemetry.snapshot().sampleSequence, before);

  const source = read('src/observability/performanceTelemetry.js');
  assert.match(source, /function runSampleCycle/);
  assert.doesNotMatch(source, /logTimer/);
  assert.doesNotMatch(source, /setInterval\(\(\) => \{\s*const snapshot = sampleNow/);
});

test('Phase241 rolling request window uses fixed buckets instead of per-request events', () => {
  const telemetry = require('../src/observability/performanceTelemetry');
  telemetry.reset();
  for (let index = 0; index < 1000; index += 1) {
    const done = telemetry.recordRequestStart();
    done({ statusCode: index % 10 === 0 ? 500 : 200, responseBytes: 10 });
  }
  assert.equal(telemetry._private.requestBuckets.length, 60);
  assert.equal(telemetry._private.windowSummary().requestsLast5Minutes, 1000);
  assert.ok(telemetry._private.windowSummary().errorRate5Minutes > 0);
  assert.doesNotMatch(read('src/observability/performanceTelemetry.js'), /requestEvents/);
});

test('capacity evaluator uses configured p95 threshold and dimension statuses', () => {
  const { evaluateCapacity } = require('../src/observability/capacityEvaluator');
  const result = evaluateCapacity({
    runtime: {
      process: { rssBytes: 100, heapUtilizationRatio: 0.2 },
      eventLoop: { available: true, p95Ms: 10, p99Ms: 20 }
    },
    requests: { activeRequests: 0, window: { requestsLast5Minutes: 100, errorRate5Minutes: 0 } },
    api: { sampleCount: 50, overallP95Ms: 2000, worstRouteP95Ms: 2000 },
    config: { memoryLimitMb: 0, p95WarnMs: 1500, errorRateWarn: 0.05, activeRequestWarn: 25, heapWarnRatio: 0.85, eventLoopWarnMs: 75, eventLoopCriticalMs: 250 }
  });
  assert.equal(result.dimensions.memory, 'unknown');
  assert.equal(result.dimensions.apiLatency, 'watch');
  assert.equal(result.status, 'watch');
  assert.match(JSON.stringify(result.reasons), /apiP95Ms/);
});

test('performance observation routes are RBAC protected and Phase240 routes remain', () => {
  const routes = read('src/routes/systemRoutes.js');
  assert.match(routes, /system\/performance-baseline', requireRole\(\['admin', 'manager'\]\)/);
  assert.match(routes, /system\/performance-baseline\/reset', requireRole\(\['admin'\]\)/);
  assert.match(routes, /system\/performance-observation', requireRole\(\['admin', 'manager'\]\)/);
  assert.match(routes, /system\/performance-observation\/export', requireRole\(\['admin', 'manager'\]\)/);
  assert.match(routes, /system\/performance-observation\/start', requireRole\(\['admin'\]\)/);
  assert.match(routes, /system\/performance-observation\/stop', requireRole\(\['admin'\]\)/);
});

test('benchmark registry blocks arbitrary endpoints and remote target requires environment classification', () => {
  const custom = spawnSync(process.execPath, ['scripts/performance/api-benchmark.js'], {
    cwd: ROOT,
    env: { ...process.env, PERF_IN_PROCESS: '1', PERF_ENDPOINTS: '/api/system/reset' },
    encoding: 'utf8'
  });
  assert.notEqual(custom.status, 0);
  assert.match(`${custom.stderr}${custom.stdout}`, /write-like endpoint/);

  const remote = spawnSync(process.execPath, ['scripts/performance/api-benchmark.js'], {
    cwd: ROOT,
    env: { ...process.env, PERF_BASE_URL: 'https://example.invalid', PERF_ALLOW_REMOTE: 'true' },
    encoding: 'utf8'
  });
  assert.notEqual(remote.status, 0);
  assert.match(`${remote.stderr}${remote.stdout}`, /PERF_TARGET_ENV=staging or production/);
});

test('benchmark streams response bodies and separates client/server metrics', () => {
  const source = read('scripts/performance/api-benchmark.js');
  assert.match(source, /getReader/);
  assert.doesNotMatch(source, /arrayBuffer\(/);
  assert.match(source, /clientMetrics/);
  assert.match(source, /serverBefore/);
  assert.match(source, /serverAfter/);
  assert.match(source, /serverDelta/);
  assert.match(source, /BLOCKED_RELEASE_CHANGED/);
  assert.match(source, /BLOCKED_AUTH/);
  assert.doesNotMatch(source, /MEASURED_PRODUCTION_READ_ONLY'\s*:\s*!local/);
});

