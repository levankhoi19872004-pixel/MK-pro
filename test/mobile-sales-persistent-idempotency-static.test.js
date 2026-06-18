'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = require('./helpers/sourceBundle.util').readSource('src/services/mobile/sales.service.js');

test('mobile sales creation persists idempotency in Mongo transaction', () => {
  assert.match(source, /buildPersistentKey\('mobile\.sales\.create'/);
  assert.match(source, /beginRequest\(\{[\s\S]*scope: 'mobile\.sales\.create'/);
  assert.match(source, /completeRequest\(persistentRequest\.key, response, \{ session \}\)/);
});

test('mobile sales update persists idempotency and permits stock-posted unmerged orders through delta repost flow', () => {
  assert.match(source, /buildPersistentKey\('mobile\.sales\.update'/);
  assert.match(source, /scope: 'mobile\.sales\.update'/);
  assert.match(source, /mobileSalesOrderCanEdit\(order\)/);
  assert.match(source, /adjustForOrderEdit\(/);
  assert.match(source, /postSaleEditDelta\(/);
  assert.doesNotMatch(source, /Đơn đã post tồn, không được sửa trực tiếp/);
});
