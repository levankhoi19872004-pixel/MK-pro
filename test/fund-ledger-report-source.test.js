'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const reportSource = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');
const fundSource = require('./helpers/sourceBundle.util').readSource('src/services/fundService.js');

test('finance report derives cash and bank balances from FundLedger', () => {
  const block = reportSource.match(/async function financeReport[\s\S]*?\nasync function deliveryReport/)?.[0] || '';
  assert.ok(block);
  assert.match(block, /FundLedger\.aggregate/);
  assert.match(block, /fundSource:\s*'fundLedgers'/);
  assert.doesNotMatch(block, /const cashIn = sum\(cashRows/);
  assert.doesNotMatch(block, /const bankIn = sum\(bankRows/);
});

test('fund ledger list delegates balance and running-balance logic to canonical FundBalanceReadService', () => {
  const block = fundSource.match(/async function listFundLedgers[\s\S]*?\nasync function findExistingFundLedger/)?.[0] || '';
  assert.match(block, /FundBalanceReadService\.listFundLedgers\(query\)/);
  assert.doesNotMatch(block, /cashBalance\s*=|bankBalance\s*=|\$facet/);
  const canonical = fs.readFileSync('src/services/accounting/FundBalanceReadService.js', 'utf8');
  assert.match(canonical, /\$setWindowFields/);
  assert.match(canonical, /buildSummaryPipeline/);
  assert.match(canonical, /buildRowsPipeline/);
});
