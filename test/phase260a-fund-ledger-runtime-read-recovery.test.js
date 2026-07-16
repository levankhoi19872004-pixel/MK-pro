'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');

function row({ id, date, fundType = 'cash', direction = 'in', amount, sourceType = 'TEST', note = '', ...extra }) {
  return {
    id,
    code: id,
    date,
    createdAt: `${date || '2026-07-10'}T01:00:00.000Z`,
    fundType,
    account: fundType === 'bank' ? 'BANK' : 'CASH',
    direction,
    amount,
    sourceType,
    note,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    status: 'posted',
    ...extra
  };
}

function restoreAggregate(original) {
  fundLedgerRepository.aggregate = original;
}

test('Phase260A: ownership partition key is built after ownership group key exists', () => {
  const stages = FundBalanceReadService.normalizationStages('Asia/Ho_Chi_Minh');
  const groupStageIndex = stages.findIndex((stage) => stage.$set && stage.$set._fundOwnershipGroupKey);
  const partitionStageIndex = stages.findIndex((stage) => stage.$set && stage.$set._fundOwnershipPartitionKey);

  assert.ok(groupStageIndex >= 0, 'missing ownership group key stage');
  assert.ok(partitionStageIndex >= 0, 'missing ownership partition key stage');
  assert.ok(partitionStageIndex > groupStageIndex, 'partition key must not reference a field created in the same $set stage');
});

test('Phase260A: production-like fixture covers basic read, OPA/DCS ownership, opening balance and exact filters', () => {
  const rows = [
    row({ id: 'OPEN-CASH', date: '2026-07-09', amount: 1000 }),
    row({ id: 'CASH-IN', date: '2026-07-10', amount: 500, note: 'alpha receipt' }),
    row({ id: 'BANK-IN', date: '2026-07-10', fundType: 'bank', amount: 700 }),
    row({ id: 'CASH-OUT', date: '2026-07-10', direction: 'out', amount: 200, sourceType: 'EXPENSE_VOUCHER' }),
    row({ id: 'BANK-OUT', date: '2026-07-10', fundType: 'bank', direction: 'out', amount: 100, sourceType: 'FUND_TRANSFER' }),
    row({
      id: 'OPA-DUP',
      date: '2026-07-10',
      sourceType: 'ORDER_PAYMENT_ALLOCATION',
      amount: 300,
      deliveryStaffCode: 'GH01',
      deliveryDate: '2026-07-10'
    }),
    row({
      id: 'DCS-DUP',
      date: '2026-07-10',
      sourceType: 'DELIVERY_CASH_SUBMISSION',
      amount: 300,
      deliveryStaffCode: 'GH01',
      deliveryDate: '2026-07-10'
    }),
    row({
      id: 'OPA-LEGACY',
      date: '2026-07-10',
      sourceType: 'ORDER_PAYMENT_ALLOCATION',
      amount: 400,
      deliveryStaffCode: 'GH02',
      deliveryDate: '2026-07-10'
    })
  ];

  const base = FundBalanceReadService.calculateFixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10', full: true });
  const filtered = FundBalanceReadService.calculateFixture(rows, {
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
    q: 'alpha',
    direction: 'in',
    full: true
  });
  const sourceFiltered = FundBalanceReadService.calculateFixture(rows, {
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
    sourceType: 'DELIVERY_CASH_SUBMISSION',
    full: true
  });

  assert.equal(base.summary.cashOpeningBalance, 1000);
  assert.equal(base.summary.cashEndingBalance, 2000);
  assert.equal(base.summary.bankEndingBalance, 600);
  assert.equal(base.rows.some((entry) => entry.id === 'OPA-DUP'), false);
  assert.equal(base.rows.some((entry) => entry.id === 'DCS-DUP'), true);
  assert.equal(filtered.totalRows, 1);
  assert.equal(filtered.summary.filteredRowsTotalIn, 500);
  assert.equal(filtered.summary.cashEndingBalance, base.summary.cashEndingBalance);
  assert.equal(sourceFiltered.totalRows, 1);
  assert.equal(sourceFiltered.summary.filteredRowsTotalIn, 300);
});

test('Phase260A: listFundLedgers returns rows, summary, pagination and mixed scope when aggregations succeed', async () => {
  const original = fundLedgerRepository.aggregate;
  let calls = 0;
  fundLedgerRepository.aggregate = async () => {
    calls += 1;
    if (calls === 1) {
      return [{
        _id: { fundType: 'cash', account: 'CASH' },
        openingBalance: 100,
        inPeriod: 50,
        outPeriod: 20,
        cumulativeBalanceThroughDateTo: 130,
        canonicalLedgerCount: 2,
        periodLedgerCount: 1
      }];
    }
    return [{
      rows: [{
        id: 'L1',
        code: 'L1',
        _fundBusinessDate: '2026-07-10',
        _fundType: 'cash',
        _fundAccount: 'CASH',
        _fundDirection: 'in',
        _fundAmount: 50,
        _runningBalanceAfterTransaction: 130
      }],
      count: [{ total: 1 }],
      filteredTotals: [{ _id: { fundType: 'cash', direction: 'in' }, amount: 50, count: 1 }]
    }];
  };

  try {
    const result = await FundBalanceReadService.listFundLedgers({ dateFrom: '2026-07-10', dateTo: '2026-07-10' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.summary.cashEndingBalance, 130);
    assert.equal(result.summary.filteredRowsTotalIn, 50);
    assert.equal(result.pagination.totalRows, 1);
    assert.equal(result.scope.type, 'MIXED_SCOPE');
  } finally {
    restoreAggregate(original);
  }
});

test('Phase260A: aggregation failures are classified by operation and do not fabricate zero KPI', async () => {
  const original = fundLedgerRepository.aggregate;
  fundLedgerRepository.aggregate = async () => {
    const error = new Error('$strLenCP requires a string argument, found: missing');
    error.name = 'MongoServerError';
    error.code = 34471;
    error.codeName = 'Location34471';
    throw error;
  };

  try {
    await assert.rejects(
      () => FundBalanceReadService.listFundLedgers({ dateFrom: '2026-07-10', dateTo: '2026-07-10' }),
      (error) => error.code === 'FUND_LEDGER_SUMMARY_AGGREGATION_FAILED'
    );
  } finally {
    restoreAggregate(original);
  }

  let calls = 0;
  fundLedgerRepository.aggregate = async () => {
    calls += 1;
    if (calls === 1) {
      return [{
        _id: { fundType: 'cash', account: 'CASH' },
        openingBalance: 0,
        inPeriod: 0,
        outPeriod: 0,
        cumulativeBalanceThroughDateTo: 0,
        canonicalLedgerCount: 0,
        periodLedgerCount: 0
      }];
    }
    const error = new Error('rows aggregation failed');
    error.name = 'MongoServerError';
    error.code = 50;
    error.codeName = 'MaxTimeMSExpired';
    throw error;
  };

  try {
    await assert.rejects(
      () => FundBalanceReadService.listFundLedgers({ dateFrom: '2026-07-10', dateTo: '2026-07-10' }),
      (error) => error.code === 'FUND_LEDGER_ROWS_AGGREGATION_FAILED'
    );
  } finally {
    restoreAggregate(original);
  }
});

test('Phase260A: frontend contract clears KPI on ledger load failure and uses current asset token', () => {
  const fundSource = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'public/js/app/debt/07f-fund-ledger.js'));
  const html = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'public/index.html'));

  assert.match(fundSource, /renderFundLedgerSummaryError/);
  assert.match(fundSource, /fundCashBalanceKpi\)fundCashBalanceKpi\.textContent='—'/);
  assert.equal(html.includes('phase230-remittance-lines-v1'), false);
  assert.match(html, /07f-fund-ledger\.part05\.js\?v=phase260-fund-ledger-runtime-fix-v1/);
});
