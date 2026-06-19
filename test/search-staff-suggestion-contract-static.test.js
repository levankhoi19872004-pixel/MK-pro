'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('staff suggestions expose canonical businessStaffCode and businessStaffName', () => {
  const source = require('./helpers/sourceBundle.util').readSource(path.join(ROOT, 'src/services/searchService.js'));

  assert.match(source, /businessStaffCode/);
  assert.match(source, /businessStaffName/);
  assert.match(source, /deliveryStaffCode/);
  assert.match(source, /salesStaffCode/);
  assert.doesNotMatch(
    source,
    /const code = String\(staff\.code \|\| staff\.staffCode \|\| ''\)/
  );
});
