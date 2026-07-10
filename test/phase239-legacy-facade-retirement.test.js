'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('phase239 registry marks master-order print legacy implementation as runtime-retired', () => {
  const registry = require('../config/legacy-runtime-candidates');
  const candidate = registry['src/services/master-order/masterOrderPrintLegacy.impl.js'];
  assert.equal(candidate.status, 'remove_runtime_load');
  assert.equal(candidate.runtimeAllowed, false);
  assert.equal(candidate.canonicalReplacement, 'src/services/master-order/masterOrderPrint.service.js');
});

test('masterOrderLegacy facade delegates aggregate print to canonical print facade', () => {
  const source = read('src/services/master-order/masterOrderLegacy.service.js');
  assert.match(source, /require\('\.\/masterOrderPrint\.service'\)/);
  assert.match(source, /buildAggregateMasterPrintDocument:\s*print\.buildAggregateMasterPrintDocument/);
  assert.doesNotMatch(source, /require\('\.\/masterOrderPrintLegacy\.impl'\)/);
});

test('legacy runtime audit passes and retired print implementation has no runtime consumers', () => {
  const { audit } = require('../scripts/audit-legacy-runtime-dependencies');
  const result = audit();
  assert.equal(result.ok, true, JSON.stringify(result.violations, null, 2));
  const candidate = result.results.find((item) => item.candidate === 'src/services/master-order/masterOrderPrintLegacy.impl.js');
  assert.ok(candidate);
  assert.equal(candidate.runtimeReferenceCount, 0);
  assert.equal(candidate.references.every((ref) => ['test', 'config', 'documentation', 'audit_migration'].includes(ref.type)), true);
});

test('phase239 startup module benchmark does not load retired print implementation', () => {
  const { run } = require('../scripts/benchmark-phase239-startup-modules');
  const result = run();
  const facadeMeasurement = result.measurements.find((item) => item.label === 'master-order facade require');
  assert.ok(facadeMeasurement);
  assert.equal(facadeMeasurement.retiredRuntimeLoaded, false);
});
