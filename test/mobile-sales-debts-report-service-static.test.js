'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'src/services/mobile/sales.service.js');

function readListDebtsBlock() {
  const source = fs.readFileSync(FILE, 'utf8');
  const start = source.indexOf('async function listDebts');
  const end = source.indexOf('\n\n  return {', start);
  assert.ok(start >= 0, 'Không tìm thấy listDebts()');
  assert.ok(end > start, 'Không xác định được ranh giới listDebts()');
  return { source, block: source.slice(start, end) };
}

test('mobile sales debts must use reportService.debtCustomers as single source', () => {
  const { source, block } = readListDebtsBlock();

  assert.doesNotMatch(source, /listMobileSalesDebtsDirect/);
  assert.doesNotMatch(source, /mobile-sales-ar-ledger-debts-fast/);
  assert.doesNotMatch(block, /\bArLedger\.(find|aggregate)\b/);
  assert.match(block, /reportService\.debtCustomers\(scopedQuery\)/);
  assert.match(block, /source:\s*['"]mobile-sales-ar-ledger-debts-report-service['"]/);
});

test('mobile sales debts response includes ledgers for frontend', () => {
  const { block } = readListDebtsBlock();

  assert.match(block, /ledgers:\s*orders\.map/);
  assert.match(block, /type:\s*['"]AR-SALE['"]/);
  assert.match(block, /salesOrderCode:\s*order\.orderCode/);
  assert.match(block, /refCode:\s*order\.orderCode/);
  assert.match(block, /debit:\s*toNumber\(order\.debit\)/);
  assert.match(block, /credit:\s*toNumber\(order\.credit\)/);
  assert.match(block, /debt:\s*normalizeDebtAmount\(order\.debt\)/);
});
