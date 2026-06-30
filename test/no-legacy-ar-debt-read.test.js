'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const audit = require('../scripts/audit-ar-read-standard');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('audit-ar-read-standard detects direct AR ledger reads, salesOrder debt math, and regex fallback', () => {
  const issues = audit.analyzeText(`
    const rows = await ArLedger.find({ code: /^AR-SALE-/ });
    const debtAmount = Math.max(0, totalAmount - paidAmount);
    const rows2 = await paymentRepository.findAll({ account: 'AR' });
  `, 'src/controllers/badDebt.controller.js');
  assert.ok(issues.some((issue) => issue.code === 'DIRECT_AR_LEDGER_READ'));
  assert.ok(issues.some((issue) => issue.code === 'AR_SALE_REGEX_FALLBACK'));
  assert.ok(issues.some((issue) => issue.code === 'SALES_ORDER_DEBT_CALC'));
  assert.ok(issues.some((issue) => issue.code === 'PAYMENT_REPOSITORY_AR_READ'));
});

test('Phase80 standard files exist and own AR ledger data access', () => {
  for (const file of [
    'src/domain/ar/arLedgerQueryPolicy.js',
    'src/services/arLedgerRead.service.js',
    'src/services/arDebtReadModel.service.js',
    'scripts/audit-ar-read-standard.js'
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} must exist`);
  }
  const readService = read('src/services/arLedgerRead.service.js');
  assert.match(readService, /getCanonicalArLedgers/);
  assert.match(readService, /aggregateDebtByCustomer/);
  assert.match(readService, /aggregateDebtByOrder/);
  assert.match(readService, /aggregateDebtByStaff/);
});

test('high-risk controllers do not query ArLedger directly or compute debt from salesOrders', () => {
  for (const file of ['src/controllers/reportController.js', 'src/controllers/mobile/debts.controller.js']) {
    const src = read(file);
    assert.doesNotMatch(src, /ArLedger\.(find|aggregate|findOne)\s*\(/, `${file} must not read ArLedger directly`);
    assert.doesNotMatch(src, /totalAmount\s*-\s*paidAmount/, `${file} must not compute debt from salesOrders`);
    assert.doesNotMatch(src, /\^AR-SALE-/, `${file} must not fallback by AR-SALE code regex`);
  }
});
