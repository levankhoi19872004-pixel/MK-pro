'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const audit = require('../scripts/audit-fund-access-violations');
const fundContract = require('../src/utils/assertFundLedgerContract.util');

test('fund audit detects raw fund ledger read outside repository/service boundary', () => {
  const issues = audit.analyzeText(`const rows = await FundLedger.aggregate([]);`, 'src/controllers/badFund.controller.js');
  assert.ok(issues.some((issue) => issue.code === 'DIRECT_FUND_LEDGER_READ'));
});

test('fund ledger contract requires source, idempotency, confirmation and positive amount', () => {
  const validation = fundContract.validateFundLedgerContract({ fundType: 'cash', direction: 'in', amount: 0 });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((err) => err.code === 'FUND_LEDGER_INVALID_AMOUNT'));
  assert.ok(validation.errors.some((err) => err.field === 'sourceType'));
  assert.ok(validation.errors.some((err) => err.field === 'sourceId'));
  assert.ok(validation.errors.some((err) => err.field === 'idempotencyKey'));
});

test('fund audit has no unclassified P0/P1 runtime violations', () => {
  const report = audit.runAudit();
  const blocking = report.issues.filter((issue) => ['P0', 'P1'].includes(issue.severity));
  assert.deepEqual(blocking, [], blocking.map((issue) => `${issue.severity} ${issue.code} ${issue.file}:${issue.line}`).join('\n'));
});
