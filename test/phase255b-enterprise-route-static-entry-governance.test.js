'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..');
const ENTERPRISE_FILES = Object.freeze({
  route: 'src/routes/enterpriseRoutes.js',
  controller: 'src/controllers/enterpriseController.js',
  service: 'src/services/EnterpriseStatusService.js'
});
const ENTERPRISE_PATHS = Object.freeze(['/enterprise.html', '/css/enterprise.css', '/js/enterprise-app.js']);

function absolute(relativePath) { return path.join(ROOT, relativePath); }
function resolved(relativePath) { return require.resolve(absolute(relativePath)); }
function isCached(relativePath) { return Boolean(require.cache[resolved(relativePath)]); }
function clear(relativePath) { delete require.cache[resolved(relativePath)]; }
function clearEnterpriseCache() {
  for (const file of Object.values(ENTERPRISE_FILES)) clear(file);
  for (const file of ['src/routes/index.js', 'src/routes/enterpriseFeatureRegistry.js', 'src/config/featureFlags.js']) clear(file);
}
function createMountRecorder() {
  return {
    mounts: [],
    use(prefix, ...handlers) { this.mounts.push({ prefix: typeof prefix === 'string' ? prefix : null, handlers }); },
    get(routePath, ...handlers) { this.mounts.push({ prefix: routePath, method: 'GET', handlers }); }
  };
}
function mountFor(app, prefix) { return app.mounts.find((mount) => mount.prefix === prefix); }
function createJsonRes() {
  return { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function routerRoleMatrix(router) {
  return router.stack.filter((layer) => layer.route).map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
    middlewareNames: layer.route.stack.map((item) => item.handle.name)
  }));
}
function request(port, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: requestPath, method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
async function withServer(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fn(server.address().port); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
function sourceFiles(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, output); else output.push(full);
  }
  return output;
}
function sourceHash() {
  const hash = crypto.createHash('sha256');
  for (const file of sourceFiles(ROOT).sort()) {
    hash.update(path.relative(ROOT, file).replace(/\\/g, '/')); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

test('Enterprise defaults off and boolean parsing is explicit allowlist only', () => {
  const cases = new Map([[undefined, false], ['', false], ['false', false], ['0', false], ['off', false], ['disabled', false], ['random', false], ['true', true], ['1', true], ['yes', true], ['on', true], ['enabled', true]]);
  for (const [value, expected] of cases) {
    if (value === undefined) delete process.env.ENABLE_ENTERPRISE_CORE; else process.env.ENABLE_ENTERPRISE_CORE = value;
    clear('src/config/featureFlags.js');
    const { FLAGS } = require('../src/config/featureFlags');
    assert.equal(FLAGS.enterpriseCore(), expected, `ENABLE_ENTERPRISE_CORE=${String(value)}`);
  }
});

test('disabled Enterprise registration keeps route/controller/service out of require.cache and mounts lightweight 404 boundary', () => {
  clearEnterpriseCache();
  const app = createMountRecorder();
  const { registerEnterpriseApiRoute } = require('../src/routes/enterpriseFeatureRegistry');
  const evidence = registerEnterpriseApiRoute({ app, featureSnapshot: { enterpriseCore: false } });
  assert.equal(evidence.loaded, false); assert.equal(evidence.mounted, false); assert.equal(evidence.disabledBoundaryMounted, true);
  for (const file of Object.values(ENTERPRISE_FILES)) assert.equal(isCached(file), false, file);
  const mount = mountFor(app, '/api/enterprise');
  assert.ok(mount); assert.equal(Boolean(mount.handlers[0].stack), false);
  const res = createJsonRes(); mount.handlers[0]({}, res);
  assert.equal(res.statusCode, 404); assert.equal(res.body.code, 'FEATURE_DISABLED'); assert.equal(res.body.ok, false); assert.equal(res.body.success, false);
});

test('disabled Enterprise API preserves anonymous 401 and authenticated 404 FEATURE_DISABLED', async () => {
  process.env.JWT_SECRET = 'phase255b-test-secret-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'phase255b-refresh-secret-at-least-32-chars';
  process.env.NODE_ENV = 'test';
  const { apiSecurity } = require('../src/middlewares/apiSecurity.middleware');
  const { requireAuth } = require('../src/middlewares/auth.middleware');
  const { registerEnterpriseApiRoute } = require('../src/routes/enterpriseFeatureRegistry');
  const app = express(); app.use(express.json()); app.use(apiSecurity(requireAuth));
  registerEnterpriseApiRoute({ app, featureSnapshot: { enterpriseCore: false } });
  await withServer(app, async (port) => {
    const anonymous = await request(port, '/api/enterprise/status');
    assert.equal(anonymous.statusCode, 401);
    const token = jwt.sign({ id: 'u1', role: 'admin', tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const authenticated = await request(port, '/api/enterprise/status', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(authenticated.statusCode, 404); assert.equal(JSON.parse(authenticated.body).code, 'FEATURE_DISABLED');
  });
});

test('enabled Enterprise loads once, mounts real router, preserves role middleware and fails closed on loader error', () => {
  clearEnterpriseCache();
  const { registerEnterpriseApiRoute } = require('../src/routes/enterpriseFeatureRegistry');
  const app = createMountRecorder();
  const evidence = registerEnterpriseApiRoute({ app, featureSnapshot: { enterpriseCore: true } });
  assert.equal(evidence.loaded, true); assert.equal(evidence.mounted, true); assert.equal(evidence.disabledBoundaryMounted, false);
  for (const file of Object.values(ENTERPRISE_FILES)) assert.equal(isCached(file), true, file);
  const mount = mountFor(app, '/api/enterprise'); assert.ok(mount.handlers[0].stack);
  const matrix = routerRoleMatrix(mount.handlers[0]);
  assert.deepEqual(matrix.map((row) => row.path), ['/status', '/readiness', '/outbox/drain', '/integrations/drain']);
  for (const row of matrix) assert.ok(row.middlewareNames.includes('requireRoleMiddleware'));

  const failingApp = createMountRecorder();
  assert.throws(() => registerEnterpriseApiRoute({
    app: failingApp, featureSnapshot: { enterpriseCore: true },
    route: { id: 'enterpriseCore', prefix: '/api/enterprise', featureName: 'Enterprise', modulePath: './boom', enabled: () => true, loadRouter: () => { throw new Error('boom'); } }
  }), /Enterprise route bootstrap failed/);
  assert.equal(failingApp.mounts.length, 0);
});

test('Enterprise static paths are blocked with no-store when disabled and served when enabled', async () => {
  const { registerStaticRoutes } = require('../src/routes/static.routes');
  for (const enabled of [false, true]) {
    const app = express(); registerStaticRoutes(app, { featureSnapshot: { enterpriseCore: enabled } }); app.use(express.static(absolute('public')));
    await withServer(app, async (port) => {
      for (const routePath of ENTERPRISE_PATHS) {
        const result = await request(port, routePath);
        assert.equal(result.statusCode, enabled ? 200 : 404, `${routePath} enabled=${enabled}`);
        if (!enabled) { assert.match(String(result.headers['cache-control']), /no-store/); assert.equal(result.body.includes('Enterprise Control Center'), false); }
      }
      if (enabled) {
        const html = await request(port, '/enterprise.html');
        assert.match(html.body, /css\/enterprise\.css/); assert.match(html.body, /js\/enterprise-app\.js/); assert.match(html.body, /auth-guard\.js/);
      }
    });
  }
});

test('server-rendered index hides Enterprise links when disabled, preserves baseline count when enabled, and cache is feature-keyed', async () => {
  const previousNodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  const { renderIndexPage, clearIndexPageCache, ENTERPRISE_START, ENTERPRISE_END } = require('../src/services/web/indexPageRenderer');
  clearIndexPageCache();
  try {
    const disabled = await renderIndexPage({ featureSnapshot: { enterpriseCore: false } });
    const enabled = await renderIndexPage({ featureSnapshot: { enterpriseCore: true } });
    assert.equal((disabled.match(/href=["']\/enterprise\.html["']/g) || []).length, 0);
    assert.equal(disabled.includes(ENTERPRISE_START), false); assert.equal(disabled.includes(ENTERPRISE_END), false);
    assert.equal((enabled.match(/href=["']\/enterprise\.html["']/g) || []).length, 2);
    assert.equal(enabled.includes(ENTERPRISE_START), false); assert.equal(enabled.includes(ENTERPRISE_END), false);
    assert.notEqual(disabled, enabled);
  } finally { clearIndexPageCache(); if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv; }
});

test('API, static and index use the same injected immutable snapshot even if env changes later', async () => {
  const snapshot = Object.freeze({ enterpriseCore: false });
  process.env.ENABLE_ENTERPRISE_CORE = 'false';
  clearEnterpriseCache();
  const apiApp = createMountRecorder(); const { registerEnterpriseApiRoute } = require('../src/routes/enterpriseFeatureRegistry');
  const apiEvidence = registerEnterpriseApiRoute({ app: apiApp, featureSnapshot: snapshot });
  process.env.ENABLE_ENTERPRISE_CORE = 'true';
  const staticApp = createMountRecorder(); const { registerStaticRoutes } = require('../src/routes/static.routes');
  const staticEvidence = registerStaticRoutes(staticApp, { featureSnapshot: snapshot }).enterpriseStaticEvidence;
  const { renderIndexPage, clearIndexPageCache } = require('../src/services/web/indexPageRenderer'); clearIndexPageCache();
  const html = await renderIndexPage({ featureSnapshot: snapshot });
  assert.equal(apiEvidence.disabledBoundaryMounted, true); assert.equal(staticEvidence.blockedPaths.length, 3); assert.equal(html.includes('/enterprise.html'), false);
});

test('Phase255B handlers and audit operations are non-mutating', async () => {
  const before = sourceHash();
  const { runAudit } = require('../scripts/audit-enterprise-runtime-surface');
  await runAudit({ enabled: false }); await runAudit({ enabled: true });
  const after = sourceHash(); assert.equal(after, before);
});
