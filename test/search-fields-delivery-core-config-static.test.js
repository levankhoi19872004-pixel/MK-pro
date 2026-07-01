'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('search field config no longer includes retired legacy delivery core staff filters', () => {
  const source = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'public/js/search/searchFieldsConfig.js'));
  const newDebt = fs.readFileSync(path.join(ROOT, 'public/js/app/new/92-debt-new.js'), 'utf8');
  const newDelivery = fs.readFileSync(path.join(ROOT, 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

  assert.doesNotMatch(source, /key:\s*['"]deliveryCoreDeliveryStaff['"]/);
  assert.doesNotMatch(source, /key:\s*['"]deliveryCoreSalesStaff['"]/);
  assert.match(newDebt, /attachAutocomplete\('salesman'\)/);
  assert.match(newDebt, /attachAutocomplete\('delivery'\)/);
  assert.match(newDelivery, /deliveryStaffCode|salesStaffCode/);
});
