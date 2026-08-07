'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const Cache = require('../../../src/services/dashboard/DashboardCacheService');

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test.beforeEach(() => Cache._testing.resetForTests());

test('canonical key is stable and scope-sensitive', () => {
  const left = Cache.buildCanonicalKey({ module: 'sales-staff', period: '2026-08', date: '2026-08-06', scope: { branch: 'A', role: 'manager' } });
  const reordered = Cache.buildCanonicalKey({ module: 'sales-staff', period: '2026-08', date: '2026-08-06', scope: { role: 'manager', branch: 'A' } });
  const other = Cache.buildCanonicalKey({ module: 'sales-staff', period: '2026-08', date: '2026-08-06', scope: { branch: 'B', role: 'manager' } });
  assert.equal(left, reordered);
  assert.notEqual(left, other);
  assert.match(left, /^dashboard-cache:v2:sales-staff:/);
});

test('invalidate period removes sales-staff and delivery-summary keys for exact period', () => {
  const sales = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', date: '2026-08-06', scope: 'global' });
  const delivery = Cache.createCacheContext({ module: 'delivery-summary', period: '2026-08', date: '2026-08-06', scope: 'global' });
  const september = Cache.createCacheContext({ module: 'sales-staff', period: '2026-09', date: '2026-09-01', scope: 'global' });
  Cache.writeV2(sales, { id: 'sales' });
  Cache.writeV2(delivery, { id: 'delivery' });
  Cache.writeV2(september, { id: 'september' });
  assert.equal(Cache.invalidate({ period: '2026-08' }), 2);
  assert.equal(Cache.readV2(sales), null);
  assert.equal(Cache.readV2(delivery), null);
  assert.deepEqual(Cache.readV2(september), { id: 'september' });
});

test('invalidate module and scope does not delete another scope or module', () => {
  const scopeA = { branch: 'A' };
  const scopeB = { branch: 'B' };
  const salesA = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: scopeA });
  const salesB = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: scopeB });
  const deliveryA = Cache.createCacheContext({ module: 'delivery-summary', period: '2026-08', scope: scopeA });
  Cache.writeV2(salesA, { id: 'sales-a' });
  Cache.writeV2(salesB, { id: 'sales-b' });
  Cache.writeV2(deliveryA, { id: 'delivery-a' });
  Cache.invalidate({ module: 'sales-staff', period: '2026-08', scope: scopeA });
  assert.equal(Cache.readV2(salesA), null);
  assert.deepEqual(Cache.readV2(salesB), { id: 'sales-b' });
  assert.deepEqual(Cache.readV2(deliveryA), { id: 'delivery-a' });
});

test('period invalidation uses exact tags and does not match a substring period', () => {
  const august = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: 'global' });
  const similar = Cache.createCacheContext({ module: 'sales-staff', period: '2026-080', scope: 'global' });
  Cache.writeV2(august, { id: 1 });
  Cache.writeV2(similar, { id: 2 });
  Cache.invalidate({ period: '2026-08' });
  assert.equal(Cache.readV2(august), null);
  assert.deepEqual(Cache.readV2(similar), { id: 2 });
});

test('mutation invalidation advances source version and prevents stale reads', () => {
  const context = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: 'global' });
  Cache.writeV2(context, { value: 1 }, { sourceTimestamp: '2026-08-06T00:00:00.000Z' });
  assert.deepEqual(Cache.readV2(context), { value: 1 });
  Cache.invalidate({ period: '2026-08' });
  assert.equal(Cache.readV2(context), null);
  const next = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: 'global' });
  assert.equal(Cache.readV2(next), null);
});

test('cache v2 freshness path does not load Mongo models', async () => {
  await withEnv({ PERF_DASHBOARD_CACHE_V2: '1', HOME_DASHBOARD_CACHE_STRICT_FRESHNESS: 'true' }, async () => {
    const originalLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
      if (request.startsWith('../../models/')) throw new Error(`unexpected model load: ${request}`);
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      assert.equal(await Cache.freshnessVersion(), 'mutation-driven-v2');
    } finally {
      Module._load = originalLoad;
    }
  });
});

test('store description is explicit that process-local cache is not shared', () => {
  const description = Cache.describeStore();
  assert.equal(description.type, 'process-local');
  assert.equal(description.shared, false);
  assert.ok(description.sharedAdapterContract.includes('invalidateByTags'));
});

test('invalidate all clears every module and scope', () => {
  const a = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: 'A' });
  const b = Cache.createCacheContext({ module: 'delivery-summary', period: '2026-09', scope: 'B' });
  Cache.writeV2(a, { id: 'a' });
  Cache.writeV2(b, { id: 'b' });
  Cache.invalidate({ all: true });
  assert.equal(Cache.readV2(a), null);
  assert.equal(Cache.readV2(b), null);
});
