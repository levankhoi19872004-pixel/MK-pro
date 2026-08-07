'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const Cache = require('../../../src/services/dashboard/DashboardCacheService');

function loadHomeService(counters) {
  const modulePath = path.resolve(__dirname, '../../../src/services/dashboard/HomeDashboardService.js');
  delete require.cache[modulePath];
  const fail = (name) => async () => { counters[name] = (counters[name] || 0) + 1; throw new Error(`unexpected live query: ${name}`); };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../models/User') return { find: () => { throw new Error('unexpected User.find'); } };
    if (request === '../../utils/date.util') return { todayVN: () => '2026-08-06', VIETNAM_TIME_ZONE: 'Asia/Ho_Chi_Minh' };
    if (request === '../../constants/finance.constants') return { DEBT_ZERO_TOLERANCE: 1000 };
    if (request === './SalesTargetService') return {
      assertPeriod: (value) => value || '2026-08',
      userStaffCode: () => '',
      userStaffName: () => '',
      listByPeriod: fail('targets')
    };
    if (request === './SalesDashboardQuery') return { aggregateSales: fail('sales'), aggregateReturns: fail('returns') };
    if (request === './DebtDashboardQuery') return { aggregateCurrentDebt: fail('debt') };
    if (request === './DeliveryDashboardQuery') return {
      DELIVERED_STATUSES: [], FAILED_DELIVERY_STATUSES: [], DELIVERING_STATUSES: [],
      aggregateDeliveryMonth: fail('deliveryMonth'), aggregateDeliveryToday: fail('deliveryToday'), aggregateDeliveryReturns: fail('deliveryReturns')
    };
    if (request === './DashboardDailyStatsService') return {
      buildSalesStaffDashboard: fail('readModelSales'),
      buildDeliveryDashboard: fail('readModelDelivery'),
      inspectRangeCompleteness: fail('completeness'),
      fallbackMeta: () => ({ source: 'fallback-live-query', missingDates: [] })
    };
    if (request === './DashboardMongoExpressions') return { firstValidDateExpression: () => ({}) };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('sales-staff cache hit returns without live or read-model queries', async () => {
  const previousCache = process.env.PERF_DASHBOARD_CACHE_V2;
  const previousReadModel = process.env.PERF_DASHBOARD_READ_MODEL_V2;
  process.env.PERF_DASHBOARD_CACHE_V2 = '1';
  process.env.PERF_DASHBOARD_READ_MODEL_V2 = '1';
  Cache._testing.resetForTests();
  const counters = {};
  const Service = loadHomeService(counters);
  const context = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', date: '2026-08-06', scope: { branch: 'A' } });
  Cache.writeV2(context, { mode: 'sales-staff', meta: { source: 'dashboardDailyStats' }, salesByStaff: [{ salesStaffCode: 'S1' }] });
  const result = await Service.getSalesStaffDashboard({ month: '2026-08', scope: { branch: 'A' } });
  assert.equal(result.cacheHit, true);
  assert.equal(result.salesByStaff[0].salesStaffCode, 'S1');
  assert.deepEqual(counters, {});
  if (previousCache === undefined) delete process.env.PERF_DASHBOARD_CACHE_V2; else process.env.PERF_DASHBOARD_CACHE_V2 = previousCache;
  if (previousReadModel === undefined) delete process.env.PERF_DASHBOARD_READ_MODEL_V2; else process.env.PERF_DASHBOARD_READ_MODEL_V2 = previousReadModel;
});

test('delivery-summary cache hit is isolated by scope', async () => {
  const previousCache = process.env.PERF_DASHBOARD_CACHE_V2;
  process.env.PERF_DASHBOARD_CACHE_V2 = '1';
  Cache._testing.resetForTests();
  const counters = {};
  const Service = loadHomeService(counters);
  const contextA = Cache.createCacheContext({ module: 'delivery-summary', period: '2026-08', date: '2026-08-06', scope: 'A' });
  Cache.writeV2(contextA, { mode: 'delivery-summary', meta: { source: 'dashboardDailyStats' }, deliveryMonth: [{ deliveryStaffCode: 'D1' }] });
  const result = await Service.getDeliveryDashboard({ month: '2026-08', scope: 'A' });
  assert.equal(result.cacheHit, true);
  assert.equal(result.deliveryMonth[0].deliveryStaffCode, 'D1');
  const contextB = Cache.createCacheContext({ module: 'delivery-summary', period: '2026-08', date: '2026-08-06', scope: 'B' });
  assert.equal(Cache.readV2(contextB), null);
  assert.deepEqual(counters, {});
  if (previousCache === undefined) delete process.env.PERF_DASHBOARD_CACHE_V2; else process.env.PERF_DASHBOARD_CACHE_V2 = previousCache;
});
