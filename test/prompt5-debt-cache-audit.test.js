'use strict';

const assert = require('assert');
const test = require('node:test');
const {
  summarizeArSalesOrderDebtCacheAudit,
  summarizeCacheMismatch
} = require('../scripts/lib/arSalesOrderDebtCacheAudit');

test('audit detects SalesOrder debt cache mismatch against arLedgers', () => {
  const result = summarizeCacheMismatch({
    salesOrders: [{ id: 'SO1', code: 'SO1', customerCode: 'C1', debtAmount: 999000 }],
    customers: [{ code: 'C1', name: 'Customer 1', currentDebt: 999000 }],
    arLedgers: [
      { type: 'ar_sale', amount: 100000, orderCode: 'SO1', customerCode: 'C1', status: 'posted' },
      { type: 'ar_receipt', credit: 40000, orderCode: 'SO1', customerCode: 'C1', status: 'posted' }
    ]
  });
  assert.equal(result.salesOrderMismatches.length, 1);
  assert.equal(result.salesOrderMismatches[0].officialDebt, 60000);
  assert.equal(result.customerMismatches.length, 1);
  assert.equal(result.customerMismatches[0].officialDebt, 60000);
});

test('audit summary marks arLedgers as debt SSoT and reports GET side-effect risks', () => {
  const summary = summarizeArSalesOrderDebtCacheAudit({
    salesOrders: [],
    customers: [],
    arLedgers: [],
    sourceRisks: [{ severity: 'P0', issue: 'possible_get_debt_cache_side_effect', getSideEffect: true, file: 'src/routes/x.js' }]
  });
  assert.equal(summary.canonical.debtSsot, 'arLedgers');
  assert.equal(summary.canonical.salesOrderDebtCache, 'read-model-only');
  assert.equal(summary.totals.getDebtSideEffectRisk, 1);
  assert.equal(summary.totals.p0Cases, 1);
});
