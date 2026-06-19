'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

test('staff search accepts users.code/users.staffCode as business staff codes without username fallback', () => {
  const source = read('src/repositories/searchRepository.js');

  assert.match(source, /USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS/);
  assert.match(source, /'code'/);
  assert.match(source, /'staffCode'/);
  assert.match(source, /staffCodeExistsFilter\(\)[\s\S]*\$or:[\s\S]*USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS\.map/);
  assert.match(source, /pickUserAccountStaffCode/);
  assert.match(source, /\.select\('id code staffCode salesStaffCode/);
  assert.match(source, /searchFields = staffCodeFilterRequired[\s\S]*USER_ACCOUNT_STAFF_SEARCH_CODE_FIELDS/);
  assert.match(source, /code:\s*realStaffCode/);
  assert.match(source, /staffCode:\s*realStaffCode/);

  const roleSpecificBlock = source.match(/async function findStaffs[\s\S]*?function orderSearchScore/);
  assert.ok(roleSpecificBlock, 'findStaffs block must exist');
  assert.doesNotMatch(roleSpecificBlock[0], /realStaffCode\s*\|\|\s*u\.username/);
  assert.doesNotMatch(roleSpecificBlock[0], /staffCode:\s*realStaffCode\s*\|\|\s*u\.username/);
});
