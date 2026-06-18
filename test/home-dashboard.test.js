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
    monthlySales: [{ salesStaffCode: '35128', orderCount: 2, salesAmount: 900000, promotionValue: 120000 }],
    monthlyPendingSales: [{ salesStaffCode: '35128', orderCount: 1, salesAmount: 250000 }],
    monthlyReturns: [{ salesStaffCode: '35128', returnCount: 1, returnAmount: 100000 }],
    currentDebt: [{ salesStaffCode: '35128', debtAmount: 200000 }],
    todaySales: [{ salesStaffCode: '35128', orderCount: 1, salesAmount: 300000 }]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].netSalesAmount, 800000);
  assert.equal(rows[0].totalSalesAmount, 1150000);
  assert.equal(rows[0].achievementRate, 80);
  assert.equal(rows[0].status, 'near_target');
  assert.equal(rows[0].todaySalesAmount, 300000);
  assert.equal(rows[0].pendingOrderCount, 1);
  assert.equal(rows[0].pendingSalesAmount, 250000);
  assert.equal(rows[0].promotionValue, 120000);
});


test('dashboard sales merge rejects delivery identities even when names overlap', () => {
  const rows = dashboardService.mergeSalesRows({
    activeStaff: [{ salesStaffCode: '33949', salesStaffName: 'Đỗ Thị Anh' }],
    targets: [],
    monthlySales: [{ salesStaffCode: '33949', salesStaffName: 'Đỗ Thị Anh', orderCount: 8, salesAmount: 141755949 }],
    monthlyReturns: [],
    currentDebt: [
      { salesStaffCode: '33949', salesStaffName: 'Đỗ Thị Anh', debtAmount: 334300942 },
      { salesStaffCode: 'ghtp', salesStaffName: 'Đỗ Thị Anh', debtAmount: 4978114 },
      { salesStaffCode: 'ghtn', salesStaffName: 'Đặng Trung Thành', debtAmount: 6826860 }
    ],
    todaySales: []
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].salesStaffCode, '33949');
  assert.equal(rows[0].debtAmount, 334300942);
  assert.equal(rows.some((row) => row.salesStaffCode === 'ghtp'), false);
  assert.equal(rows.some((row) => row.salesStaffCode === 'ghtn'), false);
});

test('dashboard can map a code-less source only by a unique sales staff name', () => {
  const rows = dashboardService.mergeSalesRows({
    activeStaff: [{ salesStaffCode: '35128', salesStaffName: 'Nguyễn Thị Thùy' }],
    targets: [],
    monthlySales: [{ salesStaffCode: '', salesStaffName: 'Nguyễn Thị Thùy', orderCount: 2, salesAmount: 100000 }],
    monthlyReturns: [],
    currentDebt: [],
    todaySales: []
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].salesStaffCode, '35128');
  assert.equal(rows[0].salesAmount, 100000);
});

test('sales target Excel rows accept Vietnamese headers and reject duplicates', () => {
  const rows = targetService.parseTargetImportRows([
    { __rowNo: 2, 'Mã NVBH': '35128', 'Tên NVBH': 'Nguyễn Thị Thùy', 'Chỉ tiêu tháng': '4.000.000.000' }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].salesStaffCode, '35128');
  assert.equal(rows[0].targetAmount, 4000000000);

  assert.throws(() => targetService.parseTargetImportRows([
    { __rowNo: 2, 'Mã NVBH': '35128', 'Chỉ tiêu tháng': 1000 },
    { __rowNo: 3, 'Mã NVBH': '35128', 'Chỉ tiêu tháng': 2000 }
  ]), /Trùng mã|không hợp lệ/);
  assert.throws(() => targetService.normalizeImportedTargetAmount('4 tỷ'), /không phải số hợp lệ/);
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
  assert.match(routes, /router\.get\('\/targets\/template'/);
  assert.match(routes, /'\/targets\/:period\/import'/);
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
  assert.match(html, /id="dashboardTargetUploadButton"/);
  assert.match(html, /id="dashboardTargetTemplateButton"/);
  assert.match(loader, /case 'dashboardTab'/);
  assert.match(loader, /loadHomeDashboard/);
});

test('dashboard keeps the legacy report endpoint intact', () => {
  const reportRoutes = read('src/routes/reportRoutes.js');
  const legacyDashboardService = read('src/services/reports/DashboardReportService.js');
  assert.match(reportRoutes, /router\.get\('\/dashboard'/);
  assert.match(legacyDashboardService, /legacy\.dashboardReport/);
});

test('dashboard canonical date filter chooses one business date instead of OR-ing createdAt', () => {
  const filter = dashboardService.buildDateRangeFilter('2026-06-01', '2026-06-30', ['orderDate', 'date']);
  const serialized = JSON.stringify(filter);
  assert.match(serialized, /\$expr/);
  assert.match(serialized, /orderDate/);
  assert.match(serialized, /createdAt/);
  assert.doesNotMatch(serialized, /"\$or"/);
});

test('dashboard summary uses Mongo canonical totals while staff table remains sales-only', () => {
  const rows = dashboardService.mergeSalesRows({
    activeStaff: [{ salesStaffCode: '35128', salesStaffName: 'Nguyễn Thị Thùy' }],
    targets: [{ salesStaffCode: '35128', targetAmount: 1000000 }],
    monthlySales: [{ salesStaffCode: '35128', orderCount: 1, salesAmount: 800000, promotionValue: 60000 }],
    monthlyPendingSales: [{ salesStaffCode: '35128', orderCount: 2, salesAmount: 200000 }],
    monthlyReturns: [{ salesStaffCode: '35128', returnCount: 1, returnAmount: 50000 }],
    currentDebt: [{ salesStaffCode: '35128', debtAmount: 100000 }],
    todaySales: []
  });
  const summary = dashboardService.buildSummary(rows, {
    sales: { orderCount: 2, salesAmount: 900000, promotionValue: 70000 },
    pendingSales: { orderCount: 3, salesAmount: 250000 },
    returns: { returnAmount: 70000 },
    debt: { debtAmount: 150000 },
    todaySales: { orderCount: 0, salesAmount: 0 }
  });

  assert.equal(summary.targetAmount, 1000000);
  assert.equal(summary.orderCount, 2);
  assert.equal(summary.salesAmount, 900000);
  assert.equal(summary.returnAmount, 70000);
  assert.equal(summary.pendingOrderCount, 3);
  assert.equal(summary.pendingSalesAmount, 250000);
  assert.equal(summary.totalSalesAmount, 1150000);
  assert.equal(summary.promotionValue, 70000);
  assert.equal(summary.netSalesAmount, 830000);
  assert.equal(summary.debtAmount, 150000);
});

test('dashboard reports unmapped Mongo documents instead of silently adding delivery identities to sales table', () => {
  const quality = dashboardService.buildDataQuality({
    activeStaff: {
      sales: [{ salesStaffCode: '35128', salesStaffName: 'Nguyễn Thị Thùy' }],
      delivery: [{ deliveryStaffCode: 'ghtp', deliveryStaffName: 'Đỗ Thị Anh' }]
    },
    monthlySales: [{ salesStaffCode: 'ghtp', salesStaffName: 'Đỗ Thị Anh', orderCount: 2, salesAmount: 100000 }],
    todaySales: [],
    monthlyReturns: [],
    currentDebt: [{ salesStaffCode: '', salesStaffName: '', debtDocumentCount: 1, debtAmount: 50000 }],
    deliveryMonthRaw: [],
    deliveryTodayRaw: []
  });

  assert.equal(quality.unmapped.monthlySales.documentCount, 2);
  assert.equal(quality.unmapped.monthlySales.amount, 100000);
  assert.equal(quality.unmapped.currentDebt.amount, 50000);
  assert.ok(quality.warnings.length >= 2);
});

test('dashboard query contracts use canonical Mongo sources and no snapshot reader', () => {
  const salesQuery = read('src/services/dashboard/SalesDashboardQuery.js');
  const debtQuery = read('src/services/dashboard/DebtDashboardQuery.js');
  const deliveryQuery = read('src/services/dashboard/DeliveryDashboardQuery.js');
  const homeQuery = read('src/services/dashboard/HomeDashboardService.js');
  const cacheService = read('src/services/dashboard/DashboardCacheService.js');

  assert.match(salesQuery, /SalesOrder\.aggregate/);
  assert.match(salesQuery, /ReturnOrder\.aggregate/);
  assert.match(debtQuery, /ArLedger\.aggregate/);
  assert.match(deliveryQuery, /MasterOrder\.aggregate/);
  assert.match(deliveryQuery, /listDeliveryTodaySummary/);
  assert.doesNotMatch([salesQuery, debtQuery, deliveryQuery, homeQuery].join('\n'), /inventorySnapshots|mobileContext|getPrimaryDataSnapshot|data\/.*\.json/);
  assert.match(cacheService, /HOME_DASHBOARD_CACHE_TTL_MS \|\| 0/);
});

test('dashboard accounting contract excludes lifecycle completed from confirmed sales', () => {
  const expressions = read('src/services/dashboard/DashboardMongoExpressions.js');
  const filterBlock = expressions.match(/function accountingConfirmedFilter\(\)[\s\S]*?\n}\n\nfunction returnConfirmedFilter/)?.[0] || '';
  assert.ok(filterBlock);
  assert.match(filterBlock, /accountingConfirmed/);
  assert.match(filterBlock, /accountingStatus/);
  assert.match(filterBlock, /arPosted/);
  assert.doesNotMatch(filterBlock, /lifecycleStatus/);
  assert.doesNotMatch(filterBlock, /completed/);
});

test('dashboard active-document filter excludes every legacy cancel/delete marker', () => {
  const expressions = read('src/services/dashboard/DashboardMongoExpressions.js');
  const activeBlock = expressions.match(/function activeDocumentFilter\(\)[\s\S]*?\n}\n\nfunction accountingConfirmedFilter/)?.[0] || '';

  assert.match(activeBlock, /lifecycleStatus/);
  assert.match(activeBlock, /deliveryStatus/);
  assert.match(activeBlock, /returnStatus/);
  assert.match(activeBlock, /returnState/);
  assert.match(activeBlock, /deleted/);
  assert.match(activeBlock, /isDeleted/);
  assert.match(activeBlock, /deletedAt/);
});

test('dashboard actual-sales pipeline prioritizes locked order value and excludes promo lines', () => {
  const salesQuery = require('../src/services/dashboard/SalesDashboardQuery');
  const pipeline = salesQuery.buildActualSalesPipeline('2026-06-01', '2026-06-30', { accountingScope: 'confirmed' });
  const serialized = JSON.stringify(pipeline);

  assert.match(serialized, /accountingConfirmed/);
  assert.match(serialized, /totalAfterPromotion/);
  assert.match(serialized, /goodsAmountAfterPromotion/);
  assert.match(serialized, /lineAmountAtOrder/);
  assert.match(serialized, /finalPriceAtOrder/);
  assert.match(read('src/services/dashboard/SalesDashboardQuery.js'), /firstDefinedNumberExpression/);
  assert.match(serialized, /items\.isPromo/);
  assert.match(serialized, /PROMO/);
  assert.match(serialized, /promotionValue/);
  assert.match(serialized, /duplicateDiscardedAmount/);
  assert.match(serialized, /_dashboardHistoricalCatalogPrice/);
  assert.match(serialized, /_dashboardCurrentCatalogPrice/);
});

test('dashboard pending-sales scope is the inverse of accounting-confirmed scope', () => {
  const salesQuery = require('../src/services/dashboard/SalesDashboardQuery');
  const pendingPipeline = JSON.stringify(
    salesQuery.buildActualSalesPipeline('2026-06-01', '2026-06-30', { accountingScope: 'pending' })
  );
  const activePipeline = JSON.stringify(
    salesQuery.buildActualSalesPipeline('2026-06-01', '2026-06-30', { accountingScope: 'active' })
  );

  assert.match(pendingPipeline, /"\$nor"/);
  assert.match(pendingPipeline, /accountingConfirmed/);
  assert.doesNotMatch(activePipeline, /accountingNeedsReconfirm|"arPosted":true/);
});

test('dashboard return value uses locked return amount and excludes promo return lines', () => {
  const salesQuery = require('../src/services/dashboard/SalesDashboardQuery');
  const pipeline = salesQuery.buildActualReturnsPipeline('2026-06-01', '2026-06-30');
  const serialized = JSON.stringify(pipeline);

  assert.match(serialized, /items\.returnQty/);
  assert.match(serialized, /items\.returnAmount/);
  assert.match(serialized, /debtReduction/);
  assert.match(serialized, /accounting_confirmed|posted_to_ar/);
  assert.match(serialized, /_dashboardIsPromo/);
  assert.match(serialized, /duplicateDiscardedAmount/);
});

test('home dashboard separates confirmed, pending and today operational sales', () => {
  const homeQuery = read('src/services/dashboard/HomeDashboardService.js');

  assert.match(homeQuery, /monthlySales'[\s\S]*accountingScope: 'confirmed'/);
  assert.match(homeQuery, /monthlyPendingSales'[\s\S]*accountingScope: 'pending'/);
  assert.match(homeQuery, /todaySales'[\s\S]*accountingScope: 'active'/);
  assert.match(homeQuery, /pendingSalesAmount/);
  assert.match(homeQuery, /promotionValue/);
});

test('dashboard employee KPI table only shows the six requested business metrics', () => {
  const html = read('public/index.html');
  const client = read('public/js/app/00-dashboard.js');
  const salesTableHeader = html.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>\s*<tbody id="dashboardSalesTable"/)?.[1] || '';

  assert.match(salesTableHeader, /Chỉ tiêu tổng/);
  assert.match(salesTableHeader, /Tổng bán ra/);
  assert.match(salesTableHeader, /Tổng trả về/);
  assert.match(salesTableHeader, /Thực đạt/);
  assert.match(salesTableHeader, /Công nợ/);
  assert.match(salesTableHeader, /Doanh số hôm nay/);
  assert.match(html, /colspan="8"/);
  assert.match(html, /phase70-dashboard-sales-staff-kpi-v1/);
  assert.doesNotMatch(salesTableHeader, /Chờ xác nhận/);
  assert.doesNotMatch(salesTableHeader, /Tỷ lệ/);
  assert.doesNotMatch(salesTableHeader, /Khuyến mại/);
  assert.doesNotMatch(salesTableHeader, /Trạng thái/);
  assert.match(client, /row\.totalSalesAmount/);
  assert.match(client, /row\.salesAmount\|\|0\)\+Number\(row\.pendingSalesAmount/);
  assert.doesNotMatch(client, /statusLabel\(row\.status/);
});

test('dashboard cache freshness includes product catalog changes', () => {
  const cacheService = read('src/services/dashboard/DashboardCacheService.js');
  assert.match(cacheService, /models\/Product/);
  assert.match(cacheService, /latestVersionForModel\(Product\)/);
});
