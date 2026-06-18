'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('DMS import maps NVBH from users only and never trusts Excel staff name', () => {
  const src = read('src/services/excelImportService.js');

  assert.match(src, /function getUserStaffCode\(user = \{\}\)/);
  assert.doesNotMatch(src, /user\.staffCode\s*\|\|\s*user\.code\s*\|\|\s*user\.username/);
  assert.doesNotMatch(src, /user\.username,\s*user\.maNhanVien/);
  assert.doesNotMatch(src, /String\(user\._id \|\| ''\)/);

  assert.match(src, /staffName:\s*resolvedSalesStaff\.staffName/);
  assert.match(src, /salesStaffName:\s*resolvedSalesStaff\.salesStaffName/);

  assert.doesNotMatch(src, /staffName:\s*getSalesStaffNameFromRow/);
  assert.doesNotMatch(src, /salesStaffName:\s*getSalesStaffNameFromRow/);
});
