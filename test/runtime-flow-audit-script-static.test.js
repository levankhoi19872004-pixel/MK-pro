'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { collectRuntimeVerification } = require('../scripts/verify-runtime-flows');

const ROOT = path.resolve(__dirname, '..');

test('verify-runtime-flows script writes JSON and Markdown reports', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/verify-runtime-flows.js'), 'utf8');
  assert.match(script, /runtime-flow-verification\.json/);
  assert.match(script, /RUNTIME_FLOW_VERIFICATION_REPORT\.md/);
  assert.match(script, /masterReturnWriteFlowBlocked/);
});

test('verify-runtime-flows static gate passes current canonical/retired route contract', () => {
  const report = collectRuntimeVerification();
  assert.equal(report.ok, true, JSON.stringify(report.criticalIssues, null, 2));
  assert.equal(report.summary.missingBackendRoutes, 0);
  assert.equal(report.summary.unmatchedFetches, 0);
  assert.equal(report.summary.retiredFrontendHits, 0);
  assert.equal(report.summary.retiredMasterReturnWriteFetches, 0);
  assert.equal(report.summary.masterReturnWriteFlowBlocked, 1);
});
