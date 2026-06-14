'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('UI displays canonical staff fields and does not fallback to generic staffCode/staffName', () => {
  const files = [
    'public/js/app/03-customers-autocomplete.js',
    'public/js/app/05-sales-orders.js',
    'public/js/app/06-master-delivery.js',
    'public/js/app/debt/07a-debt-core.js',
    'public/js/app/debt/07b-return-orders.js',
    'public/js/app/debt/07c-ar-cashbook.js',
    'public/js/app/debt/07d-master-return-orders.js',
    'public/js/app/debt/07e-debt-collections.js',
    'public/js/app/debt/07f-fund-ledger.js',
    'public/js/app/admin/08a-reports.js',
    'public/js/app/admin/08b-users.js',
    'public/js/app/admin/08c-promotions-legacy.js',
    'public/js/app/admin/08d-import-excel.js',
    'public/js/app/admin/08e-promotion-programs.js',
    'public/js/app/admin/08f-vat-export.js',
    'public/js/search/searchFieldsConfig.js',
    'public/js/search/unifiedSearchEngine.js',
    'public/js/delivery/delivery-web-view.js'
  ];

  for (const file of files) {
    const src = read(file);

    assert.doesNotMatch(src, /order\.salesStaffCode\s*\|\|\s*order\.staffCode/, file);
    assert.doesNotMatch(src, /order\.salesStaffName\s*\|\|\s*order\.staffName/, file);
    assert.doesNotMatch(src, /o\.salesStaffName\s*\|\|\s*o\.staffName/, file);
    assert.doesNotMatch(src, /r\.deliveryStaffCode\s*\|\|\s*r\.staffCode/, file);
    assert.doesNotMatch(src, /r\.deliveryStaffName\s*\|\|\s*r\.staffName/, file);
    assert.doesNotMatch(src, /c\.staffName/, file);
    assert.doesNotMatch(src, /staffName'\s*,\s*'note'/, file);
  }

  const index = read('public/index.html');
  assert.doesNotMatch(index, /name="staffCode"\s+id="customerStaffCode"/);
  assert.doesNotMatch(index, /name="staffName"\s+id="customerStaffName"/);
});
