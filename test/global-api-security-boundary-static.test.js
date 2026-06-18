'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('global API security boundary is mounted before API routes', () => {
  const app = read('src/app.js');

  assert.match(app, /apiSecurity/);
  assert.match(app, /requireAuth/);

  const securityIndex = app.indexOf('app.use(apiSecurity(requireAuth))');
  const routesIndex = app.indexOf('registerApiRoutes(app)');

  assert.ok(securityIndex > 0, 'apiSecurity must be mounted');
  assert.ok(routesIndex > 0, 'registerApiRoutes must exist');
  assert.ok(securityIndex < routesIndex, 'apiSecurity must be mounted before registerApiRoutes');
});

test('api security has narrow public allowlist', () => {
  const src = read('src/middlewares/apiSecurity.middleware.js');

  assert.match(src, /GLOBAL_API_SECURITY_BOUNDARY_START/);
  assert.ok(src.includes('/^\\/api\\/auth\\/login$/'));
  assert.ok(src.includes('/^\\/api\\/auth\\/refresh$/'));
  assert.ok(src.includes('/^\\/api\\/system\\/status$/'));

  assert.ok(!src.includes("['GET', /^\\/api\\/.*"), 'GET /api/* must not be broadly public');
  assert.ok(!src.includes("['POST', /^\\/api\\/.*"), 'POST /api/* must not be broadly public');
});

test('high-risk routes have explicit RBAC after global auth', () => {
  const systemRoutes = read('src/routes/systemRoutes.js');
  const userRoutes = read('src/routes/userRoutes.js');
  const masterOrderRoutes = read('src/routes/masterOrderRoutes.js');
  const fundRoutes = read('src/routes/fundRoutes.js');

  assert.match(systemRoutes, /requireRole\(\['admin', 'manager'\]\).*systemController\.apiMonitor/);
  assert.match(systemRoutes, /requireRole\(\['admin'\]\).*systemController\.reset/);
  assert.match(userRoutes, /router\.post\('\/users', requireRole\(\['admin'\]\)/);
  assert.match(userRoutes, /router\.delete\('\/users\/:id', requireRole\(\['admin'\]\)/);
  assert.match(masterOrderRoutes, /confirm-accounting', requireRole\(\['admin', 'accountant'\]\)/);
  assert.match(masterOrderRoutes, /admin-unlock', requireRole\(\['admin'\]\)/);
  assert.match(fundRoutes, /router\.post\('\/expenses', requireRole\(\['admin', 'accountant'\]\)/);
  assert.match(fundRoutes, /router\.post\('\/transfers', requireRole\(\['admin', 'accountant'\]\)/);
});
