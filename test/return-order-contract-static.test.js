'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('return order contract document locks returnOrders as business SSoT', () => {
  const doc = read('docs/contracts/return-order-contract.md');
  assert.match(doc, /returnOrders/);
  assert.match(doc, /AR-RETURN/);
  assert.match(doc, /xác nhận kế toán/);
  assert.match(doc, /stock return posting/);
});

test('return report reads AR effects through canonical AR read service', () => {
  const src = read('src/services/reports/ReturnReportService.js');
  assert.match(src, /arLedgerReadService\.getCanonicalLedgersByOrderKeys/);
  assert.doesNotMatch(src, /ArLedger\.(find|aggregate|findOne)\s*\(/);
});
