'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('customer staffCode/staffName are legacy only and not used as new order sales staff source', () => {
  const customerService = read('src/services/customerService.js');
  const customerModel = read('src/models/Customer.js');
  const customerRepo = read('src/repositories/customerRepository.js');
  const mobileService = read('src/services/mobileService.js');

  assert.match(customerService, /CUSTOMER_STAFF_LEGACY_ONLY_START/);

  assert.doesNotMatch(customerService, /resolveSalesStaffForCustomer/);
  assert.doesNotMatch(customerService, /User\.findOne/);
  assert.doesNotMatch(customerService, /payload\.searchText[\s\S]*payload\.staffCode/);
  assert.doesNotMatch(customerService, /payload\.searchText[\s\S]*payload\.staffName/);

  assert.doesNotMatch(customerModel, /this\.searchText[\s\S]*this\.staffCode/);
  assert.doesNotMatch(customerModel, /this\.searchText[\s\S]*this\.staffName/);

  assert.doesNotMatch(customerRepo, /\{\s*staffCode:\s*\{\s*\$regex/);
  assert.doesNotMatch(customerRepo, /\{\s*staffName:\s*\{\s*\$regex/);

  assert.doesNotMatch(mobileService, /\{\s*staffCode:\s*\{\s*\$regex:\s*q/);
  assert.doesNotMatch(mobileService, /\{\s*staffName:\s*\{\s*\$regex:\s*q/);
  assert.doesNotMatch(mobileService, /item\.route,\s*item\.staffCode,\s*item\.staffName/);
});
