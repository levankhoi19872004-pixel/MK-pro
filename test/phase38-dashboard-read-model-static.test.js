'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function indexOrFail(source, needle, message) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, message || `Missing ${needle}`);
  return index;
}

test('Phase38 adds dashboardDailyStats model, index and rebuild script', () => {
  const model = read('src/models/DashboardDailyStat.js');
  const index = read('src/models/index.js');
  const mongoIndex = read('src/services/mongoIndexService.js');
  const script = read('scripts/rebuild-dashboard-daily-stats.js');

  assert.match(model, /DashboardDailyStat/);
  assert.match(model, /dashboardDailyStats/);
  assert.match(model, /date: \{ type: String, required: true \}/);
  assert.match(index, /dashboardDailyStats: require\('\.\/DashboardDailyStat'\)/);
  assert.match(mongoIndex, /uniq_dashboard_daily_stats_date/);
  assert.match(script, /DashboardDailyStatsService\.upsertDailyStat/);
  assert.match(script, /--date=YYYY-MM-DD|argValue\('date'\)/);
});

test('Phase38 dashboard overview reads dashboardDailyStats before live aggregate fallback', () => {
  const source = read('src/services/dashboard/DashboardOverviewService.js');
  const readModelIndex = indexOrFail(source, 'DashboardDailyStatsService.buildOverviewDashboard');
  const salesAggregateIndex = indexOrFail(source, 'aggregateSalesRoot(range.dateFrom, range.dateTo');
  const returnsAggregateIndex = indexOrFail(source, 'aggregateReturnsRoot(range.dateFrom, range.dateTo)');

  assert.ok(readModelIndex < salesAggregateIndex, 'overview must try dashboardDailyStats before SalesOrder aggregate fallback');
  assert.ok(readModelIndex < returnsAggregateIndex, 'overview must try dashboardDailyStats before ReturnOrder aggregate fallback');
  assert.match(source, /source: 'fallback-live-query'/);
});

test('Phase38 sales-staff and delivery-summary read dashboardDailyStats before heavy fallback', () => {
  const source = read('src/services/dashboard/HomeDashboardService.js');
  const salesMethod = source.slice(source.indexOf('async function getSalesStaffDashboard'), source.indexOf('async function getDeliveryDashboard'));
  const deliveryMethod = source.slice(source.indexOf('async function getDeliveryDashboard'), source.indexOf('module.exports'));

  assert.ok(indexOrFail(salesMethod, 'DashboardDailyStatsService.buildSalesStaffDashboard') < indexOrFail(salesMethod, 'SalesDashboardQuery.aggregateSales'));
  assert.ok(indexOrFail(deliveryMethod, 'DashboardDailyStatsService.buildDeliveryDashboard') < indexOrFail(deliveryMethod, 'DeliveryDashboardQuery.aggregateDeliveryMonth'));
  assert.match(salesMethod, /source: 'fallback-live-query'/);
  assert.match(deliveryMethod, /source: 'fallback-live-query'/);
});

test('Phase38 read-model service exposes complete range guard and fallback metadata', () => {
  const source = read('src/services/dashboard/DashboardDailyStatsService.js');
  assert.match(source, /function enumerateDates/);
  assert.match(source, /missingDates/);
  assert.match(source, /buildOverviewDashboard/);
  assert.match(source, /buildSalesStaffDashboard/);
  assert.match(source, /buildDeliveryDashboard/);
  assert.match(source, /source: 'dashboardDailyStats'/);
  assert.match(source, /source: 'fallback-live-query'/);
  assert.doesNotMatch(source, /inventorySnapshots/i);
});

test('Phase38 frontend surfaces dashboardDailyStats and fallback source', () => {
  const source = read('public/js/app/00-dashboard.js');
  assert.match(source, /dashboardDailyStats/);
  assert.match(source, /fallback-live-query/);
  assert.match(source, /data\.meta\?\.updatedAt/);
  assert.doesNotMatch(source, /\/api\/dashboard\/home/);
});
