'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const util = require('node:util');

const fundSummaryService = require('../src/services/fundSummary.service');

function ledger(overrides = {}) {
  return {
    id: overrides.id || 'FL-TEST',
    idempotencyKey: overrides.idempotencyKey || overrides.id || 'IDEMP-TEST',
    date: '2026-07-14',
    createdAt: '2026-07-14T08:00:00+07:00',
    amount: 33101000,
    direction: 'in',
    sourceType: 'DELIVERY_CASH_SUBMISSION',
    sourceId: 'SRC-1',
    sourceCode: 'SRC-1',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'GH Thanh',
    status: 'posted',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    ...overrides
  };
}

test('Phase258C: FundSummaryDomain preserves OPA row-level unless ownership context proves duplicate', () => {
  const normalized = [
    fundSummaryService.normalizeLedgerForSummary(ledger({ id: 'OPA-1', idempotencyKey: 'OPA-1', sourceType: 'ORDER_PAYMENT_ALLOCATION' })),
    fundSummaryService.normalizeLedgerForSummary(
      ledger({ id: 'OPA-DUP', idempotencyKey: 'OPA-DUP', sourceType: 'ORDER_PAYMENT_ALLOCATION' }),
      { classification: 'PROVEN_DUPLICATE' }
    ),
    fundSummaryService.normalizeLedgerForSummary(ledger({ id: 'NQGH-1', idempotencyKey: 'NQGH-1', sourceType: 'DELIVERY_CASH_SUBMISSION' }))
  ];
  assert.ok(normalized[0]);
  assert.equal(normalized[1], null);
  assert.ok(normalized[2]);
  const summary = fundSummaryService.summarizeNormalizedTransactions(normalized);
  assert.equal(summary.totals.totalDeposited, 66202000);
  assert.equal(summary.totals.depositVoucherCount, 2);
  assert.equal(summary.rows.length, 2);
});

test('Phase258B: FundSummary runtime and export pipelines include balance-affecting source policy', () => {
  const filters = fundSummaryService.normalizeFilters({ fromDate: '2026-07-14', toDate: '2026-07-14' });
  const pipeline = fundSummaryService.buildNormalizedVoucherPipeline(filters);
  const source = util.inspect(pipeline, { depth: 30 });
  assert.match(source, /ORDER_PAYMENT_ALLOCATION/);
  assert.match(source, /phase258cOpaSupersededByDcs/);
});
