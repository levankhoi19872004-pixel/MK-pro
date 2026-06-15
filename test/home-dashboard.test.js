'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const dashboardService = require('../src/services/dashboard/HomeDashboardService');
const targetService = require('../src/services/dashboard/SalesTargetService');

test('dashboard month parser creates an exact Vietnam business period', () => {
  const period = dashboardService.parseMonth('2026-06');
  assert.equal(period.period, '2026-06');
  assert.equal(period.dateFrom, '2026-06-01');
  assert.equal(period.dateTo, '2026-06-30');
});

test('dashboard rate and target status handle zero target safely', () => {
  assert.equal(dashboardService.calculateRate(500000, 0), 0);
  assert.equal(dashboardService.resolveTargetStatus(0, 0), 'no_target');
  assert.equal(dashboardService.resolveTargetStatus(79.99, 100), 'below_target');
  assert.equal(dashboardService.resolveTargetStatus(80, 100), 'near_target');
  assert.equal(dashboardService.resolveTargetStatus(100, 100), 'achieved');
});

test('dashboard sales merge calculates net sales without mutating business documents', () => {
  const rows = dashboardService.mergeSalesRows({
    activeStaff: [{ salesStaffCode: '35128', salesStaffName: 'Nguyễn Thị Thùy' }],
    targets: [{ salesStaffCode: '35128', targetAmount: 1000000 }],
    monthlySales: [{ salesStaffCode: '35128', orderCount: 2, salesAmount: 900000 }],
    monthlyReturns: [{ salesStaffCode: '35128', returnCount: 1, returnAmount: 100000 }],
    currentDebt: [{ salesStaffCode: '35128', debtAmount: 200000 }],
    todaySales: [{ salesStaffCode: '35128', orderCount: 1, salesAmount: 300000 }]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].netSalesAmount, 800000);
  assert.equal(rows[0].achievementRate, 80);
  assert.equal(rows[0].status, 'near_target');
  assert.equal(rows[0].todaySalesAmount, 300000);
});

test('dashboard delivery status classification is stable', () => {
  assert.equal(dashboardService.resolveDeliveryBucket('delivered'), 'delivered');
  assert.equal(dashboardService.resolveDeliveryBucket('delivery_failed'), 'failed');
  assert.equal(dashboardService.resolveDeliveryBucket('on_route'), 'delivering');
  assert.equal(dashboardService.resolveDeliveryBucket('assigned'), 'pending');
});

test('sales target input validation rejects invalid periods and negative values', () => {
  assert.throws(() => targetService.assertPeriod('06/2026'), /YYYY-MM/);
  assert.throws(() => targetService.normalizeTargetAmount(-1), /không âm/);
  assert.equal(targetService.normalizeTargetAmount(1250000.4), 1250000);
});

test('dashboard API is isolated and protected by roles', () => {
  const routes = read('src/routes/dashboardRoutes.js');
  const routeIndex = read('src/routes/index.js');
  assert.match(routes, /router\.get\('\/home'/);
  assert.match(routes, /router\.put\('\/targets\/:period'/);
  assert.match(routes, /requireRole\(\['admin', 'manager', 'accountant'\]\)/);
  assert.match(routes, /requireRole\(\['admin', 'manager'\]\)/);
  assert.match(routeIndex, /app\.use\('\/api\/dashboard', dashboardRoutes\)/);
});

test('home UI is the initial lazy-loaded tab and legacy product tab remains available', () => {
  const html = read('public/index.html');
  const loader = read('public/js/bootstrap/03-tab-loader.js');
  assert.match(html, /data-tab="dashboardTab">Tổng quan/);
  assert.match(html, /id="dashboardTab" class="tab-content active"/);
  assert.match(html, /id="productsTab" class="tab-content"/);
  assert.match(loader, /case 'dashboardTab'/);
  assert.match(loader, /loadHomeDashboard/);
});

test('dashboard keeps the legacy report endpoint intact', () => {
  const reportRoutes = read('src/routes/reportRoutes.js');
  const legacyDashboardService = read('src/services/reports/DashboardReportService.js');
  assert.match(reportRoutes, /router\.get\('\/dashboard'/);
  assert.match(legacyDashboardService, /legacy\.dashboardReport/);
});
