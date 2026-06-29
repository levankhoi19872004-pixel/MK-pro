'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { summarizeExternalDebtAr } = require('../scripts/lib/externalDebtArReconcile');

test('reconcile detect missing AR, duplicate, missing source, amount mismatch và orphan', () => {
  const externalDebtOrders = [
    { id: 'EDO1', code: 'ND1', status: 'active', customerCode: 'C001', totalAmount: 1000, documentDate: '2026-06-29' },
    { id: 'EDO2', code: 'ND2', status: 'active', customerCode: 'C002', totalAmount: 2000, documentDate: '2026-06-29' },
    { id: 'EDO3', code: 'ND3', status: 'active', customerCode: 'C003', totalAmount: 3000, documentDate: '2026-06-29' }
  ];
  const arLedgers = [
    { id: 'AR-EXTERNAL-EDO1', code: 'AR-EXTERNAL-ND1', type: 'ar_external_debt', sourceType: 'externalDebt', sourceId: 'EDO1', sourceCode: 'ND1', customerCode: 'C001', amount: 1000, debit: 1000, date: '2026-06-29', idempotencyKey: 'AR-EXTERNAL-DEBT:EDO1', status: 'posted' },
    { id: 'AR-EXTERNAL-EDO2A', code: 'AR-EXTERNAL-ND2A', type: 'ar_external_debt', sourceType: 'externalDebt', sourceId: 'EDO2', sourceCode: 'ND2', customerCode: 'C002', amount: 2000, debit: 2000, date: '2026-06-29', idempotencyKey: 'AR-EXTERNAL-DEBT:EDO2', status: 'posted' },
    { id: 'AR-EXTERNAL-EDO2B', code: 'AR-EXTERNAL-ND2B', type: 'ar_external_debt', sourceType: 'externalDebt', sourceId: 'EDO2', sourceCode: 'ND2', customerCode: 'C002', amount: 2000, debit: 2000, date: '2026-06-29', idempotencyKey: 'AR-EXTERNAL-DEBT:EDO2-DUP', status: 'posted' },
    { id: 'AR-EXTERNAL-ORPHAN', code: 'AR-EXTERNAL-ORPHAN', type: 'ar_external_debt', sourceType: 'externalDebt', sourceId: 'NO-SOURCE', sourceCode: 'NO-SOURCE', customerCode: 'C009', amount: 9000, debit: 9000, date: '2026-06-29', idempotencyKey: 'AR-EXTERNAL-DEBT:NO-SOURCE', status: 'posted' },
    { id: 'AR-EXTERNAL-MISSING-SOURCE', code: 'AR-EXTERNAL-MISSING-SOURCE', type: 'ar_external_debt', sourceType: 'externalDebt', customerCode: 'C010', amount: 10, debit: 10, date: '2026-06-29', idempotencyKey: 'AR-EXTERNAL-DEBT:MISS', status: 'posted' },
    { id: 'AR-EXTERNAL-EDO1-MISMATCH', code: 'AR-EXTERNAL-ND1-MISMATCH', type: 'ar_external_debt', sourceType: 'externalDebt', sourceId: 'EDO1', sourceCode: 'ND1', customerCode: 'C001', amount: 1500, debit: 1500, date: '2026-06-29', idempotencyKey: 'AR-EXTERNAL-DEBT:EDO1-MISMATCH', status: 'posted' }
  ];

  const summary = summarizeExternalDebtAr({ externalDebtOrders, arLedgers });
  const issues = summary.cases.map((row) => row.issue);
  assert.ok(issues.includes('confirmed_external_debt_missing_ar'));
  assert.ok(issues.includes('duplicate_external_debt_ledger_for_source'));
  assert.ok(issues.includes('duplicate_external_debt_sourceId'));
  assert.ok(issues.includes('external_debt_ledger_missing_source'));
  assert.ok(issues.includes('external_debt_ar_mismatch'));
  assert.ok(issues.includes('orphan_external_debt_ledger_source_not_found'));
  assert.ok(summary.totals.p0Cases >= 6);
});
