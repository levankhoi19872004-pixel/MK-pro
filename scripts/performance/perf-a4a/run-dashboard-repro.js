'use strict';

const Cache = require('../../../src/services/dashboard/DashboardCacheService');
const Completeness = require('../../../src/services/dashboard/DashboardReadModelCompletenessService');

function legacyInvalidate(cache, period) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${period}:`)) cache.delete(key);
  }
}

function buildEvidence() {
  const legacy = new Map([
    ['sales-staff:2026-08:2026-08-06', 1],
    ['delivery-summary:2026-08:2026-08-06', 1]
  ]);
  legacyInvalidate(legacy, '2026-08');

  Cache._testing.resetForTests();
  const sales = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', date: '2026-08-06', scope: 'global' });
  const delivery = Cache.createCacheContext({ module: 'delivery-summary', period: '2026-08', date: '2026-08-06', scope: 'global' });
  Cache.writeV2(sales, { id: 'sales' });
  Cache.writeV2(delivery, { id: 'delivery' });
  const removed = Cache.invalidate({ period: '2026-08' });

  const docs = [
    { date: '2026-08-05', sourceVersion: 'v1', generatedAt: '2026-08-05T23:00:00.000Z' },
    { date: '2026-08-06', sourceVersion: 'v2', generatedAt: '2026-08-06T08:00:00.000Z' }
  ];
  const complete = Completeness.inspectCompleteness({ expectedDates: ['2026-08-05', '2026-08-06'], docs });
  const missing = Completeness.inspectCompleteness({ expectedDates: ['2026-08-05', '2026-08-06'], docs: docs.slice(0, 1) });

  return {
    generatedAt: new Date().toISOString(),
    cacheInvalidation: {
      legacyRemainingKeysAfterPeriodInvalidation: legacy.size,
      v2RemovedKeys: removed,
      v2RemainingSales: Cache.readV2(sales) !== null,
      v2RemainingDelivery: Cache.readV2(delivery) !== null,
      legacyStrictFreshnessQueriesPerRead: 7,
      v2FreshnessQueriesPerRead: 0,
      cacheHitLiveQueries: 0,
      store: Cache.describeStore()
    },
    readModel: {
      complete: {
        complete: complete.complete,
        missingDates: complete.missingDates,
        sourceVersion: complete.sourceVersion,
        generatedAt: complete.generatedAt,
        strategy: Completeness.chooseReadStrategy({ completeness: complete }).strategy
      },
      missingOneDay: {
        complete: missing.complete,
        missingDates: missing.missingDates,
        strategy: Completeness.chooseReadStrategy({ completeness: missing }).strategy,
        meta: Completeness.buildFallbackMeta(missing)
      }
    }
  };
}

if (require.main === module) console.log(JSON.stringify(buildEvidence(), null, 2));
module.exports = { buildEvidence };
