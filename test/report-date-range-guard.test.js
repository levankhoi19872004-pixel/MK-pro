'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const queryGuard = require('../src/utils/queryGuard.util');

test('report date guard rejects missing, inverted and overlong periods', () => {
  assert.equal(queryGuard.requireDateRange({}, { maxDays: 31 }).ok, false);
  assert.equal(queryGuard.requireDateRange({ dateFrom: '2026-06-10', dateTo: '2026-06-01' }, { maxDays: 31 }).ok, false);
  const tooLong = queryGuard.requireDateRange({ dateFrom: '2026-01-01', dateTo: '2026-02-15' }, { maxDays: 31 });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /31 ngày/);
});

test('report date guard accepts a valid inclusive 31-day period', () => {
  const checked = queryGuard.requireDateRange({ dateFrom: '2026-05-01', dateTo: '2026-05-31' }, { maxDays: 31 });
  assert.equal(checked.ok, true);
  assert.equal(checked.query.dateFrom, '2026-05-01');
  assert.equal(checked.query.dateTo, '2026-05-31');
});
