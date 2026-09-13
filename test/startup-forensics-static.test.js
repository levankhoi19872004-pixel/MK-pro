'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('server emits pre-listen BOOT_TRACE around config and app module loading', () => {
  const source = read('server.js');
  const processStart = source.indexOf("bootTrace.emit('process_start'");
  const appLoadStart = source.indexOf("bootTrace.emit('app_module_load_start'");
  const appRequire = source.indexOf("require('./src/app')");
  const appLoaded = source.indexOf("bootTrace.emit('app_module_loaded'");
  const startInvoked = source.indexOf("bootTrace.emit('start_server_invoked'");

  assert.ok(processStart >= 0, 'process_start trace missing');
  assert.ok(appLoadStart >= 0 && appLoadStart < appRequire, 'app module load must be traced before require');
  assert.ok(appLoaded > appRequire, 'app_module_loaded must be emitted after require');
  assert.ok(startInvoked > appLoaded, 'start_server_invoked trace missing');
  assert.match(source, /installPrelistenWatchdog\(/);
  assert.match(source, /prelisten_failure/);
});

test('health routes are mounted before limiter/auth/tenant bootstrap middleware', () => {
  const source = read('src/app.js');
  const health = source.indexOf('registerHealthRoutes(app);');
  const limiter = source.indexOf("app.use('/api', createApiLimiter())");
  const security = source.indexOf('app.use(apiSecurity(requireAuth));');
  const tenant = source.indexOf("app.use('/api', tenantContext);");

  assert.ok(health >= 0, 'early health registration missing');
  assert.ok(health < limiter, 'health must mount before API rate limiter');
  assert.ok(health < security, 'health must mount before auth boundary');
  assert.ok(health < tenant, 'health must mount before tenant middleware');
  assert.equal((source.match(/registerHealthRoutes\(app\);/g) || []).length, 1, 'health routes should be mounted exactly once');
});

test('liveness stays dependency-free and readiness lazy-loads operations service', () => {
  const source = read('src/routes/health.routes.js');
  assert.doesNotMatch(source, /^const operationsService = require\('\.\.\/services\/operationsService'\);/m);
  assert.match(source, /function lightweightLiveness\(\)/);
  assert.match(source, /boot:\s*bootTrace\.publicSnapshot\(\)/);
  assert.match(source, /const operationsService = require\('\.\.\/services\/operationsService'\);/);
  assert.match(source, /startup:\s*\{/);
});

test('startup steps expose start, completion and failure trace stages', () => {
  const source = read('src/app.js');
  for (const marker of [
    'app_module_evaluation_start',
    'app_dependencies_loaded',
    'create_app_start',
    'create_app_complete',
    'http_listen_start',
    'http_listening',
    'startup_step_start',
    'startup_step_complete',
    'startup_step_failed',
    'application_ready',
    'application_bootstrap_failed'
  ]) {
    assert.ok(source.includes(marker), `${marker} trace missing`);
  }
});

test('boot tracer redacts secret-like keys and has a bounded pre-listen watchdog', () => {
  const source = read('src/observability/bootTrace.js');
  assert.match(source, /authorization/);
  assert.match(source, /password/);
  assert.match(source, /secret/);
  assert.match(source, /MAX_EVENTS = 48/);
  assert.match(source, /BOOT_PRELISTEN_WATCHDOG_MS/);
  assert.match(source, /prelisten_watchdog_timeout/);
});
