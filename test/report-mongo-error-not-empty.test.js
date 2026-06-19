'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');

test('report data-source failures are surfaced as 503 instead of empty arrays', () => {
  assert.match(source, /REPORT_DATA_SOURCE_FAILED/);
  assert.match(source, /wrapped\.status = 503/);
  assert.match(source, /async function runReportSource/);
  assert.doesNotMatch(source, /catch\(\(\) => \[\]\)/);
});
