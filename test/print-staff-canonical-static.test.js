'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('print output uses canonical NVBH/NVGH fields and does not fallback to generic staff fields', () => {
  const source = fs.readFileSync(path.join(ROOT, 'services/printDataBuilder.legacy.js'), 'utf8');

  assert.match(source, /document\.salesStaffCode/);
  assert.match(source, /document\.salesStaffName/);
  assert.match(source, /document\.deliveryStaffCode/);
  assert.match(source, /document\.deliveryStaffName/);

  assert.doesNotMatch(source, /document\.maNVBH, document\.staffCode/);
  assert.doesNotMatch(source, /document\.maNVBHName, document\.staffName/);
});
