'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const FinanceReportService = require('../src/services/reports/FinanceReportService');

const ROOT = path.resolve(__dirname, '..');

function row({ id, date, createdAt, fundType = 'cash', account, direction = 'in', amount, sourceType = 'TEST', note = '', ...extra }) {
  return {
    id,
    code: id,
    date,
    createdAt: createdAt || `${date || '2026-07-10'}T01:00:00.000Z`,
    fundType,
    account: account || (fundType === 'bank' ? 'BANK' : 'CASH'),
    direction,
    amount,
    sourceType,
    note,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted',
    ...extra
  };
}

function fixture(rows, query) {
  return FundBalanceReadService.calculateFixture(rows, { full: true, ...query });
}

test('Phase228: cùng dateTo luôn có cùng cash/bank ending balance dù dateFrom khác', () => {
  const rows = [
    row({ id: 'C9-IN', date: '2026-07-09', fundType: 'cash', amount: 185855730 }),
    row({ id: 'C9-OUT', date: '2026-07-09', fundType: 'cash', direction: 'out', amount: 100000 }),
    row({ id: 'B9-IN', date: '2026-07-09', fundType: 'bank', amount: 172610381 }),
    row({ id: 'C10-IN', date: '2026-07-10', fundType: 'cash', amount: 43831719 }),
    row({ id: 'C10-OUT', date: '2026-07-10', fundType: 'cash', direction: 'out', amount: 400000 }),
    row({ id: 'B10-IN', date: '2026-07-10', fundType: 'bank', amount: 19435318 })
  ];
  const a = fixture(rows, { dateFrom: '2026-07-09', dateTo: '2026-07-10' });
  const b = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10' });

  assert.equal(a.summary.cashEndingBalance, 229187449);
  assert.equal(a.summary.bankEndingBalance, 192045699);
  assert.equal(a.summary.cashEndingBalance, b.summary.cashEndingBalance);
  assert.equal(a.summary.bankEndingBalance, b.summary.bankEndingBalance);
  assert.notEqual(a.summary.totalInPeriod, b.summary.totalInPeriod);
  assert.notEqual(a.summary.totalOutPeriod, b.summary.totalOutPeriod);
  assert.notEqual(a.summary.totalOpeningBalance, b.summary.totalOpeningBalance);
});

test('Phase228: opening + in - out = ending', () => {
  const result = fixture([
    row({ id: 'OPEN-IN', date: '2026-07-08', amount: 100000000 }),
    row({ id: 'OPEN-OUT', date: '2026-07-08', direction: 'out', amount: 10000000 }),
    row({ id: 'PERIOD-IN', date: '2026-07-10', amount: 5000000 }),
    row({ id: 'PERIOD-OUT', date: '2026-07-10', direction: 'out', amount: 2000000 })
  ], { dateFrom: '2026-07-10', dateTo: '2026-07-10' });

  assert.equal(result.summary.cashOpeningBalance, 90000000);
  assert.equal(result.summary.cashInPeriod, 5000000);
  assert.equal(result.summary.cashOutPeriod, 2000000);
  assert.equal(result.summary.cashEndingBalance, 93000000);
});

test('Phase228: cash và bank độc lập, total là tổng hai quỹ', () => {
  const result = fixture([
    row({ id: 'C-IN', date: '2026-07-10', fundType: 'cash', amount: 10000000 }),
    row({ id: 'B-IN', date: '2026-07-10', fundType: 'bank', amount: 20000000 }),
    row({ id: 'C-OUT', date: '2026-07-10', fundType: 'cash', direction: 'out', amount: 1000000 }),
    row({ id: 'B-OUT', date: '2026-07-10', fundType: 'bank', direction: 'out', amount: 2000000 })
  ], { dateFrom: '2026-07-10', dateTo: '2026-07-10' });

  assert.equal(result.summary.cashEndingBalance, 9000000);
  assert.equal(result.summary.bankEndingBalance, 18000000);
  assert.equal(result.summary.totalEndingBalance, 27000000);
});

test('Phase228: keyword/direction/sourceType chỉ lọc rows, không đổi ending balance', () => {
  const rows = [
    row({ id: 'GHKX-IN', date: '2026-07-10', amount: 5000000, sourceType: 'ORDER_PAYMENT_ALLOCATION', deliveryStaffCode: 'ghkx', note: 'ghkx' }),
    row({ id: 'OTHER-IN', date: '2026-07-10', amount: 3000000, sourceType: 'OTHER_SOURCE', note: 'other' }),
    row({ id: 'OUT', date: '2026-07-10', direction: 'out', amount: 1000000, sourceType: 'EXPENSE_VOUCHER' })
  ];
  const base = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  const byKeyword = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10', q: 'ghkx' });
  const byDirection = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10', direction: 'in' });
  const bySource = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10', sourceType: 'ORDER_PAYMENT_ALLOCATION' });

  for (const result of [byKeyword, byDirection, bySource]) {
    assert.equal(result.summary.cashEndingBalance, base.summary.cashEndingBalance);
  }
  assert.equal(byKeyword.totalRows, 1);
  assert.equal(byDirection.totalRows, 2);
  assert.equal(bySource.totalRows, 1);
});

test('Phase228: fundType là balance scope filter', () => {
  const rows = [
    row({ id: 'CASH', date: '2026-07-10', fundType: 'cash', amount: 100 }),
    row({ id: 'BANK', date: '2026-07-10', fundType: 'bank', amount: 200 })
  ];
  const cash = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10', fundType: 'cash' });
  assert.equal(cash.summary.cashEndingBalance, 100);
  assert.equal(cash.summary.bankEndingBalance, 0);
  assert.equal(cash.rows.every((entry) => entry.fundType === 'cash'), true);
});

test('Phase228: running balance của cùng ledger không phụ thuộc dateFrom', () => {
  const rows = [
    row({ id: 'PREVIOUS', date: '2026-07-09', amount: 1000, createdAt: '2026-07-09T01:00:00.000Z' }),
    row({ id: 'TARGET', date: '2026-07-10', amount: 500, createdAt: '2026-07-10T01:00:00.000Z' })
  ];
  const a = fixture(rows, { dateFrom: '2026-07-09', dateTo: '2026-07-10' });
  const b = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  const targetA = a.rows.find((entry) => entry.id === 'TARGET');
  const targetB = b.rows.find((entry) => entry.id === 'TARGET');
  assert.equal(targetA.runningBalanceAfterTransaction, 1500);
  assert.equal(targetB.runningBalanceAfterTransaction, 1500);
});

test('Phase228: running balance không phụ thuộc page/limit với hơn 200 ledger', () => {
  const rows = Array.from({ length: 250 }, (_, index) => row({
    id: `L${String(index + 1).padStart(3, '0')}`,
    date: '2026-07-10',
    createdAt: `2026-07-10T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
    amount: 1
  }));
  const query = { dateFrom: '2026-07-10', dateTo: '2026-07-10' };
  const pageOne200 = FundBalanceReadService.calculateFixture(rows, { ...query, page: 1, limit: 200 });
  const pageTwo100 = FundBalanceReadService.calculateFixture(rows, { ...query, page: 2, limit: 100 });
  const commonIds = new Set(pageOne200.rows.map((entry) => entry.id));
  const common = pageTwo100.rows.find((entry) => commonIds.has(entry.id));
  assert.ok(common, 'phải có transaction xuất hiện ở cả hai cách phân trang');
  const other = pageOne200.rows.find((entry) => entry.id === common.id);
  assert.equal(common.runningBalanceAfterTransaction, other.runningBalanceAfterTransaction);
});

test('Phase228: createdAt legacy fallback dùng timezone Asia/Ho_Chi_Minh tại biên cuối ngày', () => {
  const beforeMidnight = row({ id: 'VN-END', date: '', createdAt: '2026-07-10T16:59:59.000Z', amount: 100 });
  const nextDay = row({ id: 'VN-NEXT', date: '', createdAt: '2026-07-10T17:00:00.000Z', amount: 200 });
  const result = fixture([beforeMidnight, nextDay], {
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
    timezone: 'Asia/Ho_Chi_Minh'
  });
  assert.equal(result.summary.cashEndingBalance, 100);
  assert.deepEqual(result.rows.map((entry) => entry.id), ['VN-END']);
});

test('Phase228: unconfirmed/inactive/reversal/cancelled/deleted không vào balance', () => {
  const rows = [
    row({ id: 'OK', date: '2026-07-10', amount: 100 }),
    row({ id: 'UNCONFIRMED', date: '2026-07-10', amount: 100, accountingConfirmed: false, accountingStatus: '' }),
    row({ id: 'INACTIVE', date: '2026-07-10', amount: 100, active: false }),
    row({ id: 'REVERSAL', date: '2026-07-10', amount: 100, isReversal: true }),
    row({ id: 'CANCELLED', date: '2026-07-10', amount: 100, status: 'cancelled' }),
    row({ id: 'DELETED', date: '2026-07-10', amount: 100, isDeleted: true })
  ];
  const result = fixture(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  assert.equal(result.summary.cashEndingBalance, 100);
  assert.deepEqual(result.rows.map((entry) => entry.id), ['OK']);
});

test('Phase228: chuyển cash sang bank làm từng quỹ đổi nhưng total không đổi', () => {
  const result = fixture([
    row({ id: 'OPEN-CASH', date: '2026-07-09', fundType: 'cash', amount: 10000000 }),
    row({ id: 'TRANSFER-OUT', date: '2026-07-10', fundType: 'cash', direction: 'out', amount: 5000000, sourceType: 'FUND_TRANSFER' }),
    row({ id: 'TRANSFER-IN', date: '2026-07-10', fundType: 'bank', direction: 'in', amount: 5000000, sourceType: 'FUND_TRANSFER' })
  ], { dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  assert.equal(result.summary.cashEndingBalance, 5000000);
  assert.equal(result.summary.bankEndingBalance, 5000000);
  assert.equal(result.summary.totalOpeningBalance, 10000000);
  assert.equal(result.summary.totalEndingBalance, 10000000);
});

test('Phase228: compatibility aliases map đúng canonical fields', () => {
  const result = fixture([
    row({ id: 'IN', date: '2026-07-10', amount: 1000 }),
    row({ id: 'OUT', date: '2026-07-10', direction: 'out', amount: 200 })
  ], { dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  const summary = result.summary;
  assert.equal(summary.cashBalance, summary.cashEndingBalance);
  assert.equal(summary.bankBalance, summary.bankEndingBalance);
  assert.equal(summary.totalIn, summary.totalInPeriod);
  assert.equal(summary.totalOut, summary.totalOutPeriod);
  assert.equal(summary.totalBalance, summary.totalEndingBalance);
});

test('Phase228: FinanceReport và màn Quỹ dùng cùng canonical summary service', () => {
  const result = fixture([
    row({ id: 'CASH-IN', date: '2026-07-10', fundType: 'cash', amount: 1000 }),
    row({ id: 'BANK-IN', date: '2026-07-10', fundType: 'bank', amount: 2000 })
  ], { dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  const financeSummary = FinanceReportService.summarizeAccounts(result.summary.accounts.map((account) => ({
    ...account,
    inAmount: account.inPeriod,
    outAmount: account.outPeriod
  })));
  assert.equal(financeSummary.cashBalance, result.summary.cashEndingBalance);
  assert.equal(financeSummary.bankBalance, result.summary.bankEndingBalance);

  const financeSource = fs.readFileSync(path.join(ROOT, 'src/services/reports/FinanceReportService.js'), 'utf8');
  const fundServiceSource = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'src/services/fundService.js'));
  const frontendSource = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'public/js/app/debt/07f-fund-ledger.js'));
  assert.match(financeSource, /FundBalanceReadService\.listFundLedgers/);
  assert.match(fundServiceSource, /FundBalanceReadService\.listFundLedgers\(query\)/);
  assert.doesNotMatch(frontendSource, /const balances=\{cash:0,bank:0\}/);
  assert.match(frontendSource, /runningBalanceAfterTransaction/);
});
