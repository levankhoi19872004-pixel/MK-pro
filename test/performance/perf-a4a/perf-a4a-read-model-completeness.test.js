'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const Completeness = require('../../../src/services/dashboard/DashboardReadModelCompletenessService');
const Cache = require('../../../src/services/dashboard/DashboardCacheService');

function loadDailyStatsWithDocs(docs, writeResult = null) {
  const modulePath = path.resolve(__dirname, '../../../src/services/dashboard/DashboardDailyStatsService.js');
  delete require.cache[modulePath];
  const query = {
    select() { return this; },
    sort() { return this; },
    lean() { return Promise.resolve(docs); }
  };
  const fakeModel = {
    find() { return query; },
    findOne() { return { lean: () => Promise.resolve(null) }; },
    findOneAndUpdate() {
      return { lean: () => Promise.resolve(writeResult || docs[0] || {}) };
    }
  };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../../models/DashboardDailyStat') return fakeModel;
    if (request === './SalesTargetService') return {};
    if (request === '../../utils/date.util') return { todayVN: () => '2026-08-06', VIETNAM_TIME_ZONE: 'Asia/Ho_Chi_Minh' };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

const completeDocs = [
  {
    date: '2026-08-05',
    sourceVersion: 'v1',
    generatedAt: '2026-08-05T23:00:00.000Z',
    updatedAt: '2026-08-05T23:00:00.000Z',
    sales: { orderCount: 1, revenue: 100, pendingOrderCount: 1, pendingRevenue: 10, promotionValue: 3 },
    returns: { returnAmount: 5 },
    staff: {
      sales: [{ salesStaffCode: 'S1', salesStaffName: 'An', orderCount: 1, salesAmount: 100, pendingOrderCount: 1, pendingSalesAmount: 10, returnAmount: 5, debtAmount: 20 }],
      delivery: [{ deliveryStaffCode: 'D1', deliveryStaffName: 'Bình', assignedOrders: 1, deliveredOrders: 1, assignedAmount: 100, deliveredAmount: 100 }]
    }
  },
  {
    date: '2026-08-06',
    sourceVersion: 'v2',
    generatedAt: '2026-08-06T08:00:00.000Z',
    updatedAt: '2026-08-06T08:00:00.000Z',
    sales: { orderCount: 2, revenue: 200, pendingOrderCount: 2, pendingRevenue: 20, activeOrderCount: 2, activeRevenue: 220, promotionValue: 7 },
    returns: { returnAmount: 10 },
    staff: {
      sales: [{ salesStaffCode: 'S1', salesStaffName: 'An', orderCount: 2, salesAmount: 200, pendingOrderCount: 2, pendingSalesAmount: 20, returnAmount: 10, debtAmount: 30, todayOrderCount: 2, todaySalesAmount: 220 }],
      delivery: [{ deliveryStaffCode: 'D1', deliveryStaffName: 'Bình', assignedOrders: 2, deliveredOrders: 1, pendingOrders: 1, assignedAmount: 200, deliveredAmount: 100 }]
    }
  }
];

test('completeness detects a missing day and returns explicit fallback metadata', () => {
  const result = Completeness.inspectCompleteness({ expectedDates: ['2026-08-05', '2026-08-06'], docs: [completeDocs[0]] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingDates, ['2026-08-06']);
  const strategy = Completeness.chooseReadStrategy({ completeness: result });
  assert.equal(strategy.strategy, 'fallback-live-query');
  assert.equal(strategy.canMixSources, false);
  const meta = Completeness.buildFallbackMeta(result);
  assert.equal(meta.source, 'fallback-live-query');
  assert.deepEqual(meta.missingDates, ['2026-08-06']);
  assert.equal(meta.complete, false);
});

test('partial live fill is allowed only with explicit parity guarantee', () => {
  const result = Completeness.inspectCompleteness({ expectedDates: ['2026-08-05', '2026-08-06'], docs: [completeDocs[0]] });
  assert.equal(Completeness.chooseReadStrategy({ completeness: result, allowPartialLiveFill: true, parityGuaranteed: false }).strategy, 'fallback-live-query');
  const allowed = Completeness.chooseReadStrategy({ completeness: result, allowPartialLiveFill: true, parityGuaranteed: true, maxPartialDates: 1 });
  assert.equal(allowed.strategy, 'partial-live-fill');
  assert.deepEqual(allowed.missingDates, ['2026-08-06']);
});

test('complete path carries generatedAt, source timestamp, source version and no missing dates', () => {
  const result = Completeness.inspectCompleteness({ expectedDates: ['2026-08-05', '2026-08-06'], docs: completeDocs });
  assert.equal(result.complete, true);
  assert.equal(result.generatedAt, '2026-08-06T08:00:00.000Z');
  assert.match(result.sourceVersion, /^[a-f0-9]{64}$/);
  const meta = Completeness.buildReadModelMeta(result);
  assert.equal(meta.source, 'dashboardDailyStats');
  assert.equal(meta.generatedAt, '2026-08-06T08:00:00.000Z');
  assert.equal(meta.sourceTimestamp, '2026-08-06T08:00:00.000Z');
  assert.deepEqual(meta.missingDates, []);
});

test('duplicate dates fail completeness instead of silently choosing a row', () => {
  const result = Completeness.inspectCompleteness({ expectedDates: ['2026-08-05'], docs: [completeDocs[0], { ...completeDocs[0], sourceVersion: 'other' }] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.duplicateDates, ['2026-08-05']);
});

test('sales-staff read model matches expected financial snapshot', async () => {
  const Service = loadDailyStatsWithDocs(completeDocs);
  const result = await Service.buildSalesStaffDashboard({
    range: { period: '2026-08', dateFrom: '2026-08-05', dateTo: '2026-08-06', today: '2026-08-06' },
    targets: [{ salesStaffCode: 'S1', salesStaffName: 'An', targetAmount: 1000 }]
  });
  assert.equal(result.meta.source, 'dashboardDailyStats');
  assert.equal(result.summary.salesAmount, 300);
  assert.equal(result.summary.pendingSalesAmount, 30);
  assert.equal(result.summary.returnAmount, 15);
  assert.equal(result.summary.netSalesAmount, 285);
  assert.equal(result.summary.todaySalesAmount, 220);
  assert.equal(result.salesByStaff.length, 1);
  assert.equal(result.salesByStaff[0].salesAmount, 300);
  // Debt is a current-state metric; the latest day wins instead of summing history.
  assert.equal(result.salesByStaff[0].debtAmount, 30);
  assert.deepEqual(result.meta.missingDates, []);
});

test('delivery read model matches expected month and today snapshot', async () => {
  const Service = loadDailyStatsWithDocs(completeDocs);
  const result = await Service.buildDeliveryDashboard({
    range: { period: '2026-08', dateFrom: '2026-08-05', dateTo: '2026-08-06', today: '2026-08-06' }
  });
  assert.equal(result.deliveryMonth.length, 1);
  assert.equal(result.deliveryMonth[0].assignedOrders, 3);
  assert.equal(result.deliveryMonth[0].deliveredOrders, 2);
  assert.equal(result.deliveryToday[0].assignedOrders, 2);
  assert.equal(result.deliveryToday[0].pendingOrders, 1);
  assert.equal(result.meta.source, 'dashboardDailyStats');
});

test('missing-one-day build returns null and preserves missingDates for full fallback', async () => {
  const Service = loadDailyStatsWithDocs([completeDocs[0]]);
  const rangeInfo = await Service.inspectRangeCompleteness({ dateFrom: '2026-08-05', dateTo: '2026-08-06', today: '2026-08-06' });
  assert.equal(rangeInfo.complete, false);
  assert.deepEqual(rangeInfo.missingDates, ['2026-08-06']);
  assert.equal(await Service.buildSalesStaffDashboard({ range: { period: '2026-08', dateFrom: '2026-08-05', dateTo: '2026-08-06', today: '2026-08-06' }, targets: [], rangeInfo }), null);
  assert.deepEqual(Service.fallbackMeta(rangeInfo).missingDates, ['2026-08-06']);
});

test('confirmed read-model mutation invalidates period cache after write', async () => {
  Cache._testing.resetForTests();
  const context = Cache.createCacheContext({ module: 'sales-staff', period: '2026-08', scope: 'global' });
  Cache.writeV2(context, { stale: true });
  const Service = loadDailyStatsWithDocs(completeDocs, completeDocs[1]);
  await Service.upsertDailyStat({ ...completeDocs[1], month: '2026-08' });
  assert.equal(Cache.readV2(context), null);
});
