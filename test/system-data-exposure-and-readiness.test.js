'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('full database snapshot endpoint is admin-only and disabled by default', () => {
  const routes = read('src/routes/systemRoutes.js');
  const controller = read('src/controllers/systemController.js');
  assert.match(routes, /get\('\/data', requireRole\(\['admin'\]\)/);
  assert.match(controller, /ALLOW_SYSTEM_DATA_EXPORT !== 'true'/);
  assert.match(controller, /API xuất toàn bộ dữ liệu hệ thống đang bị khóa/);
});

test('database readiness endpoints return 503 when MongoDB is unavailable', () => {
  const healthRoutes = read('src/routes/health.routes.js');
  const controller = read('src/controllers/systemController.js');
  assert.match(healthRoutes, /res\.status\(ok \? 200 : 503\)/);
  assert.match(controller, /res\.status\(health\.ok \? 200 : 503\)/);
});
