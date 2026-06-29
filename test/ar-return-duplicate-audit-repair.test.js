'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  activeArReturnDuplicateGroups
} = require('../scripts/lib/arReturnIdempotencyAudit');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('audit duplicate groups only count active AR-RETURN rows by business dimension', () => {
  const rows = [
    { code: 'AR-RETURN-A', type: 'ar_return', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-1', returnOrderCode: 'RO-1', orderCode: 'SO-1', customerCode: 'C1', credit: 100, status: 'posted' },
    { code: 'AR-RETURN-B', type: 'ar_return', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-1', returnOrderCode: 'RO-1', orderCode: 'SO-1', customerCode: 'C1', credit: 100, status: 'posted' },
    { code: 'AR-RETURN-C', type: 'ar_return', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-1', returnOrderCode: 'RO-1', orderCode: 'SO-1', customerCode: 'C1', credit: 100, status: 'reversed', reversed: true },
    { code: 'AR-RETURN-D', type: 'ar_return', sourceType: 'returnOrder', sourceId: 'RO-2', sourceCode: 'RO-2', returnOrderCode: 'RO-2', orderCode: 'SO-1', customerCode: 'C1', credit: 100, status: 'posted' }
  ];

  const groups = activeArReturnDuplicateGroups(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].returnOrderKey, 'RO-1');
});

test('AR-RETURN duplicate audit and repair scripts are safe by default', () => {
  const audit = read('scripts/audit-ar-return-duplicates.js');
  const repair = read('scripts/repair-ar-return-duplicates.js');
  const pkg = read('package.json');

  assert.match(audit, /read-only, không sửa dữ liệu/);
  assert.match(audit, /process\.exit\(groups\.length \? 2 : 0\)/);
  assert.match(repair, /const dryRun = !apply \|\| has\('--dry-run'\)/);
  assert.match(repair, /Không cho phép --apply toàn bộ/);
  assert.match(repair, /manual_review_required_amount_mismatch_or_zero/);
  assert.match(repair, /ar_return_reversal/);
  assert.doesNotMatch(repair, /deleteMany|deleteOne|findOneAndDelete|remove\(/);
  assert.match(pkg, /audit:ar-return-duplicates/);
  assert.match(pkg, /repair:ar-return-duplicates:dry/);
});
