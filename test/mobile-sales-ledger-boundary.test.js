'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
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

test('accounting confirmation posts pending mobile sales collection through AR posting boundary', () => {
  const source = read('src/services/master-order/masterOrderLegacy.service.js');
  assert.match(source, /MOBILE_SALES_PENDING_COLLECTION_POST_START/);
  assert.match(source, /postingEngine\.postReceiptAR\(/);
  assert.match(source, /source:\s*'mobile_sales_accounting_confirmed'/);
  assert.match(source, /order\.salesCollectionPendingAccounting\s*===\s*true/);
});
