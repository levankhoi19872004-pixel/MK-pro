'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');

const OPTIONAL = Object.freeze([
  {
    id: 'purchasing',
    envName: 'ENABLE_PURCHASING',
    prefix: '/api/purchase',
    routeFile: 'src/routes/purchaseRoutes.js',
    controllerFile: 'src/controllers/purchaseController.js'
  },
  {
    id: 'warehouseAdvanced',
    envName: 'ENABLE_WAREHOUSE_ADVANCED',
    prefix: '/api/warehouse-advanced',
    routeFile: 'src/routes/warehouseAdvancedRoutes.js',
    controllerFile: 'src/controllers/warehouseController.js'
  },
  {
    id: 'analyticsProjections',
    envName: 'ENABLE_ANALYTICS_PROJECTIONS',
    prefix: '/api/analytics',
    routeFile: 'src/routes/analyticsRoutes.js',
    controllerFile: 'src/controllers/analyticsController.js'
  },
  {
    id: 'fieldOperations',
    envName: 'ENABLE_FIELD_OPERATIONS',
    prefix: '/api/field-operations',
    routeFile: 'src/routes/fieldOperationRoutes.js',
    controllerFile: 'src/controllers/fieldOperationController.js'
  },
  {
    id: 'deliveryPlanning',
    envName: 'ENABLE_DELIVERY_PLANNING',
    prefix: '/api/delivery-planning',
    routeFile: 'src/routes/deliveryPlanningRoutes.js',
    controllerFile: 'src/controllers/deliveryPlanningController.js'
  },
  {
    id: 'integrations',
    envName: 'ENABLE_INTEGRATIONS',
    prefix: '/api/integrations',
    routeFile: 'src/routes/integrationRoutes.js',
    controllerFile: 'src/controllers/integrationController.js'
  },
  {
    id: 'multiTenant',
    envName: 'TENANT_MODE',
    prefix: '/api/platform',
    routeFile: 'src/routes/platformRoutes.js',
    controllerFile: 'src/controllers/platformController.js'
  }
]);

const BOOLEAN_ENV_NAMES = OPTIONAL
  .filter((route) => route.envName !== 'TENANT_MODE')
  .map((route) => route.envName);

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function cacheKey(relativePath) {
  return require.resolve(absolute(relativePath));
}

function clearProjectModule(relativePath) {
  delete require.cache[cacheKey(relativePath)];
}

function clearOptionalCache() {
  for (const route of OPTIONAL) {
    clearProjectModule(route.routeFile);
    clearProjectModule(route.controllerFile);
  }
  clearProjectModule('src/routes/index.js');
  clearProjectModule('src/routes/optionalRouteRegistry.js');
}

function isCached(relativePath) {
  return Boolean(require.cache[cacheKey(relativePath)]);
}

function setDisabledEnv() {
  for (const name of BOOLEAN_ENV_NAMES) process.env[name] = 'false';
  process.env.TENANT_MODE = 'single';
  process.env.NODE_ENV = 'test';
}

function setOnlyEnabledEnv(enabledId) {
  setDisabledEnv();
  const route = OPTIONAL.find((entry) => entry.id === enabledId);
  if (route.envName === 'TENANT_MODE') {
    process.env.TENANT_MODE = 'multi';
  } else {
    process.env[route.envName] = 'true';
  }
}

function featureSnapshot(enabledIds = []) {
  const enabled = new Set(enabledIds);
  return Object.fromEntries(OPTIONAL.map((route) => [route.id, enabled.has(route.id)]));
}

function createMountRecorder() {
  return {
    mounts: [],
    use(prefix, ...handlers) {
      if (typeof prefix === 'string') {
        this.mounts.push({ prefix, handlers });
      } else {
        this.mounts.push({ prefix: null, handlers: [prefix, ...handlers] });
      }
    }
  };
}

function mountFor(app, prefix) {
  return app.mounts.find((mount) => mount.prefix === prefix);
}

function createJsonRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function routerHasNamedMiddleware(router, name) {
  return router.stack.some((layer) => {
    if (layer.handle?.name === name) return true;
    return Array.isArray(layer.route?.stack)
      && layer.route.stack.some((routeLayer) => routeLayer.handle?.name === name);
  });
}

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(fullPath, out);
    else out.push(fullPath);
  }
  return out;
}

function sourceHash() {
  const hash = crypto.createHash('sha256');
  for (const file of sourceFiles(root).sort()) {
    hash.update(path.relative(root, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

test('all optional features disabled do not require route/controller modules and mount lightweight 404 handlers', () => {
  setDisabledEnv();
  clearOptionalCache();

  const { registerApiRoutes } = require('../src/routes');
  for (const route of OPTIONAL) {
    assert.equal(isCached(route.routeFile), false, `${route.routeFile} must not load at top-level`);
    assert.equal(isCached(route.controllerFile), false, `${route.controllerFile} must not load at top-level`);
  }

  const app = createMountRecorder();
  let evidence;
  registerApiRoutes(app, { onOptionalRouteEvidence: (payload) => { evidence = payload; } });

  assert.deepEqual(evidence.enabled, []);
  assert.deepEqual(evidence.disabled, OPTIONAL.map((route) => route.id));
  assert.deepEqual(evidence.mounted, []);
  assert.deepEqual(evidence.loadedRouteModules, []);

  for (const route of OPTIONAL) {
    assert.equal(isCached(route.routeFile), false, `${route.routeFile} must remain out of require.cache`);
    assert.equal(isCached(route.controllerFile), false, `${route.controllerFile} must remain out of require.cache`);

    const mount = mountFor(app, route.prefix);
    assert.ok(mount, `${route.prefix} must keep a safe prefix contract`);
    const handler = mount.handlers[0];
    assert.equal(typeof handler, 'function');
    assert.equal(Boolean(handler.stack), false, `${route.prefix} must not mount the business router`);

    const res = createJsonRes();
    handler({}, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'FEATURE_DISABLED');
  }
});

test('each feature enabled alone loads only its matching real router with feature and role guards intact', () => {
  const { registerOptionalApiRoutes } = require('../src/routes/optionalRouteRegistry');

  for (const enabledRoute of OPTIONAL) {
    setOnlyEnabledEnv(enabledRoute.id);
    clearOptionalCache();

    const app = createMountRecorder();
    const evidence = registerOptionalApiRoutes({
      app,
      featureSnapshot: featureSnapshot([enabledRoute.id])
    });

    assert.deepEqual(evidence.enabled, [enabledRoute.id]);
    assert.deepEqual(evidence.mounted, [enabledRoute.id]);

    for (const route of OPTIONAL) {
      assert.equal(
        isCached(route.routeFile),
        route.id === enabledRoute.id,
        `${route.routeFile} cache state must match ${enabledRoute.id}`
      );
      assert.equal(
        isCached(route.controllerFile),
        route.id === enabledRoute.id,
        `${route.controllerFile} cache state must match ${enabledRoute.id}`
      );
    }

    const enabledMount = mountFor(app, enabledRoute.prefix);
    const router = enabledMount.handlers[0];
    assert.ok(router.stack, `${enabledRoute.prefix} must mount the real Express router`);
    assert.equal(routerHasNamedMiddleware(router, 'featureFlagGuard'), true);
    assert.equal(routerHasNamedMiddleware(router, 'requireRoleMiddleware'), true);

    for (const route of OPTIONAL.filter((entry) => entry.id !== enabledRoute.id)) {
      const mount = mountFor(app, route.prefix);
      assert.equal(Boolean(mount.handlers[0].stack), false, `${route.prefix} must remain a disabled stub`);
    }
  }
});

test('multiple enabled features mount in deterministic registry order and each route module is listed once', () => {
  setDisabledEnv();
  process.env.ENABLE_PURCHASING = 'true';
  process.env.ENABLE_INTEGRATIONS = 'true';
  process.env.TENANT_MODE = 'multi';
  clearOptionalCache();

  const { registerOptionalApiRoutes } = require('../src/routes/optionalRouteRegistry');
  const enabledIds = ['purchasing', 'integrations', 'multiTenant'];
  const app = createMountRecorder();
  const evidence = registerOptionalApiRoutes({
    app,
    featureSnapshot: featureSnapshot(enabledIds)
  });

  assert.deepEqual(evidence.enabled, enabledIds);
  assert.deepEqual(evidence.mounted, enabledIds);
  assert.deepEqual(evidence.loadedRouteModules, ['./purchaseRoutes', './integrationRoutes', './platformRoutes']);
  assert.equal(new Set(evidence.loadedRouteModules).size, evidence.loadedRouteModules.length);
});

test('multi-tenant route is enabled only when TENANT_MODE is exactly multi after trim/lowercase', () => {
  const { snapshot } = require('../src/config/featureFlags');
  const previous = process.env.TENANT_MODE;

  try {
    for (const [value, expected] of [
      ['single', false],
      ['', false],
      ['multi', true],
      [' MULTI ', true],
      ['random', false]
    ]) {
      process.env.TENANT_MODE = value;
      assert.equal(snapshot().multiTenant, expected, `TENANT_MODE=${JSON.stringify(value)}`);
    }
  } finally {
    if (previous === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = previous;
  }
});

test('boolean feature flags are enabled only by explicit truthy values', () => {
  const { readBoolean } = require('../src/config/featureFlags');
  const previous = process.env.ENABLE_PURCHASING;

  try {
    for (const value of ['1', 'true', 'yes', 'on', 'enabled']) {
      process.env.ENABLE_PURCHASING = value;
      assert.equal(readBoolean('ENABLE_PURCHASING', false), true, value);
    }

    for (const value of ['false', '0', 'off', 'random']) {
      process.env.ENABLE_PURCHASING = value;
      assert.equal(readBoolean('ENABLE_PURCHASING', false), false, value);
    }
  } finally {
    if (previous === undefined) delete process.env.ENABLE_PURCHASING;
    else process.env.ENABLE_PURCHASING = previous;
  }
});

test('core route mount inventory remains present and in relative order', () => {
  setDisabledEnv();
  clearOptionalCache();
  const { registerApiRoutes } = require('../src/routes');
  const app = createMountRecorder();
  registerApiRoutes(app);

  const prefixes = app.mounts.map((mount) => mount.prefix).filter(Boolean);
  const corePrefixes = [
    '/api/auth',
    '/api/notifications',
    '/api/search',
    '/api/catalog',
    '/api/delivery',
    '/api/inventory',
    '/api/products',
    '/api/sales-orders',
    '/api/return-orders',
    '/api/receipts',
    '/api/funds',
    '/api/promotions',
    '/api/import',
    '/api/export',
    '/api/dashboard'
  ];

  let previousIndex = -1;
  for (const prefix of corePrefixes) {
    const index = prefixes.indexOf(prefix);
    assert.ok(index >= 0, `${prefix} must remain mounted`);
    assert.ok(index > previousIndex, `${prefix} must keep relative order`);
    previousIndex = index;
  }

  for (const alias of ['/api/orders', '/api/returns', '/api/mobile-legacy', '/api/delivery-today']) {
    assert.ok(prefixes.includes(alias), `${alias} alias/retired guard must remain mounted`);
  }
});

test('enabled module load failure aborts registration without fake mounted state', () => {
  const { registerOptionalApiRoutes } = require('../src/routes/optionalRouteRegistry');
  const app = createMountRecorder();
  let evidence;

  assert.throws(() => registerOptionalApiRoutes({
    app,
    featureSnapshot: { broken: true },
    onEvidence: (payload) => { evidence = payload; },
    routes: [{
      id: 'broken',
      prefix: '/api/broken',
      enabled: (flags) => flags.broken === true,
      loadRouter: () => {
        const error = new Error('boom');
        error.code = 'TEST_LOAD_FAILURE';
        throw error;
      },
      modulePath: './brokenRoutes',
      featureName: 'broken'
    }]
  }), /Optional route bootstrap failed/);

  assert.deepEqual(app.mounts, []);
  assert.deepEqual(evidence.mounted, []);
  assert.equal(evidence.failed.code, 'TEST_LOAD_FAILURE');
});

test('disabled prefix handler matches requireFeature response contract', () => {
  const {
    createFeatureDisabledHandler,
    requireFeature
  } = require('../src/middlewares/featureFlag.middleware');

  const lightweightRes = createJsonRes();
  createFeatureDisabledHandler('mua hàng')({}, lightweightRes);

  const guardRes = createJsonRes();
  requireFeature(() => false, 'mua hàng')({}, guardRes, () => {
    throw new Error('disabled feature must not call next');
  });

  assert.deepEqual(lightweightRes.body, guardRes.body);
  assert.equal(lightweightRes.statusCode, guardRes.statusCode);
  assert.equal(lightweightRes.statusCode, 404);
  assert.equal(lightweightRes.body.code, 'FEATURE_DISABLED');
});

test('optional route audit is non-mutating for source files', () => {
  const before = sourceHash();
  const { runAudit } = require('../scripts/audit-optional-route-module-load');
  clearOptionalCache();
  const audit = runAudit();
  const after = sourceHash();

  assert.equal(before, after);
  assert.equal(audit.optionalRouteModulesLoaded.length, 0);
  assert.equal(audit.optionalControllerModulesLoaded.length, 0);
});
