'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const util = require('node:util');

const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const FundLedgerBalancePolicy = require('../src/services/accounting/FundLedgerBalancePolicy');
const HistoricalFundOwnershipPolicy = require('../src/services/accounting/HistoricalFundOwnershipPolicy');
const fundSummaryService = require('../src/services/fundSummary.service');
const auditScript = require('../scripts/audit-historical-fund-ownership-reconciliation');

const ROOT = path.resolve(__dirname, '..');

function ledger(overrides = {}) {
  const fundType = overrides.fundType || 'cash';
  return {
    id: overrides.id || 'FL-TEST',
    code: overrides.code || overrides.id || 'FL-TEST',
    date: overrides.date || '2026-07-14',
    accountingDate: overrides.accountingDate || overrides.date || '2026-07-14',
    remittanceDate: overrides.remittanceDate || overrides.date || '2026-07-14',
    deliveryDate: overrides.deliveryDate || '2026-07-14',
    createdAt: overrides.createdAt || `${overrides.date || '2026-07-14'}T08:00:00+07:00`,
    fundType,
    account: overrides.account || (fundType === 'bank' ? 'BANK' : 'CASH'),
    direction: overrides.direction || 'in',
    amount: overrides.amount ?? 0,
    sourceType: overrides.sourceType || 'DELIVERY_CASH_SUBMISSION',
    deliveryStaffCode: overrides.deliveryStaffCode || 'GH-A',
    deliveryStaffName: overrides.deliveryStaffName || 'GH A',
    sourceId: overrides.sourceId || overrides.id || 'SRC',
    sourceCode: overrides.sourceCode || overrides.id || 'SRC',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    active: true,
    ...overrides
  };
}

function fixture(rows, query = {}) {
  return FundBalanceReadService.calculateFixture(rows, {
    dateFrom: '2026-07-14',
    dateTo: '2026-07-14',
    full: true,
    ...query
  });
}

function classifications(rows) {
  return Array.from(HistoricalFundOwnershipPolicy.classifyOwnership(rows).values());
}

test('Phase258C case 1: exact OPA/DCS duplicate counts once', () => {
  const rows = [
    ledger({ id: 'OPA-1', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 33101000 }),
    ledger({ id: 'DCS-1', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 33101000 })
  ];
  const result = fixture(rows);
  assert.equal(result.summary.cashInPeriod, 33101000);
  assert.deepEqual(result.rows.map((row) => row.id), ['DCS-1']);
  assert.equal(result.ownershipClassifications[0].classification, 'PROVEN_DUPLICATE');
});

test('Phase258C case 2: legacy-only OPA is preserved', () => {
  const result = fixture([
    ledger({ id: 'OPA-LEGACY', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 20000000 })
  ]);
  assert.equal(result.summary.cashInPeriod, 20000000);
  assert.deepEqual(result.rows.map((row) => row.id), ['OPA-LEGACY']);
  assert.equal(result.ownershipClassifications[0].classification, 'LEGACY_ONLY');
});

test('Phase258C case 3: current DCS-only movement remains canonical', () => {
  const result = fixture([
    ledger({ id: 'DCS-ONLY', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 20000000 })
  ]);
  assert.equal(result.summary.cashInPeriod, 20000000);
  assert.deepEqual(result.rows.map((row) => row.id), ['DCS-ONLY']);
});

test('Phase258C case 4: same amount with different delivery staff is not duplicate', () => {
  const result = fixture([
    ledger({ id: 'OPA-A', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 10000000, deliveryStaffCode: 'GH-A' }),
    ledger({ id: 'DCS-B', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 10000000, deliveryStaffCode: 'GH-B' })
  ]);
  assert.equal(result.summary.cashInPeriod, 20000000);
  assert.deepEqual(result.rows.map((row) => row.id).sort(), ['DCS-B', 'OPA-A']);
});

test('Phase258C case 5: same amount and staff but competing events do not first-match', () => {
  const rows = [
    ledger({ id: 'OPA-1', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 10000000, sourceCode: 'SO-1' }),
    ledger({ id: 'OPA-2', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 10000000, sourceCode: 'SO-2' }),
    ledger({ id: 'DCS-1', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 10000000 })
  ];
  const cls = classifications(rows).filter((row) => row.sourceType === 'ORDER_PAYMENT_ALLOCATION');
  assert.equal(cls.every((row) => row.classification !== 'PROVEN_DUPLICATE'), true);
  assert.equal(cls.every((row) => row.classification === 'PARTIAL_OVERLAP'), true);
});

test('Phase258C case 6: multiple OPA rows aggregate to one DCS and count once', () => {
  const rows = [
    ledger({ id: 'OPA-10', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 10000000 }),
    ledger({ id: 'OPA-20', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 20000000 }),
    ledger({ id: 'OPA-3101', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 3101000 }),
    ledger({ id: 'DCS-33101', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 33101000 })
  ];
  const result = fixture(rows);
  assert.equal(result.summary.cashInPeriod, 33101000);
  assert.deepEqual(result.rows.map((row) => row.id), ['DCS-33101']);
  assert.equal(result.ownershipClassifications.filter((row) => row.classification === 'PROVEN_DUPLICATE').length, 3);
});

test('Phase258C case 7: partial overlap is classified for manual review and OPA is not blindly removed', () => {
  const rows = [
    ledger({ id: 'OPA-PARTIAL', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 33101000 }),
    ledger({ id: 'DCS-PARTIAL', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 30000000 })
  ];
  const result = fixture(rows);
  assert.equal(result.ownershipClassifications[0].classification, 'PARTIAL_OVERLAP');
  assert.ok(result.rows.some((row) => row.id === 'OPA-PARTIAL'));
});

test('Phase258C case 8: missing identity is ambiguous and not auto-excluded', () => {
  const rows = [
    ledger({ id: 'OPA-AMB', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 10000000, deliveryStaffCode: '', deliveryStaffName: '', deliveryDate: '' }),
    ledger({ id: 'DCS-AMB', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 10000000, deliveryStaffCode: '', deliveryStaffName: '', deliveryDate: '' })
  ];
  const result = fixture(rows);
  assert.equal(result.ownershipClassifications[0].classification, 'AMBIGUOUS');
  assert.ok(result.rows.some((row) => row.id === 'OPA-AMB'));
});

test('Phase258C case 9: cash and bank are independent ownership groups', () => {
  const result = fixture([
    ledger({ id: 'OPA-CASH', sourceType: 'ORDER_PAYMENT_ALLOCATION', fundType: 'cash', amount: 10000000 }),
    ledger({ id: 'DCS-BANK', sourceType: 'DELIVERY_CASH_SUBMISSION', fundType: 'bank', amount: 10000000 })
  ]);
  assert.equal(result.summary.cashInPeriod, 10000000);
  assert.equal(result.summary.bankInPeriod, 10000000);
});

test('Phase258C case 10: delayed remittance uses remittance/accounting date without forcing same calendar day', () => {
  const rows = [
    ledger({ id: 'OPA-13', sourceType: 'ORDER_PAYMENT_ALLOCATION', date: '2026-07-13', accountingDate: '2026-07-13', deliveryDate: '2026-07-13', amount: 20000000 }),
    ledger({ id: 'DCS-14', sourceType: 'DELIVERY_CASH_SUBMISSION', date: '2026-07-14', accountingDate: '2026-07-14', remittanceDate: '2026-07-14', deliveryDate: '2026-07-13', amount: 20000000 })
  ];
  const beforeRemittance = fixture(rows, { dateFrom: '2026-07-13', dateTo: '2026-07-13' });
  const remittanceDay = fixture(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-14' });
  assert.equal(beforeRemittance.summary.cashEndingBalance, 20000000);
  assert.equal(remittanceDay.summary.cashOpeningBalance, 0);
  assert.equal(remittanceDay.summary.cashInPeriod, 20000000);
});

test('Phase258C case 11: opening balance restores legacy OPA before D', () => {
  const result = fixture([
    ledger({ id: 'OPA-OPEN', sourceType: 'ORDER_PAYMENT_ALLOCATION', date: '2026-07-10', accountingDate: '2026-07-10', deliveryDate: '2026-07-10', amount: 20000000 })
  ], { dateFrom: '2026-07-14', dateTo: '2026-07-14' });
  assert.equal(result.summary.cashOpeningBalance, 20000000);
});

test('Phase258C case 12: Phase258B future OPA fund writer remains retired', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/accounting/OrderPaymentAllocationService.js'), 'utf8');
  assert.match(source, /ORDER_PAYMENT_ALLOCATION_FUND_POSTING_RETIRED/);
  assert.match(source, /const fundLedgers = \[\]/);
  assert.match(source, /fundPostingPolicy: 'deferred_to_delivery_remittance'/);
});

test('Phase258C case 13: DCS writer still posts exactly DELIVERY_CASH_SUBMISSION fund movement', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/fundService.source/part-02.jsfrag'), 'utf8');
  assert.match(source, /postDeliveryRemittanceLine/);
  assert.match(source, /sourceType: 'DELIVERY_CASH_SUBMISSION'/);
  assert.match(source, /sourceLineId: line\.lineId/);
});

test('Phase258C case 14: FundBalance, FundSummary pipeline, and policy share historical ownership semantics', () => {
  const rows = [
    ledger({ id: 'OPA-SUM', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 33101000 }),
    ledger({ id: 'DCS-SUM', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 33101000 })
  ];
  const result = fixture(rows);
  const filters = fundSummaryService.normalizeFilters({ fromDate: '2026-07-14', toDate: '2026-07-14' });
  const pipeline = util.inspect(fundSummaryService.buildNormalizedVoucherPipeline(filters), { depth: 40 });
  assert.equal(result.summary.cashInPeriod, 33101000);
  assert.match(pipeline, /phase258cOpaSupersededByDcs/);
  assert.equal(FundLedgerBalancePolicy.affectsFundBalance(rows[0]), true, 'OPA must not be blanket-excluded without ownership context');
});

test('Phase258C static guard: no blanket OPA non-balance exclusion remains', () => {
  const policySource = fs.readFileSync(path.join(ROOT, 'src/services/accounting/FundLedgerBalancePolicy.js'), 'utf8');
  assert.doesNotMatch(policySource, /NON_BALANCE_SOURCE_TYPES\s*=\s*Object\.freeze\(new Set\(\[[\s\S]*ORDER_PAYMENT_ALLOCATION/);
  assert.match(policySource, /HistoricalFundOwnershipPolicy/);
});

test('Phase258C audit script rejects --apply fail-closed', () => {
  assert.throws(
    () => auditScript.parseArgs(['--apply']),
    (error) => error && error.code === 'PHASE258C_AUDIT_READ_ONLY'
  );
});
