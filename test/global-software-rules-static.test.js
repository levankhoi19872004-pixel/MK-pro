'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const audit = require('../scripts/audit-global-software-rules');

const ROOT = path.resolve(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

test('global software rule contracts and governance scripts exist', () => {
  for (const file of [
    'docs/contracts/global-software-rules.md',
    'docs/contracts/ar-ledger-contract.md',
    'docs/contracts/inventory-contract.md',
    'docs/contracts/fund-ledger-contract.md',
    'docs/contracts/return-order-contract.md',
    'docs/contracts/staff-identity-contract.md',
    'docs/contracts/frontend-data-contract.md',
    'scripts/audit-global-software-rules.js',
    'scripts/reconcile-core-read-models.js',
    'src/utils/assertArLedgerContract.util.js',
    'src/utils/assertFundLedgerContract.util.js',
    'src/utils/assertStockPostingContract.util.js',
    'src/utils/assertStaffIdentityContract.util.js'
  ]) {
    assert.equal(exists(file), true, `${file} must exist`);
  }
});

test('global audit has no unclassified P0/P1 runtime violations', () => {
  const report = audit.runAudit();
  const blocking = report.issues.filter((issue) => ['P0', 'P1'].includes(issue.severity));
  assert.deepEqual(blocking, [], blocking.map((issue) => `${issue.severity} ${issue.code} ${issue.file}:${issue.line}`).join('\n'));
});
