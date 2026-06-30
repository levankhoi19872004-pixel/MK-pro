'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const audit = require('../scripts/audit-ar-access-violations');
const arLedgerRead = require('../src/services/arLedgerRead.service');

test('AR access audit detects direct raw reads, debt math, and regex fallback in non-whitelisted runtime', () => {
  const issues = audit.analyzeText(`
    const rows = await ArLedger.find({ code: /^AR-SALE-/ });
    const debtAmount = totalAmount - paidAmount;
  `, 'src/controllers/badDebt.controller.js');
  assert.ok(issues.some((issue) => issue.code === 'DIRECT_AR_LEDGER_READ'));
  assert.ok(issues.some((issue) => issue.code === 'SALES_ORDER_DEBT_CALC'));
  assert.ok(issues.some((issue) => issue.code === 'AR_SALE_REGEX_FALLBACK'));
});

test('AR read service exposes bulk canonical lookup helpers for reports without direct ArLedger access', () => {
  assert.equal(typeof arLedgerRead.getCanonicalLedgersByOrderKeys, 'function');
  assert.equal(typeof arLedgerRead.getCanonicalLedgersByCustomerCodes, 'function');
});

test('AR access audit has no unclassified P0/P1 violations after Phase81 governance', () => {
  const report = audit.runAudit();
  const blocking = report.issues.filter((issue) => ['P0', 'P1'].includes(issue.severity));
  assert.deepEqual(blocking, [], blocking.map((issue) => `${issue.severity} ${issue.code} ${issue.file}:${issue.line}`).join('\n'));
});
