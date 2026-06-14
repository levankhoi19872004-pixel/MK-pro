'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const reportSource = fs.readFileSync('src/services/reportLegacy.service.js', 'utf8');
const fundSource = fs.readFileSync('src/services/fundService.js', 'utf8');

test('finance report derives cash and bank balances from FundLedger', () => {
  const block = reportSource.match(/async function financeReport[\s\S]*?\nasync function deliveryReport/)?.[0] || '';
  assert.ok(block);
  assert.match(block, /FundLedger\.aggregate/);
  assert.match(block, /fundSource:\s*'fundLedgers'/);
  assert.doesNotMatch(block, /const cashIn = sum\(cashRows/);
  assert.doesNotMatch(block, /const bankIn = sum\(bankRows/);
});

test('fund ledger list calculates summary over the full filtered result using facet', () => {
  const block = fundSource.match(/async function listFundLedgers[\s\S]*?\nasync function findExistingFundLedger/)?.[0] || '';
  assert.match(block, /\$facet/);
  assert.match(block, /totals:/);
  assert.match(block, /count:/);
  assert.match(block, /meta:/);
  assert.doesNotMatch(block, /summarizeFundLedgers\(rows\)/);
});
