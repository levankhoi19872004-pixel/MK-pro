'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

function readActual(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('mobile sales stores collection as pending accounting and never writes journals/cashbooks directly', () => {
  const source = read('src/services/mobile/sales.service.js');
  assert.doesNotMatch(source, /require\('\.\.\/\.\.\/models\/Payment'\)/);
  assert.doesNotMatch(source, /require\('\.\.\/\.\.\/models\/Cashbook'\)/);
  assert.doesNotMatch(source, /Payment\.create\(/);
  assert.doesNotMatch(source, /Cashbook\.create\(/);
  assert.match(source, /salesCollectionPendingAccounting:\s*paidAmount\s*>\s*0/);
  assert.match(source, /salesCollectionSource:\s*paidAmount\s*>\s*0\s*\?\s*'mobile_sales_pending_accounting'/);
});

test('accounting confirmation facade uses strict delivery settlement and does not post pending mobile sales collection as AR receipt', () => {
  const source = readActual('src/services/master-order/deliveryAccounting.service.js');
  assert.match(source, /DeliverySettlementService\.confirmAccounting\(\.\.\.args\)/);
  assert.match(source, /assertLegacyDeliveryAccountingAllowed/);
  assert.doesNotMatch(source, /MOBILE_SALES_PENDING_COLLECTION_POST_START/);
  assert.doesNotMatch(source, /postingEngine\.postReceiptAR\(/);
  assert.doesNotMatch(source, /source:\s*'mobile_sales_accounting_confirmed'/);
});
