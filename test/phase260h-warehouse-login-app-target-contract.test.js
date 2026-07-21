'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, relativePath));
}

function request(app, method, requestPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const req = http.request({
        hostname: '127.0.0.1',
        port: address.port,
        path: requestPath,
        method
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({ statusCode: res.statusCode, raw })));
      });
      req.on('error', (err) => server.close(() => reject(err)));
      req.end();
    });
  });
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('Phase260H app target contract defines required immutable targets', () => {
  const contract = require('../public/js/app-target-contract');
  const targets = contract.listVisibleTargets();
  const keys = targets.map((target) => target.key);

  assert.deepEqual(keys, ['web', 'sales', 'delivery', 'warehouse']);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(contract.getTargetUrl('warehouse'), '/mobile/warehouse.html');

  for (const target of targets) {
    assert.equal(target.key, contract.getAppTarget(target.key).key);
    assert.ok(target.label.trim(), target.key);
    assert.match(target.url, /^\//, target.key);
    assert.doesNotMatch(target.url, /^\/\//, target.key);
    assert.ok(target.allowedRoles.length > 0, target.key);
    assert.equal(Object.isFrozen(target.allowedRoles), true, target.key);
  }

  assert.equal(Object.isFrozen(contract.APP_TARGETS), true);
  assert.equal(contract.getTargetUrl('https://evil.example'), null);
});

test('Phase260H role target matrix fails closed', () => {
  const contract = require('../public/js/app-target-contract');
  const matrix = {
    admin: { web: true, sales: true, delivery: true, warehouse: true },
    manager: { web: true, sales: false, delivery: false, warehouse: false },
    accountant: { web: true, sales: false, delivery: false, warehouse: false },
    warehouse: { web: true, sales: false, delivery: false, warehouse: true },
    sales: { web: false, sales: true, delivery: false, warehouse: false },
    delivery: { web: false, sales: false, delivery: true, warehouse: false }
  };

  for (const [role, targets] of Object.entries(matrix)) {
    for (const [target, expected] of Object.entries(targets)) {
      assert.equal(contract.canRoleOpenTarget(role, target), expected, `${role} -> ${target}`);
    }
  }

  assert.equal(contract.canRoleOpenTarget('', 'web'), false);
  assert.equal(contract.canRoleOpenTarget('unknown', 'web'), false);
  assert.equal(contract.canRoleOpenTarget('salesman', 'sales'), false);
  assert.equal(contract.canRoleOpenTarget('sale', 'sales'), false);
  assert.equal(contract.canRoleOpenTarget(' warehouse ', 'warehouse'), true);
  assert.equal(contract.canRoleOpenTarget('WAREHOUSE', 'warehouse'), true);
  assert.equal(contract.canRoleOpenTarget('warehouse', ''), false);
  assert.equal(contract.canRoleOpenTarget('warehouse', 'warehouse<script>'), false);
  assert.equal(contract.canRoleOpenTarget('warehouse', 'unknown'), false);
});

test('Phase260H login page loads contract before auth script and renders from one source', () => {
  const login = read('public/login.html');
  const auth = read('public/js/auth-login.js');
  const contract = require('../public/js/app-target-contract');

  assert.ok(login.indexOf('/js/app-target-contract.js') >= 0);
  assert.ok(login.indexOf('/js/app-target-contract.js') < login.indexOf('/js/auth-login.js'));
  assert.match(login, /<select id="targetApp"[^>]*data-default-target="web"[^>]*><\/select>/);
  assert.match(login, /id="loginQuickLinks"/);
  assert.match(login, /App thủ kho/);

  assert.equal(contract.listSelectTargets().length, 4);
  assert.equal(contract.listQuickLinkTargets().length, 4);
  assert.ok(contract.listSelectTargets().some((target) => target.label === 'App thủ kho'));
  assert.ok(contract.listQuickLinkTargets().some((target) => target.shortLabel === 'Thủ kho'));

  assert.match(auth, /window\.AppTargetContract/);
  assert.match(auth, /contract\.canRoleOpenTarget/);
  assert.match(auth, /contract\.getTargetUrl/);
  assert.match(auth, /listSelectTargets\(\)/);
  assert.match(auth, /listQuickLinkTargets\(\)/);
  assert.match(auth, /dataset\.appTargetContractBound/);
  assert.doesNotMatch(auth, /target==='sales'|target === 'sales'|target==='delivery'|target === 'delivery'|target==='warehouse'|target === 'warehouse'/);
  assert.doesNotMatch(auth, /return '\/mobile\/sales\.html'|return '\/mobile\/delivery\.html'|return '\/mobile\/warehouse\.html'/);
});

test('Phase260H mobile login reuses app target contract URLs', () => {
  const mobileLogin = read('public/mobile/login.html');
  const mobileAuth = read('public/mobile/js/auth.js');

  assert.ok(mobileLogin.indexOf('/js/app-target-contract.js') >= 0);
  assert.ok(mobileLogin.indexOf('/js/app-target-contract.js') < mobileLogin.indexOf('./js/auth.js'));
  assert.match(mobileLogin, /warehouse vào App thủ kho/);
  assert.match(mobileAuth, /window\.AppTargetContract/);
  assert.match(mobileAuth, /getTargetUrl\(targetKey\)/);
  assert.doesNotMatch(mobileAuth, /role === 'warehouse'\)\s*return '\.\/warehouse\.html'/);
});

test('Phase260H static warehouse app routes stay reachable', async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const { createApp } = require('../src/app');
    const app = createApp();
    for (const routePath of ['/mobile/warehouse', '/mobile/warehouse.html']) {
      const res = await request(app, 'GET', routePath);
      assert.equal(res.statusCode, 200, routePath);
      assert.match(res.raw, /App thủ kho/, routePath);
    }
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test('Phase260H warehouse backend route keeps mobile role guard', () => {
  const routeSource = read('src/routes/mobile/warehouse.routes.js');
  const contextSource = read('src/mobile/mobileContext.js');

  assert.match(routeSource, /const onlyWarehouse = \[requireMobileLogin, requireMobileRole\(\['warehouse'\]\)\]/);
  assert.match(routeSource, /router\.get\('\/return-checks', \.\.\.onlyWarehouse/);
  assert.match(routeSource, /router\.post\('\/return-checks\/confirm', \.\.\.onlyWarehouse/);
  assert.match(contextSource, /if \(role === 'admin' \|\| allowed\.includes\(role\)\) return next\(\);/);
});

test('Phase260H warehouse mobile role guard allows only existing admin behavior and warehouse', () => {
  const { createMobileContext } = require('../src/mobile/mobileContext');
  const guard = createMobileContext().requireMobileRole(['warehouse']);

  for (const role of ['warehouse', 'admin']) {
    const req = { mobileUser: { role } };
    let nextCalled = false;
    guard(req, mockResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true, role);
  }

  for (const role of ['sales', 'delivery', 'accountant', 'manager', '', 'unknown']) {
    const req = { mobileUser: { role } };
    let nextCalled = false;
    const res = mockResponse();
    guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, role);
    assert.equal(res.statusCode, 403, role);
  }
});
