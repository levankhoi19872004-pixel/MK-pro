'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('staff identity contract exists and documents forbidden legacy/account identifiers', () => {
  const src = read('src/domain/staff/staffIdentity.js');

  assert.match(src, /STAFF_IDENTITY_CONTRACT_START/);
  assert.match(src, /function pickSalesStaffCode/);
  assert.match(src, /function pickDeliveryStaffCode/);
  assert.match(src, /FORBIDDEN_STAFF_IDENTITY_FIELDS/);

  assert.match(src, /salesStaffCode/);
  assert.match(src, /salesmanCode/);
  assert.match(src, /deliveryStaffCode/);
  assert.match(src, /shipperCode/);

  assert.doesNotMatch(src, /source\[['"]staffCode['"]\]/);
  assert.doesNotMatch(src, /source\[['"]staffName['"]\]/);
  assert.doesNotMatch(src, /source\[['"]username['"]\]/);
  assert.doesNotMatch(src, /source\[['"]_id['"]\]/);
  assert.doesNotMatch(src, /source\[['"]id['"]\]/);
});

test('staffRules uses staff identity contract for code matching', () => {
  const src = read('src/rules/staffRules.js');

  assert.match(src, /SALES_STAFF_CODE_FIELDS/);
  assert.match(src, /DELIVERY_STAFF_CODE_FIELDS/);
  assert.match(src, /pickSalesStaffCode/);
  assert.match(src, /pickDeliveryStaffCode/);
  assert.doesNotMatch(src, /const codeFields = \[[\s\S]*staffCode[\s\S]*username[\s\S]*staffId[\s\S]*\]/);
});
