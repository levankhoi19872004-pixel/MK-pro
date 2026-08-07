'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(file) { return fs.readFileSync(file, 'utf8'); }

test('feature flags are opt-in and production default remains legacy', () => {
  const cache = source('src/services/dashboard/DashboardCacheService.js');
  const home = source('src/services/dashboard/HomeDashboardService.js');
  assert.match(cache, /process\.env\.PERF_DASHBOARD_CACHE_V2/);
  assert.match(home, /process\.env\.PERF_DASHBOARD_READ_MODEL_V2/);
  assert.doesNotMatch(cache, /PERF_DASHBOARD_CACHE_V2\s*\|\|\s*['"]true/);
});

test('fallback is full live query and incomplete responses are not cached', () => {
  const home = source('src/services/dashboard/HomeDashboardService.js');
  assert.match(home, /perf-a4a-full-live-fallback/);
  assert.match(home, /Incomplete read-model responses are intentionally not cached/);
  assert.match(home, /fallbackMeta\(rangeInfo/);
});

test('repair command is dry-run by default and apply requires confirmation', () => {
  const repair = source('scripts/performance/perf-a4a/repair-dashboard-read-model.js');
  assert.match(repair, /--apply/);
  assert.match(repair, /--confirm-repair/);
  assert.match(repair, /writesPlanned/);
  assert.match(repair, /if \(apply && !confirmed\)/);
});

test('cache abstraction explicitly exposes shared-adapter contract and safe fallback', () => {
  const cache = source('src/services/dashboard/DashboardCacheService.js');
  assert.match(cache, /sharedAdapterContract/);
  assert.match(cache, /shared:\s*false/);
  assert.match(cache, /safeFallback/);
});
