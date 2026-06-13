'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('delivery today uses configured autocomplete instead of custom staff suggest', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'public/js/delivery/delivery-web-view.js'),
    'utf8'
  );

  assert.match(source, /bindDeliveryCoreAutocomplete/);
  assert.match(source, /bindConfiguredAutocomplete/);
  assert.doesNotMatch(source, /function attachStaffSuggest/);
  assert.doesNotMatch(source, /fetch\(['"`]\/api\/search\//);
  assert.doesNotMatch(source, /Không có nhân viên trong Hệ thống/);
});
