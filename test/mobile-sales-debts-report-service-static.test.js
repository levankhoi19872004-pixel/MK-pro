'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const MOBILE_FILE = path.join(ROOT, 'src/services/mobile/sales.service.js');
const DEBT_READ_FILE = path.join(ROOT, 'src/services/DebtReadService.js');

function readListDebtsBlock() {
  const source = fs.readFileSync(MOBILE_FILE, 'utf8');
  const start = source.indexOf('async function listDebts');
  const end = source.indexOf('\n\n  return {', start);
  assert.ok(start >= 0, 'Không tìm thấy listDebts()');
  assert.ok(end > start, 'Không xác định được ranh giới listDebts()');
  return { source, block: source.slice(start, end) };
}

test('mobile sales debts must use DebtReadService as single debt source', () => {
  const { source, block } = readListDebtsBlock();

  assert.doesNotMatch(source, /listMobileSalesDebtsDirect/);
  assert.doesNotMatch(source, /mobile-sales-ar-ledger-debts-fast/);
  assert.doesNotMatch(block, /\bArLedger\.(find|aggregate)\b/);
  assert.match(block, /DebtReadService\.getCustomerDebts\(scopedQuery\)/);
});

test('DebtReadService wraps reportService.debtCustomers and includes pending collections', () => {
  const source = fs.readFileSync(DEBT_READ_FILE, 'utf8');

  assert.match(source, /reportService\.debtCustomers\(scopedQuery\)/);
  assert.match(source, /DebtCollection\.find\(buildPendingFilter\(query\)\)/);
  assert.match(source, /pendingCollectedAmount/);
  assert.match(source, /availableDebtAmount/);
});

test('DebtReadService response includes ledgers for frontend', () => {
  const source = fs.readFileSync(DEBT_READ_FILE, 'utf8');

  assert.match(source, /ledgers:\s*orders\.map/);
  assert.match(source, /AR-EXTERNAL-DEBT/);
  assert.match(source, /AR-SALE/);
  assert.match(source, /salesOrderCode:\s*order\.salesOrderCode/);
  assert.match(source, /refCode:\s*order\.salesOrderCode/);
  assert.match(source, /debit:\s*toNumber\(order\.debit\)/);
  assert.match(source, /credit:\s*toNumber\(order\.credit\)/);
  assert.match(source, /debt:\s*normalizeDebtAmount\(order\.debt\)/);
});
