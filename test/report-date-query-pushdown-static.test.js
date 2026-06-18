'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');

test('high-volume reports push date and active status filters into Mongo', () => {
  assert.match(source, /function buildDateMongoFilter/);
  assert.match(source, /const salesFilter = buildActiveDateMongoFilter/);
  assert.match(source, /const receiptFilter = buildActiveDateMongoFilter/);
  assert.match(source, /const deliveryFilter = buildActiveDateMongoFilter/);
  assert.match(source, /const importFilter = buildActiveDateMongoFilter/);
  assert.doesNotMatch(source, /SalesOrder\.find\(\{\}\)/);
  assert.doesNotMatch(source, /Receipt\.find\(\{\}\)/);
  assert.doesNotMatch(source, /MasterOrder\.find\(\{\}\)/);
});

test('stock movement period query does not load transactions after report end date', () => {
  assert.match(source, /StockTransaction\.find\(buildDateMongoFilter\(\{ dateTo \}/);
});
