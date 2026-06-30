'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);
function readActual(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}


test('master order production accounting defaults to strict closeout and blocks unsafe legacy AR rollback', () => {
  const boundary = readActual('src/services/master-order/deliveryAccounting.service.js');
  assert.match(boundary, /DeliverySettlementService\.confirmAccounting/);
  assert.match(boundary, /UNSAFE_LEGACY_DELIVERY_ACCOUNTING_BLOCKED_IN_PRODUCTION/);
  assert.match(boundary, /ALLOW_UNSAFE_LEGACY_AR_ROLLBACK/);
  assert.match(boundary, /AR-SALE\/AR-RETURN\/AR-RECEIPT legacy/);
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
