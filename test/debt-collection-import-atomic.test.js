'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const excel = fs.readFileSync(path.join(root, 'src/services/excelImportService.js'), 'utf8');
const finance = fs.readFileSync(path.join(root, 'src/services/financialService.js'), 'utf8');

test('debt import delegates each row to the canonical receipt use case', () => {
  assert.match(excel, /async function importDebtCollections\(rows = \[\], options = \{\}\)/);
  assert.match(excel, /financialService\.createReceipt\(\{/);
  assert.match(excel, /importIdempotencyKey/);
  assert.doesNotMatch(excel.slice(excel.indexOf('async function importDebtCollections'), excel.indexOf('async function importCashbook')), /insertManyInBatches\(Receipt/);
});

test('receipt, AR, money projection and fund ledger share one optional transaction', () => {
  assert.match(finance, /async function persistReceipt/);
  assert.match(finance, /withOptionalMongoTransaction\(options, async \(session\)/);
  assert.match(finance, /receiptRepository\.upsert\(receipt, \{ session \}\)/);
  assert.match(finance, /postingEngine\.postReceiptAR\(receipt, \{ session \}\)/);
  assert.match(finance, /cashbookRepository\.upsert\(moneyEntry, \{ session \}\)/);
  assert.match(finance, /bankbookRepository\.upsert\(moneyEntry, \{ session \}\)/);
  assert.match(finance, /postReceiptFundLedger\([\s\S]*?\}, \{ session \}\)/);
});

test('receipt import retry has a stable idempotency identity', () => {
  assert.match(finance, /receiptRepository\.findAll\([\s\S]*?importIdempotencyKey/);
  assert.match(finance, /return \{ receipt: existing\[0\], duplicate: true \}/);
  assert.match(excel, /EXCEL_DEBT/);
});
