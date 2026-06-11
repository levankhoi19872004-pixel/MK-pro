'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('master order legacy does not write arLedgers directly in batch accounting flow', () => {
  const source = read('src/services/master-order/masterOrderLegacy.service.js');

  assert.match(source, /const ArPostingService = require\('\.\.\/\.\.\/domain\/posting\/ArPostingService'\);/);
  assert.doesNotMatch(source, /MongoStore\.arLedgers\.(insertMany|bulkWrite|create|findOneAndUpdate)\s*\(/);
  assert.match(source, /ArPostingService\.postBatch\(reversalRows/);
  assert.match(source, /ArPostingService\.markReversed\(rowsToMarkReversed/);
  assert.match(source, /ArPostingService\.postBatch\(ledgerRows/);
});

test('ArPostingService exposes batch posting wrappers through paymentRepository', () => {
  const source = read('src/domain/posting/ArPostingService.js');

  assert.match(source, /const paymentRepository = require\('\.\.\/\.\.\/repositories\/paymentRepository'\);/);
  assert.match(source, /async function postBatch\(rows = \[\], options = \{\}\)/);
  assert.match(source, /async function markReversed\(rows = \[\], user = \{\}, options = \{\}\)/);
  assert.match(source, /paymentRepository\.upsert\(entry, options\)/);
  assert.match(source, /paymentRepository\.upsert\(patched, options\)/);
  assert.match(source, /postBatch,/);
  assert.match(source, /markReversed/);
});
