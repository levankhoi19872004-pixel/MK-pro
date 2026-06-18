'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');
const controller = require('./helpers/sourceBundle.util').readSource('src/controllers/reportController.js');

test('dashboard reads aggregate summaries and does not call full list reports', () => {
  const block = source.match(/async function dashboardReport[\s\S]*?\n\nmodule\.exports/)?.[0] || '';
  assert.ok(block);
  assert.match(block, /source:\s*'mongo_summary_only'/);
  assert.match(block, /SalesOrder\.aggregate/);
  assert.match(block, /ArLedger\.aggregate/);
  assert.match(block, /FundLedger\.aggregate/);
  assert.match(block, /MasterOrder\.aggregate/);
  assert.match(block, /ImportOrder\.aggregate/);
  assert.doesNotMatch(block, /salesReport\(/);
  assert.doesNotMatch(block, /debtReport\(/);
  assert.doesNotMatch(block, /stockReport\(/);
  assert.doesNotMatch(block, /financeReport\(/);
  assert.doesNotMatch(block, /deliveryReport\(/);
});

test('dashboard defaults to the current day instead of scanning an unbounded period', () => {
  const block = controller.match(/const dashboard[\s\S]*?\n\nconst sales/)?.[0] || '';
  assert.match(block, /normalizeQueryDateRange/);
  assert.match(block, /defaultToday:\s*true/);
});
