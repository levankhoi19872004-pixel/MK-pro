'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Phase37 exposes split dashboard APIs and keeps legacy home route', () => {
  const routes = read('src/routes/dashboardRoutes.js');
  assert.match(routes, /router\.get\('\/home'/, 'legacy /api/dashboard/home route must remain');
  assert.match(routes, /router\.get\('\/overview'/, 'overview API must be registered');
  assert.match(routes, /router\.get\('\/sales-staff'/, 'sales-staff lazy API must be registered');
  assert.match(routes, /router\.get\('\/delivery-summary'/, 'delivery-summary lazy API must be registered');
});

test('Phase37 frontend uses overview first and does not call dashboard home directly', () => {
  const frontend = read('public/js/app/00-dashboard.js');
  assert.match(frontend, /\/api\/dashboard\/overview/, 'frontend must fetch overview first');
  assert.match(frontend, /\/api\/dashboard\/sales-staff/, 'frontend must lazy-load sales staff block');
  assert.match(frontend, /\/api\/dashboard\/delivery-summary/, 'frontend must lazy-load delivery block');
  assert.doesNotMatch(frontend, /\/api\/dashboard\/home/, 'new dashboard frontend must not block on legacy home API');
  assert.match(frontend, /dashboardLazyRequestController/, 'lazy-load requests must be abortable/deduped');
});

test('Phase37 overview service avoids full item payload and uses early match/project aggregates', () => {
  const service = read('src/services/dashboard/DashboardOverviewService.js');
  assert.match(service, /function aggregateSalesRoot/, 'overview must use root sales summary instead of staff/item detail pipeline');
  assert.match(service, /\{ \$match: \{ \$and: filters \} \},\n\s+\{\n\s+\$project:/, 'sales overview pipeline must match before project');
  assert.doesNotMatch(service, /items\./, 'overview service must not project or unwind order items');
  assert.doesNotMatch(service, /inventorySnapshots/i, 'overview service must not use inventorySnapshots');
});

test('Phase37 detail APIs are split out of HomeDashboardService', () => {
  const service = read('src/services/dashboard/HomeDashboardService.js');
  assert.match(service, /async function getSalesStaffDashboard/, 'sales staff detail API must exist');
  assert.match(service, /async function getDeliveryDashboard/, 'delivery detail API must exist');
  assert.match(service, /sales-staff:\$\{range\.period\}/, 'sales staff cache key must be separate');
  assert.match(service, /delivery-summary:\$\{range\.period\}/, 'delivery summary cache key must be separate');
});

test('Phase37 controller exposes overview and lazy detail handlers', () => {
  const controller = read('src/controllers/dashboardController.js');
  assert.match(controller, /const overview = asyncHandler/, 'overview controller handler must exist');
  assert.match(controller, /DashboardOverviewService\.getOverview/, 'overview handler must use DashboardOverviewService');
  assert.match(controller, /HomeDashboardService\.getSalesStaffDashboard/, 'sales-staff handler must call split service');
  assert.match(controller, /HomeDashboardService\.getDeliveryDashboard/, 'delivery handler must call split service');
});
