'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('search field config includes delivery core staff filters', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'public/js/search/searchFieldsConfig.js'),
    'utf8'
  );

  assert.match(source, /key:\s*['"]deliveryCoreDeliveryStaff['"]/);
  assert.match(source, /inputId:\s*['"]deliveryCoreDeliveryStaff['"]/);
  assert.match(source, /roles:\s*\[\s*['"]delivery['"]\s*\]/);

  assert.match(source, /key:\s*['"]deliveryCoreSalesStaff['"]/);
  assert.match(source, /inputId:\s*['"]deliveryCoreSalesStaff['"]/);
  assert.match(source, /roles:\s*\[\s*['"]sales['"]\s*\]/);
});
