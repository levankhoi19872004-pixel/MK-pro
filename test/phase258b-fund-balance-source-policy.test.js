'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const util = require('node:util');

const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const FundLedgerBalancePolicy = require('../src/services/accounting/FundLedgerBalancePolicy');
const FundDashboardReadService = require('../src/services/accounting/FundDashboardReadService');
const { buildSourceNote } = require('../src/services/source-contracts/SourceNoteBuilder');

function row(overrides = {}) {
  return {
    id: overrides.id || 'FL-TEST',
    code: overrides.id || 'FL-TEST',
    date: '2026-07-14',
    createdAt: '2026-07-14T08:00:00+07:00',
    fundType: 'cash',
    account: 'CASH',
    direction: 'in',
    amount: 33101000,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    active: true,
    ...overrides
  };
}

test('Phase258B: ORDER_PAYMENT_ALLOCATION aliases are non-balance, DELIVERY_CASH_SUBMISSION affects balance', () => {
  assert.equal(FundLedgerBalancePolicy.affectsFundBalance(row({ sourceType: 'ORDER_PAYMENT_ALLOCATION' })), false);
  assert.equal(FundLedgerBalancePolicy.affectsFundBalance(row({ refType: 'ORDER_PAYMENT_ALLOCATION' })), false);
  assert.equal(FundLedgerBalancePolicy.affectsFundBalance(row({ referenceType: 'ORDER_PAYMENT_ALLOCATION' })), false);
  assert.equal(FundLedgerBalancePolicy.affectsFundBalance(row({ sourceType: 'DELIVERY_CASH_SUBMISSION' })), true);
});

test('Phase258B: canonical FundBalanceReadService excludes OPA from summary and rows', () => {
  const rows = [
    row({ id: 'OPA-1', sourceType: 'ORDER_PAYMENT_ALLOCATION' }),
    row({ id: 'NQGH-1', sourceType: 'DELIVERY_CASH_SUBMISSION' })
  ];
  const result = FundBalanceReadService.calculateFixture(rows, {
    dateFrom: '2026-07-14',
    dateTo: '2026-07-14',
    full: true
  });
  assert.equal(result.summary.cashInPeriod, 33101000);
  assert.equal(result.summary.cashEndingBalance, 33101000);
  assert.deepEqual(result.rows.map((entry) => entry.id), ['NQGH-1']);
  assert.equal(result.excludedLedgerCount, 1);
});

test('Phase258B: canonical Mongo filter and dashboard recent transactions share balance policy', () => {
  const filter = FundBalanceReadService.fundLedgerCanonicalFilter({});
  const serialized = util.inspect(filter, { depth: 20 });
  assert.match(serialized, /ORDER_PAYMENT_ALLOCATION/);
  assert.match(serialized, /\$nor/);

  const dashboardSource = FundDashboardReadService.getFundDashboard.toString();
  assert.match(dashboardSource, /loadRecentTransactions/);
  assert.equal(typeof FundDashboardReadService._private.mapRecentLedger, 'function');
});

test('Phase258B: source contract states OPA is non-balance and remittance owns delivery fund balance', () => {
  const note = buildSourceNote('fund-ledger');
  assert.match(note.balancePolicy, /ORDER_PAYMENT_ALLOCATION/);
  assert.match(note.balancePolicy, /does not affect fund balance/);
  assert.match(note.balancePolicy, /DELIVERY_CASH_SUBMISSION/);
});
