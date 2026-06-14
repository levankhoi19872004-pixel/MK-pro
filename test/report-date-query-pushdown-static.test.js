'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/reportLegacy.service.js'), 'utf8');

test('high-volume reports push date and active status filters into Mongo', () => {
  assert.match(source, /function buildDateMongoFilter/);
  assert.match(source, /SalesOrder\.find\(buildActiveDateMongoFilter/);
  assert.match(source, /Receipt\.find\(buildActiveDateMongoFilter/);
  assert.match(source, /MasterOrder\.find\(buildActiveDateMongoFilter/);
  assert.match(source, /ImportOrder\.find\(buildActiveDateMongoFilter/);
  assert.doesNotMatch(source, /SalesOrder\.find\(\{\}\)/);
  assert.doesNotMatch(source, /Receipt\.find\(\{\}\)/);
  assert.doesNotMatch(source, /MasterOrder\.find\(\{\}\)/);
});

test('stock movement period query does not load transactions after report end date', () => {
  assert.match(source, /StockTransaction\.find\(buildDateMongoFilter\(\{ dateTo \}/);
});
