'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../../public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('frontend keeps debounce and enforces minimum order/customer keyword length', () => {
  assert.match(source, /setTimeout\(function \(\) \{ fetchSuggestions\(scope, value\); \}, 250\)/);
  assert.match(source, /return isStaffSuggestionScope\(scope\) \? 0 : 2/);
  assert.match(source, /value\.length < minSuggestionChars\(scope\)/);
});

test('frontend aborts stale request and suppresses duplicate query calls', () => {
  assert.match(source, /AbortController/);
  assert.match(source, /controllers\[scope\]\.abort\(\)/);
  assert.match(source, /lastRequestKey\[scope\] === requestKey/);
  assert.match(source, /lastCompletedKey\[scope\] === requestKey/);
  assert.match(source, /err\.name === 'AbortError'/);
});

test('frontend sends selected delivery and sales scope before customer search', () => {
  assert.match(source, /scope !== 'delivery'.*deliveryStaffCode/);
  assert.match(source, /scope === 'search'.*salesStaffCode/);
});
