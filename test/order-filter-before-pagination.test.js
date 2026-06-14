'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/services/orderLegacy.service.js', 'utf8');

test('strict sales staff search uses canonical Mongo filter without bounded JS scan', () => {
  const search = source.match(/async function searchOrders[\s\S]*?\nasync function listOrders/)?.[0] || '';
  assert.ok(search);
  assert.doesNotMatch(search, /scanLimit|candidateOrders|strictRows\.slice/);
  assert.match(source, /return \{ salesStaffCode: normalized \};/);
  assert.match(search, /skip:\s*page\.skip/);
  assert.match(search, /orderRepository\.count\(filter\)/);
});

test('list order applies business filters before skip and limit', () => {
  const list = source.match(/async function listOrders[\s\S]*?\nasync function createOrder/)?.[0] || '';
  assert.ok(list);
  const queryIndex = list.indexOf('orderRepository.findAll');
  assert.ok(queryIndex > 0);
  for (const token of [
    'normalizedSourceClause',
    'normalizedOrderStatusClause',
    'normalizedMergeStatusClause',
    'normalizedDeliveryStatusClause',
    'normalizedAccountingStatusClause'
  ]) {
    assert.ok(list.indexOf(token) >= 0 && list.indexOf(token) < queryIndex, `${token} must run before Mongo pagination`);
  }
  assert.doesNotMatch(list.slice(queryIndex), /\.filter\(\(order\) =>/);
});

test('list order uses canonical exact NVBH and NVGH fields', () => {
  const list = source.match(/async function listOrders[\s\S]*?\nasync function createOrder/)?.[0] || '';
  assert.match(list, /filter\.salesStaffCode = staffCodeFilter/);
  assert.match(list, /filter\.deliveryStaffCode = deliveryStaffCodeFilter/);
});
