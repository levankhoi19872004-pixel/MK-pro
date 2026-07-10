'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('posting.engine postReceiptAR builds canonical AR-RECEIPT entries before upsert', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/engines/posting.engine.js'), 'utf8');
  assert.match(src, /category:\s*AR_CATEGORIES\.RECEIPT/);
  assert.match(src, /ledgerType:\s*AR_CATEGORIES\.RECEIPT/);
  assert.match(src, /arDebtCategoryRegistry/);
  assert.match(src, /entryType:\s*'normal'/);
  assert.match(src, /sourceType:\s*'salesOrder'/);
  assert.match(src, /active:\s*true/);
  assert.match(src, /reversed:\s*false/);
  assert.match(src, /direction:\s*'credit'/);
  assert.match(src, /amountField:\s*'credit'/);
  assert.match(src, /assertValidCanonicalArLedgerContract\(entry\)/);
});

test('delivery receipt sourceId is allocated sales order key, not stale receipt-only key', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/engines/posting.engine.js'), 'utf8');
  assert.match(src, /const sourceId = cleanText\(allocation\.orderId \|\| allocation\.salesOrderId/);
  assert.match(src, /const sourceCode = cleanText\(allocation\.orderCode \|\| allocation\.salesOrderCode/);
});
