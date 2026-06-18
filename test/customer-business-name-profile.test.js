'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractCustomerBusinessProfile } = require('../src/utils/customerBusinessProfile.util');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('extractCustomerBusinessProfile reads canonical and legacy aliases', () => {
  assert.deepEqual(extractCustomerBusinessProfile({ businessName: ' HỘ KD MINH ANH ' }), {
    businessName: 'HỘ KD MINH ANH', hasBusinessName: true
  });
  assert.equal(extractCustomerBusinessProfile({ 'Tên hộ kinh doanh': 'HỘ KD AN BÌNH' }).businessName, 'HỘ KD AN BÌNH');
  assert.equal(extractCustomerBusinessProfile({ name: 'Cửa hàng A' }).hasBusinessName, false);
});

test('customer form, schema and import template expose businessName', () => {
  assert.match(read('src/models/Customer.js'), /businessName:\s*\{\s*type:\s*String/);
  assert.match(read('public/index.html'), /name="businessName"/);
  const template = read('services/excelTemplateService.js');
  assert.match(template, /'Tên hộ kinh doanh'/);
  assert.match(template, /columns:\s*\['code',\s*'name',\s*'businessName'/);
});

test('safe customer update and VAT export use businessName', () => {
  const importer = read('src/services/excelImportService.js');
  assert.match(importer, /applyTextPatch\(row, patch, 'businessName'/);
  assert.match(importer, /if \(businessProfile\.hasBusinessName\) payload\.businessName/);
  const exporter = read('src/services/importExportLegacy.service.js');
  assert.match(exporter, /name:\s*businessName \|\| customerDisplayName/);
  assert.match(exporter, /TenHoKinhDoanh:\s*businessProfile\.businessName/);
});
