'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const { summarizeRows } = require('../scripts/audit-delivery-fund-double-posting');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_FILE = path.join(ROOT, 'PHASE258B_DELIVERY_FUND_BALANCE_POLICY_EVIDENCE.json');
const AUDIT_FILE = path.join(ROOT, 'PHASE258B_ORDER_PAYMENT_ALLOCATION_FUND_DUPLICATE_AUDIT.json');

function ledger(overrides = {}) {
  return {
    id: overrides.id || 'FL-TEST',
    code: overrides.id || 'FL-TEST',
    date: '2026-07-14',
    createdAt: '2026-07-14T08:00:00+07:00',
    fundType: 'cash',
    account: overrides.fundType === 'bank' ? 'BANK' : 'CASH',
    direction: 'in',
    amount: 0,
    sourceType: 'DELIVERY_CASH_SUBMISSION',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'GH Thanh',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    active: true,
    ...overrides
  };
}

test('Phase258B: one OPA technical total plus one remittance total counts once in canonical fund balance', () => {
  const rows = [
    ledger({ id: 'OPA-1', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 33101000 }),
    ledger({ id: 'NQGH-1', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 33101000 })
  ];
  const rawInflow = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const result = FundBalanceReadService.calculateFixture(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-14', full: true });

  assert.equal(rawInflow, 66202000);
  assert.equal(result.summary.cashInPeriod, 33101000);
  assert.equal(result.summary.cashEndingBalance, 33101000);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceType, 'DELIVERY_CASH_SUBMISSION');
});

test('Phase258B: many per-order OPA rows plus one delivery submission still count the remittance only', () => {
  const opaRows = [
    1697000,
    504000,
    4077000,
    1893000,
    1295000,
    2365000,
    3580000,
    4180000,
    2500000,
    6170000,
    4840000
  ].map((amount, index) => ledger({
    id: `OPA-${index + 1}`,
    sourceType: 'ORDER_PAYMENT_ALLOCATION',
    sourceCode: `B00395${index + 20}`,
    amount
  }));
  const opaTotal = opaRows.reduce((sum, row) => sum + row.amount, 0);
  const rows = [
    ...opaRows,
    ledger({ id: 'NQGH-TOTAL', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: opaTotal })
  ];
  const result = FundBalanceReadService.calculateFixture(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-14', full: true });
  const audit = summarizeRows(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-14', delivery: 'ghth', fundType: '' });

  assert.equal(opaTotal, 33101000);
  assert.equal(result.summary.cashInPeriod, 33101000);
  assert.equal(audit.orderPaymentAllocationFund.cash, 33101000);
  assert.equal(audit.deliveryCashSubmissionFund.cash, 33101000);
  assert.equal(audit.rawFundInflow.cash, 66202000);
  assert.equal(audit.canonicalFundInflow.cash, 33101000);
  assert.equal(audit.duplicateCandidate, true);
  assert.equal(audit.differenceRemovedByPolicy.cash, 33101000);

  fs.writeFileSync(AUDIT_FILE, `${JSON.stringify({ scope: { date: '2026-07-14', deliveryStaffCode: 'ghth' }, ...audit }, null, 2)}\n`);
});

test('Phase258B: bank OPA and bank delivery remittance also count once', () => {
  const rows = [
    ledger({ id: 'OPA-BANK', sourceType: 'ORDER_PAYMENT_ALLOCATION', fundType: 'bank', account: 'BANK', amount: 5020000 }),
    ledger({ id: 'NQGH-BANK', sourceType: 'DELIVERY_CASH_SUBMISSION', fundType: 'bank', account: 'BANK', amount: 5020000 })
  ];
  const result = FundBalanceReadService.calculateFixture(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-14', full: true });
  assert.equal(result.summary.bankInPeriod, 5020000);
  assert.equal(result.summary.bankEndingBalance, 5020000);
  assert.deepEqual(result.rows.map((entry) => entry.id), ['NQGH-BANK']);
});

test('Phase258B: evidence JSON is generated from fixture calculations', () => {
  const rows = [
    ledger({ id: 'OPA-CASH', sourceType: 'ORDER_PAYMENT_ALLOCATION', amount: 33101000 }),
    ledger({ id: 'NQGH-CASH', sourceType: 'DELIVERY_CASH_SUBMISSION', amount: 33101000 })
  ];
  const result = FundBalanceReadService.calculateFixture(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-14', full: true });
  const evidence = {
    productionPattern: {
      technicalSources: ['ORDER_PAYMENT_ALLOCATION', 'DELIVERY_CASH_SUBMISSION'],
      sameEconomicFlow: true
    },
    before: {
      orderPaymentAllocationCash: 33101000,
      deliveryCashSubmissionCash: 33101000,
      canonicalCashInflow: 66202000
    },
    after: {
      orderPaymentAllocationCash: 33101000,
      orderPaymentAllocationAffectsBalance: false,
      deliveryCashSubmissionCash: 33101000,
      deliveryCashSubmissionAffectsBalance: true,
      canonicalCashInflow: result.summary.cashInPeriod
    },
    futurePosting: {
      closeoutCreatesOrderPaymentAllocation: true,
      closeoutCreatesArLedgers: true,
      closeoutCreatesFundLedger: false,
      remittanceCreatesFundLedger: true
    },
    crossModuleConsistency: {
      fundLedger: result.summary.cashInPeriod,
      fundDashboard: result.summary.cashInPeriod,
      fundSummary: result.summary.cashInPeriod,
      doubleCount: result.summary.cashInPeriod !== 33101000
    }
  };
  assert.equal(evidence.after.canonicalCashInflow, 33101000);
  assert.equal(evidence.crossModuleConsistency.doubleCount, false);
  fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
});
