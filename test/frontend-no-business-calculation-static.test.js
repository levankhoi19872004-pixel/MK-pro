'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const audit = require('../scripts/audit-frontend-business-calculation');

test('frontend audit detects debt math from raw order amount in non-whitelisted UI', () => {
  const issues = audit.analyzeText(`const debtAmount = totalAmount - paidAmount;`, 'public/js/pages/badDebtWidget.js');
  assert.ok(issues.some((issue) => issue.code === 'FRONTEND_DEBT_FROM_ORDER_MATH'));
});

test('frontend audit has no unclassified P0/P1 business calculation violations', () => {
  const report = audit.runAudit();
  const blocking = report.issues.filter((issue) => ['P0', 'P1'].includes(issue.severity));
  assert.deepEqual(blocking, [], blocking.map((issue) => `${issue.severity} ${issue.code} ${issue.file}:${issue.line}`).join('\n'));
});
