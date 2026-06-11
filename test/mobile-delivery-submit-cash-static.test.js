'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('mobile delivery service defines submitCash before exporting it', () => {
  const src = read('src/services/mobile/delivery.service.js');

  assert.match(src, /MOBILE_DELIVERY_SUBMIT_CASH_STUB_START/);
  assert.match(src, /async function submitCash\(/);
  assert.match(src, /statusCode:\s*501/);
  assert.match(src, /submitCash/);
});
