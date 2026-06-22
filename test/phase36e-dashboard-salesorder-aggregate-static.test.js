'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function indexOfOrFail(source, pattern, message) {
  const index = source.search(pattern);
  assert.notEqual(index, -1, message || `Missing pattern: ${pattern}`);
  return index;
}

test('Phase36E dashboard SalesOrder aggregate has index-friendly date prefilter in the first $match', () => {
  const source = read('src/services/dashboard/SalesDashboardQuery.js');
  assert.match(source, /function dateRangePrefilter\(dateFrom, dateTo, fields = \[\]\)/);
  assert.match(source, /const salesDatePrefilter = dateRangePrefilter\(dateFrom, dateTo, \['orderDate', 'date', 'documentDate'\]\)/);
  assert.match(source, /if \(salesDatePrefilter\?\.\$match\) earlyMatchFilters\.push\(salesDatePrefilter\.\$match\)/);
  assert.match(source, /\{ \$match: \{ \$and: earlyMatchFilters \} \}/);

  const pipelineBlock = source.slice(source.indexOf('function buildActualSalesPipeline'), source.indexOf('// Tên cũ được giữ như alias'));
  const firstMatchIndex = indexOfOrFail(pipelineBlock, /\{ \$match: \{ \$and: earlyMatchFilters \} \}/);
  const businessDateIndex = indexOfOrFail(pipelineBlock, /businessDateStages\(dateFrom, dateTo, \['orderDate', 'date', 'documentDate'\]\)/);
  assert.ok(firstMatchIndex < businessDateIndex, 'date prefilter must be before normalized businessDateStages');
});

test('Phase36E dashboard SalesOrder aggregate projects only required fields before date normalize/group', () => {
  const source = read('src/services/dashboard/SalesDashboardQuery.js');
  assert.match(source, /function salesDashboardProjection\(\) \{/);
  assert.match(source, /'items\.productCode': 1/);
  assert.match(source, /'items\.lineAmountAtOrder': 1/);
  assert.match(source, /'items\.productSnapshot\.salePrice': 1/);
  assert.doesNotMatch(source, /items: 1/);

  const pipelineBlock = source.slice(source.indexOf('function buildActualSalesPipeline'), source.indexOf('// Tên cũ được giữ như alias'));
  const projectIndex = indexOfOrFail(pipelineBlock, /\{ \$project: salesDashboardProjection\(\) \}/);
  const groupIndex = indexOfOrFail(pipelineBlock, /salesDocumentAggregationStages\(\)/);
  assert.ok(projectIndex < groupIndex, '$project must happen before grouping/facet');
});

test('Phase36E dashboard product lookup projects only price fields instead of hydrating full product docs', () => {
  const source = read('src/services/dashboard/SalesDashboardQuery.js');
  assert.ok(source.includes("let: { productCode: '$_dashboardProductCode' }"));
  assert.match(source, /\$project: \{ code: 1, salePrice: 1, price: 1, sellPrice: 1, giaBan: 1 \}/);
  assert.doesNotMatch(source, /localField: '_dashboardProductCode'/);
});

test('Phase36E route slash still renders shell only and dashboard fetch is client side', () => {
  const routeSource = read('src/routes/static.routes.js');
  const dashboardSource = read('public/js/app/00-dashboard.js');
  assert.match(routeSource, /renderIndexPage\(\)/);
  assert.doesNotMatch(routeSource, /getHomeDashboard|dashboard\/home|SalesOrder\.aggregate/);
  assert.match(dashboardSource, /fetch\(`\/api\/dashboard\/home\?\$\{params\.toString\(\)\}`/);
});

test('Phase36E dashboard cache remains summary-only and does not reference inventory snapshots', () => {
  const homeSource = read('src/services/dashboard/HomeDashboardService.js');
  const salesSource = read('src/services/dashboard/SalesDashboardQuery.js');
  const combined = `${homeSource}\n${salesSource}`;
  assert.match(homeSource, /DashboardCacheService\.read\(cacheKey, cacheVersion\)/);
  assert.match(homeSource, /DashboardCacheService\.write\(cacheKey, cacheVersion, result\)/);
  assert.doesNotMatch(combined, /inventorySnapshots/);
});
