'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const service = require('../src/services/accounting/FundDashboardReadService');
const { pendingFromSubmission, groupLedgersBySubmission, summarizeCashInTransitRows, parseDashboardDate } = service._private;

test('Phase232 pending: legacy confirmed submission is not counted again', () => {
  const pending = pendingFromSubmission({
    id: 'LEGACY-CONF',
    code: 'NQGH-LEGACY-CONF',
    status: 'confirmed',
    fundPosted: true,
    submittedCashAmount: 15000000
  }, new Map());

  assert.equal(pending.amount, 0);
  assert.equal(pending.lineCount, 0);
});

test('Phase232 pending: legacy pending without posted ledger falls back to legacy amount', () => {
  const pending = pendingFromSubmission({
    id: 'LEGACY-PENDING',
    code: 'NQGH-LEGACY-PENDING',
    status: 'submitted',
    fundPosted: false,
    submittedCashAmount: 5000000
  }, new Map());

  assert.equal(pending.amount, 5000000);
  assert.equal(pending.lineCount, 1);
});

test('Phase232 pending: mixed remittance lines count only real pending lines', () => {
  const pending = pendingFromSubmission({
    id: 'MIXED',
    code: 'NQGH-MIXED',
    status: 'partially_confirmed',
    fundPosted: false,
    remittanceLines: [
      { lineId: 'L1', method: 'cash', amount: 5000000, remittanceDate: '2026-07-10', status: 'confirmed' },
      { lineId: 'L2', method: 'cash', amount: 2000000, remittanceDate: '2026-07-10', status: 'submitted' },
      { lineId: 'L3', method: 'cash', amount: 1000000, remittanceDate: '2026-07-10', status: 'cancelled' }
    ]
  }, new Map());

  assert.equal(pending.amount, 2000000);
  assert.equal(pending.lineCount, 1);
});

test('Phase232 pending: canceled spelling and reversed lines are final', () => {
  const pending = pendingFromSubmission({
    id: 'FINAL-LINES',
    code: 'NQGH-FINAL-LINES',
    remittanceLines: [
      { lineId: 'L1', method: 'cash', amount: 1000, remittanceDate: '2026-07-10', status: 'canceled' },
      { lineId: 'L2', method: 'bank', amount: 2000, remittanceDate: '2026-07-10', status: 'reversed' }
    ]
  }, new Map());

  assert.equal(pending.amount, 0);
  assert.equal(pending.lineCount, 0);
});

test('Phase232 pending: stale legacy fundPosted false is protected by posted fundLedger evidence', () => {
  const ledgers = groupLedgersBySubmission([
    { sourceId: 'STALE', sourceCode: 'NQGH-STALE', amount: 7000000 }
  ]);
  const pending = pendingFromSubmission({
    id: 'STALE',
    code: 'NQGH-STALE',
    status: 'submitted',
    fundPosted: false,
    submittedCashAmount: 7000000
  }, ledgers);

  assert.equal(pending.amount, 0);
});

test('Phase232 cash-in-transit: overdue summary is computed before UI limit', () => {
  const rows = Array.from({ length: 75 }, (_, index) => ({
    asOf: '2026-07-10',
    deliveryStaffCode: `GH${index}`,
    deliveryStaffName: `GH ${index}`,
    date: '2026-07-01',
    collectedCash: 1000,
    submittedCash: 0,
    difference: 1000,
    status: 'pending'
  }));

  const result = summarizeCashInTransitRows(rows, 20);
  assert.equal(result.overdueSummary.count, 75);
  assert.equal(result.overdueSummary.amount, 75000);
  assert.equal(result.totalRows, 75);
  assert.equal(result.items.length, 20);
  assert.equal(result.truncated, true);
});

test('Phase232 validation: asOf is strict and invalid calendar dates are rejected', () => {
  assert.equal(parseDashboardDate({}), require('../src/utils/date.util').todayVN());
  assert.equal(parseDashboardDate({ asOf: '2026-07-10' }), '2026-07-10');
  assert.throws(() => parseDashboardDate({ asOf: '2026-99-99' }), /Ngay du lieu quy khong hop le/);
  assert.throws(() => parseDashboardDate({ asOf: '2026-02-31' }), /Ngay du lieu quy khong hop le/);
  assert.throws(() => parseDashboardDate({ asOf: 'abc' }), /Ngay du lieu quy khong hop le/);
});
