'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { REQUIRED_RUNTIME_FLOWS } = require('../scripts/verify-runtime-flows');

const ROOT = path.resolve(__dirname, '..');
const plan = fs.readFileSync(path.join(ROOT, 'docs/RUNTIME_FLOW_VERIFICATION_PLAN.md'), 'utf8');

test('Phase221 runtime flow verification plan exists and covers all required canonical flows', () => {
  assert.match(plan, /RUNTIME_FLOW_VERIFICATION_PLAN/);
  assert.equal(REQUIRED_RUNTIME_FLOWS.length, 29, 'Phase221 plan should cover the 29 canonical flows from Phase220');
  REQUIRED_RUNTIME_FLOWS.forEach((flowId) => {
    assert.match(plan, new RegExp(`## ${flowId.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`), `${flowId} must have a runtime verification section`);
  });
});

test('each runtime flow plan section asks for network and log evidence', () => {
  assert.match(plan, /Network evidence cần chụp/);
  assert.match(plan, /Log evidence cần chụp/);
  assert.match(plan, /FLOW_VERIFY_MODE=1/);
  assert.match(plan, /Không chấp nhận endpoint retired\/orphan/);
});
