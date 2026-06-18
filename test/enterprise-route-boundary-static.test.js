'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('enterprise modules are mounted behind feature and role boundaries', () => {
  const root = path.resolve(__dirname, '..');
  const routes = fs.readFileSync(path.join(root, 'src/routes/index.js'), 'utf8');
  for (const mount of [
    '/api/purchase',
    '/api/warehouse-advanced',
    '/api/analytics',
    '/api/field-operations',
    '/api/delivery-planning',
    '/api/integrations',
    '/api/platform'
  ]) assert.match(routes, new RegExp(mount.replaceAll('/', '\\/')));

  for (const file of [
    'purchaseRoutes.js',
    'warehouseAdvancedRoutes.js',
    'analyticsRoutes.js',
    'fieldOperationRoutes.js',
    'deliveryPlanningRoutes.js',
    'integrationRoutes.js',
    'platformRoutes.js'
  ]) {
    const source = fs.readFileSync(path.join(root, 'src/routes', file), 'utf8');
    assert.match(source, /requireFeature|requireRole/);
  }
});
