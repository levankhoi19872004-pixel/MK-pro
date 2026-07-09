'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildAudit } = require('../scripts/audit-flow-usage');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }

test('flow usage audit script exists, produces JSON report and has no critical orphan issue', () => {
  const audit = buildAudit();
  assert.equal(audit.ok, true, JSON.stringify(audit.criticalIssues, null, 2));
  assert.ok(audit.summary.canonicalFlows >= 29);
  assert.equal(audit.summary.unmatchedFetches, 0, 'frontend /api fetches should resolve to a mounted route/prefix or allowlist');
});

test('flow retirement report is generated and includes orphan/retirement sections', () => {
  const doc = read('docs/FLOW_RETIREMENT_REPORT.md');
  assert.match(doc, /FLOW_RETIREMENT_REPORT/);
  assert.match(doc, /Unmatched frontend fetch/);
  assert.match(doc, /Retired runtime references/);
});
