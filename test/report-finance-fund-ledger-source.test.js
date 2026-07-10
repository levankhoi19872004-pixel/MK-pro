'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const finance = fs.readFileSync(path.join(root, 'src/services/reports/FinanceReportService.js'), 'utf8');
const delivery = fs.readFileSync(path.join(root, 'src/services/reports/DeliveryReportService.js'), 'utf8');

test('FinanceReportService reuses canonical FundBalanceReadService instead of duplicating balance formulas', () => {
  assert.match(finance, /FundBalanceReadService = require\('\.\.\/accounting\/FundBalanceReadService'\)/);
  assert.match(finance, /FundBalanceReadService\.listFundLedgers\(query\)/);
  assert.match(finance, /function fundLedgerCanonicalFilter\(extra = \{\}\)/);
  assert.match(finance, /FundBalanceReadService\.fundLedgerCanonicalFilter\(extra\)/);
  assert.doesNotMatch(finance, /FundLedger\.aggregate/);
});

test('DeliveryReportService reuses fundLedgerCanonicalFilter for collections', () => {
  assert.match(delivery, /const \{ fundLedgerCanonicalFilter \} = require\('\.\/FinanceReportService'\)/);
  assert.match(delivery, /fundLedgerCanonicalFilter\(\{ direction:/);
});
