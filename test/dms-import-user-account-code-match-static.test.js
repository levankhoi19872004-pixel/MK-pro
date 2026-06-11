'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('DMS import matches NVBH against users code/staffCode without username/id fallback', () => {
  const identity = read('src/domain/staff/staffIdentity.js');
  const service = read('src/services/excelImportService.js');
  const importRules = read('src/rules/importRules.js');
  const staffRules = read('src/rules/staffRules.js');

  assert.match(identity, /USER_ACCOUNT_SALES_STAFF_CODE_FIELDS/);
  assert.match(identity, /'code'/);
  assert.match(identity, /'staffCode'/);
  assert.match(identity, /pickUserAccountSalesStaffCode/);

  assert.match(service, /USER_ACCOUNT_SALES_STAFF_CODE_FIELDS/);
  assert.match(service, /pickUserAccountSalesStaffCode/);
  assert.match(service, /staffCodeLookupClauses/);
  assert.match(service, /\.select\('code staffCode employeeCode salesStaffCode/);
  assert.match(service, /staffCode:\s*excelStaffCode/);
  assert.match(service, /hasUserStaffCode:\s*!!userStaffCode/);

  assert.match(importRules, /USER_ACCOUNT_SALES_STAFF_CODE_FIELDS/);
  assert.match(importRules, /staffCodeLookupClauses/);
  assert.match(staffRules, /USER_ACCOUNT_SALES_STAFF_CODE_FIELDS/);

  assert.doesNotMatch(service, /user\.username/);
  assert.doesNotMatch(importRules, /username/);
});
