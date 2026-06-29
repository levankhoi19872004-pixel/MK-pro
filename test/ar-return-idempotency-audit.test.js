'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  summarizeArReturnIdempotency,
  hasBlockingIssues
} = require('../scripts/lib/arReturnIdempotencyAudit');

test('audit detects missing idempotencyKey and duplicate AR-RETURN dimensions', () => {
  const rows = [
    { code: 'AR-RETURN-RO-1-A', type: 'ar_return', ledgerType: 'AR-RETURN', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-1', returnOrderCode: 'RO-1', idempotencyKey: 'AR-RETURN:RO-1', status: 'posted' },
    { code: 'AR-RETURN-RO-1-B', type: 'ar_return', ledgerType: 'AR-RETURN', sourceType: 'returnOrder', sourceId: 'RO-1', sourceCode: 'RO-1', returnOrderCode: 'RO-1', idempotencyKey: 'AR-RETURN:RO-1', status: 'posted' },
    { code: 'AR-RETURN-RO-2', type: 'ar_return', ledgerType: 'AR-RETURN', sourceType: 'returnOrder', sourceId: 'RO-2', sourceCode: '', returnOrderCode: 'RO-2', status: 'posted' },
    { code: 'AR-RETURN-RO-3', type: 'ar_return', ledgerType: 'AR-RETURN', sourceType: 'salesOrder', sourceId: 'RO-3', sourceCode: 'RO-3', returnOrderCode: 'RO-3', idempotencyKey: 'AR-RETURN:RO-3', status: 'posted' }
  ];

  const summary = summarizeArReturnIdempotency(rows, rows);

  assert.equal(summary.totals.arReturn, 4);
  assert.equal(summary.totals.missingIdempotencyKey, 1);
  assert.equal(summary.totals.missingSourceIdOrSourceCode, 1);
  assert.equal(summary.totals.duplicateIdempotencyKeyGroups, 1);
  assert.equal(summary.totals.duplicateSourceGroups, 1);
  assert.equal(summary.totals.duplicateReturnOrderCodeGroups, 1);
  assert.equal(summary.totals.nonCanonicalSourceType, 1);
  assert.equal(hasBlockingIssues(summary), true);
  assert.ok(summary.p0Cases.some((item) => item.issue === 'missing_idempotencyKey'));
  assert.ok(summary.p0Cases.some((item) => item.issue === 'duplicate_idempotencyKey'));
});
