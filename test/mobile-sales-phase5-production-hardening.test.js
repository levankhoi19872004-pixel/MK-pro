'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('mobile runtime defaults to online-first and keeps only temporary legacy drain', () => {
  const runtime = require('../src/services/mobile/runtimeConfig.service');
  withEnv({
    ENABLE_MOBILE_OFFLINE_QUEUE: undefined,
    ENABLE_MOBILE_LEGACY_SYNC_DRAIN: undefined,
    MOBILE_LEGACY_SYNC_DRAIN_UNTIL: undefined
  }, () => {
    const config = runtime.getMobileRuntimeConfig();
    assert.equal(config.onlineFirst, true);
    assert.equal(config.offlineQueueEnabled, false);
    assert.equal(config.legacySyncDrainEnabled, true);
    assert.equal(config.apiTimeoutMs, 15000);
    assert.equal(config.commandTimeoutMs, 30000);
  });
});

test('legacy sync drain closes after configured expiry', () => {
  const runtime = require('../src/services/mobile/runtimeConfig.service');
  withEnv({
    ENABLE_MOBILE_LEGACY_SYNC_DRAIN: 'true',
    MOBILE_LEGACY_SYNC_DRAIN_UNTIL: '2026-01-01T00:00:00.000Z'
  }, () => {
    assert.equal(runtime.isLegacyDrainAvailable(process.env, Date.parse('2025-12-31T23:59:59.000Z')), true);
    assert.equal(runtime.isLegacyDrainAvailable(process.env, Date.parse('2026-01-01T00:00:01.000Z')), false);
  });
});

test('client telemetry strips query strings and business identifiers', () => {
  const telemetry = require('../src/services/mobile/telemetry.service');
  assert.equal(telemetry.sanitizePath('/api/mobile/sales/orders/SO123456?q=secret'), '/api/mobile/sales/orders/:id');
  assert.equal(telemetry.sanitizePath('/api/mobile/customers/507f1f77bcf86cd799439011'), '/api/mobile/customers/:id');
  assert.equal(telemetry.sanitizePath('https://example.com/api/mobile/orders'), '');
  const row = telemetry.sanitizeTelemetryEvent({
    path: '/api/mobile/sales/orders/SO123456?customer=ABC',
    clientMs: '123.8', serverMs: 50, status: 500, errorCode: 'SENSITIVE_ERROR_TEXT', requestId: 'mobile:1'
  });
  assert.deepEqual(row, {
    at: '', path: '/api/mobile/sales/orders/:id', clientMs: 124, serverMs: 50,
    status: 500, errorCode: 'ERROR', requestId: 'mobile:1'
  });
});

test('telemetry batch writes one operational log and never business data', async () => {
  const telemetry = require('../src/services/mobile/telemetry.service');
  let call = null;
  await withEnv({ MOBILE_CLIENT_TELEMETRY_ENABLED: 'true' }, async () => {
    const result = await telemetry.recordClientTelemetry({
      appVersion: 'phase86',
      events: [{ path: '/api/mobile/customers?page=1', clientMs: 200, serverMs: 80, status: 200 }]
    }, {
      actor: { code: 'NV01' },
      async writeMobileLogDirect(...args) { call = args; }
    });
    assert.equal(result.accepted, 1);
  });
  assert.ok(call);
  assert.equal(call[1], 'mobile_client_perf_batch');
  assert.equal(call[2].detail.events[0].path, '/api/mobile/customers');
  assert.equal(Object.hasOwn(call[2].detail, 'orders'), false);
});

test('mobile query plan audit detects COLLSCAN and excessive examined documents', () => {
  const audit = require('../scripts/audit-mobile-query-plans');
  const summary = audit.summarizeExplain({
    queryPlanner: { namespace: 'db.orders', winningPlan: { stage: 'COLLSCAN' } },
    executionStats: { nReturned: 10, totalDocsExamined: 500, totalKeysExamined: 0, executionTimeMillis: 40 }
  });
  assert.equal(summary.collectionScan, true);
  assert.equal(summary.examinedRatio, 50);
  const result = audit.auditViolations([{ query: 'orders', ...summary }], {
    MOBILE_QUERY_PLAN_MAX_DOCS_RATIO: '20', MOBILE_QUERY_PLAN_MAX_EXECUTION_MS: '500'
  });
  assert.deepEqual(result.violations.map((row) => row.code).sort(), ['COLLSCAN', 'DOCS_EXAMINED_RATIO']);
});

test('mobile production benchmark thresholds reject slow, large or failing responses', () => {
  const { evaluate } = require('../scripts/performance/mobile-production-benchmark');
  const result = evaluate({ results: [{
    endpoint: '/api/mobile/customers', concurrent: 5, requests: 100, failures: 2,
    latencyMs: { p95: 3500 }, responseBytes: { average: 250000 }
  }] }, {
    MOBILE_BENCHMARK_MAX_P95_MS: '3000',
    MOBILE_BENCHMARK_MAX_AVG_BYTES: '200000',
    MOBILE_BENCHMARK_MAX_FAILURE_RATE: '0.01'
  });
  assert.deepEqual(result.violations.map((row) => row.code).sort(), ['AVG_BYTES', 'FAILURE_RATE', 'P95_MS']);
});

test('API monitor percentile uses a bounded, deterministic nearest-rank calculation', () => {
  const { percentile } = require('../src/middlewares/apiMonitor.middleware');
  assert.equal(percentile([100, 10, 50, 20], 0.5), 20);
  assert.equal(percentile([100, 10, 50, 20], 0.95), 100);
  assert.equal(percentile([], 0.95), 0);
});

test('frontend is online-first and does not silently queue a new order', () => {
  const config = read('public/mobile/js/config.js');
  const offline = read('public/mobile/js/offline-sync.js');
  const sales = read('public/mobile/js/sales.source/part-03.jsfrag');
  assert.match(config, /offlineQueueEnabled:\s*false/);
  assert.match(offline, /OFFLINE_QUEUE_DISABLED/);
  assert.match(offline, /function canQueueOfflineOperation/);
  assert.match(sales, /Mất kết nối — đơn chưa được gửi/);
  assert.match(sales, /persistOrderDraft\(\)/);
});

test('mobile hardening adds runtime config, telemetry, CSP and no-store policy', () => {
  const routes = read('src/routes/mobile/index.js');
  const app = read('src/app.js');
  assert.match(routes, /\/runtime-config/);
  assert.match(routes, /\/telemetry/);
  assert.match(app, /Content-Security-Policy/);
  assert.match(app, /object-src 'none'/);
  assert.match(app, /frame-ancestors 'none'/);
  assert.match(app, /Permissions-Policy/);
  assert.match(app, /Cache-Control', 'no-store, no-cache/);
});

test('browser smoke contract covers supported mobile widths without production access', () => {
  const browser = require('../scripts/mobile-browser-smoke');
  assert.deepEqual(browser.VIEWPORTS, [320, 360, 390, 412]);
  const html = browser.instrumentSalesHtml('<html><body><script type="module"></script></body></html>');
  assert.match(html, /v43_mobile_user/);
  assert.match(html, /mobileAuditResult/);
  assert.doesNotThrow(() => browser.validateMetrics({
    documentWidth: 320, bodyWidth: 320, navVisible: true, navButtons: 4,
    customerCards: 1, orderTabActive: true, undersized: []
  }, 320));
});
