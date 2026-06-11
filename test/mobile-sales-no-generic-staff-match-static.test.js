'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('mobile sales does not match ownership by generic staffCode/staffName', () => {
  const sales = read('src/services/mobile/sales.service.js');
  const legacy = read('src/services/mobileService.js');

  assert.match(sales, /MOBILE_SALES_OWNERSHIP_NO_GENERIC_STAFF_START/);
  assert.doesNotMatch(sales, /order\.staffCode\s*\|\|\s*order\.salesStaffCode/);
  assert.doesNotMatch(sales, /order\.staffName\s*\|\|\s*order\.salesStaffName/);
  assert.doesNotMatch(sales, /normalizeText\(order\.staffName/);

  assert.match(legacy, /MOBILE_LEGACY_SALES_OWNERSHIP_NO_GENERIC_STAFF_START/);
  assert.doesNotMatch(legacy, /order\.staffCode\s*\|\|\s*order\.salesStaffCode/);
  assert.doesNotMatch(legacy, /order\.staffName\s*\|\|\s*order\.salesStaffName/);
});
