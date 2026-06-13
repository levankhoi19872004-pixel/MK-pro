'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const { requireAuth } = require('../src/middlewares/auth.middleware');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('delivery routes use shared cookie-aware requireAuth instead of Bearer-only legacy middleware', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/deliveryRoutes.js'), 'utf8');

  assert.match(source, /const \{ requireAuth, requireRole \} = require\('\.\.\/middlewares\/auth\.middleware'\);/);
  assert.match(source, /router\.get\('\/orders', requireAuth, deliveryReadRoles/);
  assert.match(source, /router\.post\('\/confirm', requireAuth, deliveryWriteRoles/);
  assert.doesNotMatch(source, /require\('jsonwebtoken'\)/);
  assert.doesNotMatch(source, /function requireLogin\s*\(/);
  assert.doesNotMatch(source, /headers\.authorization/);
});

test('every canonical delivery endpoint mounts shared requireAuth as its first route middleware', () => {
  const router = require('../src/routes/deliveryRoutes');
  const routes = router.stack.filter((layer) => layer.route);
  const expectedPaths = ['/orders', '/returns', '/return', '/payment', '/confirm', '/reconciliation'];

  for (const routePath of expectedPaths) {
    const layer = routes.find((entry) => entry.route.path === routePath);
    assert.ok(layer, `Missing delivery route ${routePath}`);
    assert.equal(layer.route.stack[0].handle, requireAuth, `${routePath} must use shared requireAuth first`);
  }
});

test('shared delivery authentication accepts HttpOnly access-token cookie without Authorization header', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'delivery-cookie-regression-secret-at-least-32-characters';

  try {
    const token = jwt.sign({
      sub: 'admin-test',
      role: 'admin',
      tokenType: 'access'
    }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const req = {
      headers: {
        cookie: `mk_access_token=${encodeURIComponent(token)}`
      }
    };
    const res = mockResponse();
    let nextCalled = false;

    requireAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.authSource, 'cookie');
    assert.equal(req.user.role, 'admin');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
