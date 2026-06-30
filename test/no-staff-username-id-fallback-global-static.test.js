'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('business staff suggestions must not expose username or _id as staff code', () => {
  const searchService = read('src/services/searchService.js');

  assert.doesNotMatch(searchService, /staff\.code\s*\|\|\s*staff\.staffCode\s*\|\|\s*staff\.username/);
  assert.doesNotMatch(searchService, /staff\.code\s*\|\|\s*staff\.staffCode\s*\|\|\s*staff\._id/);
  assert.match(searchService, /value:\s*code/);
  assert.match(searchService, /staffs\.map\(toStaffSuggestion\)\.filter\(Boolean\)/);
});

test('mobile auth must read users instead of legacy staffs collection', () => {
  const repo = read('src/repositories/mobile/auth.repository.js');
  const legacy = read('src/services/mobileService.js');

  assert.doesNotMatch(repo, /MongoStore\.staffs\.findOne/);
  assert.match(repo, /User\.findOne/);
  assert.match(repo, /staffCode/);
  assert.match(repo, /code/);

  assert.doesNotMatch(legacy, /MongoStore\.staffs\.findOne/);
  assert.match(legacy, /User\.findOne/);
});

test('DeliveryEngine staff lookup accepts users code and staffCode', () => {
  const src = read('src/engines/delivery.legacy.engine.js');
  assert.match(src, /USER_ACCOUNT_SALES_STAFF_CODE_FIELDS/);
  assert.match(src, /USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS/);
  assert.match(src, /pickUserAccountSalesStaffCode/);
  assert.match(src, /pickUserAccountDeliveryStaffCode/);
  assert.match(src, /select\('id code staffCode/);
});

test('business staff repository lookup does not match username or _id', () => {
  const repo = read('src/repositories/userRepository.js');
  const legacy = read('src/services/master-order/masterOrderQuery.impl.js');

  assert.match(repo, /function buildBusinessStaffCodeFilter/);
  assert.match(repo, /async function findBusinessStaffByCode/);
  const businessFilter = repo.match(/function buildBusinessStaffCodeFilter[\s\S]*?function normalizeRoleAlias/)?.[0] || '';
  assert.doesNotMatch(businessFilter, /username/);
  assert.doesNotMatch(businessFilter, /\{\s*_id\s*:/);

  assert.match(legacy, /findBusinessStaffByCode/);
  assert.doesNotMatch(legacy.match(/async function resolveStaff[\s\S]*?\n}\n/)?.[0] || '', /StaffName|findStaffByIdOrCode|username|_id/);
});

test('web and mobile tokens must not use username as staffCode fallback', () => {
  const authRoutes = read('src/routes/authRoutes.js');
  const mobileAuth = read('src/services/mobile/auth.service.js');
  const mobileContext = read('src/mobile/mobileContext.js');

  assert.doesNotMatch(authRoutes, /user\.staffCode\s*\|\|\s*user\.code\s*\|\|\s*user\.username/);
  assert.doesNotMatch(mobileAuth, /staff\.staffCode\s*\|\|\s*staff\.code\s*\|\|\s*staff\.username/);
  assert.match(mobileContext, /pickUserAccountSalesStaffCode/);
  assert.match(mobileContext, /pickUserAccountDeliveryStaffCode/);
});

test('frontend staff code helpers must not use username or id fallback', () => {
  const mobileView = read('public/mobile/js/delivery-mobile-view.js');
  assert.doesNotMatch(mobileView, /staffCode\s*\|\|\s*user\.code\s*\|\|\s*user\.username/);

  const importUi = [read('public/js/app/admin/08a-reports.js'),read('public/js/app/admin/08b-users.js'),read('public/js/app/admin/08c-promotions-legacy.js'),read('public/js/app/admin/08d-import-excel.js'),read('public/js/app/admin/08e-promotion-programs.js'),read('public/js/app/admin/08f-vat-export.js')].join('\n');
  assert.doesNotMatch(importUi, /\[u\.code,u\.staffCode,u\.salesStaffCode,u\.username,u\.id\]/);
  assert.match(importUi, /u\.salesmanCode/);
  assert.match(importUi, /u\.employeeCode/);

  const config = read('public/js/search/searchFieldsConfig.js');
  const autocomplete = read('public/js/search/configuredAutocomplete.js');
  assert.doesNotMatch(config, /codeOrUsernameOrId|nameOrFullNameOrUsername/);
  assert.match(config, /businessStaffCode/);
  assert.match(autocomplete, /valueType\s*===\s*['"]businessStaffCode['"]/);
});

test('userService must not synthesize staff code from username or _id', () => {
  const source = read('src/services/userService.js');

  assert.doesNotMatch(source, /const code = String\(body\.code \|\| body\.staffCode \|\| current\?\.staffCode \|\| current\?\.code \|\| body\.username/);
  assert.doesNotMatch(source, /raw\.staffCode\s*\|\|\s*raw\.code\s*\|\|\s*raw\.username/);
  assert.doesNotMatch(source, /raw\.staffCode\s*\|\|\s*raw\.code\s*\|\|\s*raw\._id/);
});
