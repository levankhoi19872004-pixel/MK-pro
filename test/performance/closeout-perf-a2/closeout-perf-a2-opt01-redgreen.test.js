'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('CL-A2-REQ-001/007: query-dedup flag exists and defaults OFF', () => {
  const flags = read('src/config/featureFlags.js');
  assert.match(flags, /closeoutQueryDedupV1:\s*\(\)\s*=>\s*readBoolean\('PERF_CLOSEOUT_QUERY_DEDUP_V1',\s*false\)/);
});

test('CL-A2-REQ-001: optimized NO_DEBT_DELTA exits before initial idempotency query', () => {
  const src = read('src/services/accounting/OrderPaymentDebtReconcileService.js');
  const opt = src.indexOf("order.debt.initialIdempotency");
  const early = src.indexOf('PERF_CLOSEOUT_QUERY_DEDUP_V1');
  const noDebt = src.indexOf("skipReason: 'NO_DEBT_DELTA'", early);
  assert.ok(early >= 0, 'optimized flag branch must exist');
  assert.ok(noDebt >= 0 && noDebt < opt, 'flagged NO_DEBT_DELTA must return before initialIdempotency DB read');
});

test('CL-A2-REQ-001/011: actual mutation path keeps one fresh pre-post idempotency guard', () => {
  const src = read('src/services/accounting/OrderPaymentDebtReconcileService.js');
  assert.match(src, /order\.debt\.prePostIdempotency/);
  const guard = src.indexOf("order.debt.prePostIdempotency");
  const post = src.indexOf("order.debt.adjustmentPost");
  assert.ok(guard >= 0 && post > guard, 'fresh idempotency guard must remain immediately before adjustment posting');
});
