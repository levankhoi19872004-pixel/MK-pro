'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function legacyInvalidate(cache, period = '') {
  const normalizedPeriod = String(period || '').trim();
  if (!normalizedPeriod) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${normalizedPeriod}:`)) cache.delete(key);
  }
}

test('RED proof: legacy prefix invalidation leaves module-prefixed dashboard keys stale', () => {
  const cache = new Map([
    ['sales-staff:2026-08:2026-08-06', { value: 1 }],
    ['delivery-summary:2026-08:2026-08-06', { value: 2 }]
  ]);
  legacyInvalidate(cache, '2026-08');
  assert.equal(cache.size, 2);
});

test('GREEN contract not implemented yet: cache service must export canonical v2 key/tag API', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/services/dashboard/DashboardCacheService.js'), 'utf8');
  assert.match(source, /function buildCanonicalKey\s*\(/);
  assert.match(source, /function invalidateByTags\s*\(/);
});

test('GREEN contract not implemented yet: read model must expose structured completeness metadata', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/services/dashboard/DashboardDailyStatsService.js'), 'utf8');
  assert.match(source, /async function inspectRangeCompleteness\s*\(/);
  assert.match(source, /DashboardReadModelCompletenessService/);
  assert.match(source, /sourceVersion/);
});
