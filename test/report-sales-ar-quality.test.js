'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sales = fs.readFileSync(path.join(root, 'src/services/reports/SalesReportService.js'), 'utf8');
const center = fs.readFileSync(path.join(root, 'src/services/reports/ReportCenterService.js'), 'utf8');

test('Sales report does not fallback missing AR debit to actualAmount', () => {
  assert.equal(/toNumber\(ar\.debit\)\s*\|\|\s*valuation\.actualAmount/.test(sales), false);
  assert.match(sales, /const hasArLedger = ar && \(toNumber\(ar\.debit\) > 0 \|\| toNumber\(ar\.credit\) > 0\)/);
  assert.match(sales, /const debtAmount = hasArLedger \? Math\.max\(0, arDebit - arCredit\) : 0/);
});

test('Sales report exposes missing AR ledger quality metrics and Report Center surfaces critical warning', () => {
  assert.match(sales, /missingArLedger/);
  assert.match(sales, /missingArLedgerCount/);
  assert.match(sales, /missingArDebitAmount/);
  assert.match(center, /Đơn xác nhận kế toán thiếu AR-SALE/);
  assert.match(center, /sales\.summary\?\.missingArLedgerCount/);
});
