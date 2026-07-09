'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase221 runtime flow telemetry is FLOW_VERIFY_MODE gated and mounted after auth boundary', () => {
  const middleware = read('src/middlewares/runtimeFlowTelemetry.js');
  const app = read('src/app.js');
  assert.match(middleware, /process\.env\.FLOW_VERIFY_MODE\s*===\s*['"]1['"]/, 'runtime telemetry must be disabled unless FLOW_VERIFY_MODE=1');
  assert.match(app, /createRuntimeFlowTelemetry\(\{ logger \}\)/, 'app must mount runtime flow telemetry middleware');
  assert.match(app, /app\.use\('\/api', tenantContext\);[\s\S]*app\.use\('\/api', createRuntimeFlowTelemetry\(\{ logger \}\)\);/, 'runtime telemetry should run after auth/security tenant boundary so role is available');
});

test('runtime flow telemetry does not log sensitive request body/header/token data', () => {
  const middleware = read('src/middlewares/runtimeFlowTelemetry.js');
  assert.doesNotMatch(middleware, /req\.body/);
  assert.doesNotMatch(middleware, /authorization/i);
  assert.doesNotMatch(middleware, /password/i);
  assert.doesNotMatch(middleware, /token/i);
  assert.match(middleware, /split\('\?'\)\[0\]/, 'query string should be stripped from logged path');
});

test('runtime flow classifier marks canonical, compatibility, retired and unknown flows', () => {
  const { classifyRuntimeFlow } = require('../src/middlewares/runtimeFlowTelemetry');
  assert.equal(classifyRuntimeFlow('POST', '/api/new/delivery-today/closeout').classification, 'canonical');
  assert.equal(classifyRuntimeFlow('GET', '/api/orders').classification, 'compatibility');
  assert.equal(classifyRuntimeFlow('POST', '/api/master-return-orders').classification, 'retired');
  assert.equal(classifyRuntimeFlow('GET', '/api/not-real-phase221').classification, 'unknown');
});
