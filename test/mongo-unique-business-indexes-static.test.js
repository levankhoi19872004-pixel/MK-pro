'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function assertUniqueSparseIndex(src, collection, indexName) {
  const re = new RegExp(`${collection}:[\\s\\S]*?name:\\s*['"]${indexName}['"][\\s\\S]*?unique:\\s*true[\\s\\S]*?sparse:\\s*true`);
  assert.match(src, re, `${collection}.${indexName} must be unique+sparse`);
}

test('business key indexes are unique and sparse', () => {
  const src = read('src/services/mongoIndexService.js');
  const required = [
    ['salesOrders', 'uniq_salesOrders_id'],
    ['salesOrders', 'uniq_salesOrders_code'],
    ['arLedgers', 'uniq_arLedgers_id'],
    ['arLedgers', 'uniq_arLedgers_code'],
    ['masterOrders', 'uniq_masterOrders_id'],
    ['masterOrders', 'uniq_masterOrders_code'],
    ['returnOrders', 'uniq_returnOrders_id'],
    ['returnOrders', 'uniq_returnOrders_code'],
    ['fundLedgers', 'uniq_fundLedgers_id'],
    ['fundLedgers', 'uniq_fundLedgers_code']
  ];

  for (const [collection, indexName] of required) {
    assertUniqueSparseIndex(src, collection, indexName);
  }
});

test('old non-unique business key indexes are removed from definitions', () => {
  const src = read('src/services/mongoIndexService.js');
  const forbiddenNames = [
    'idx_sales_orders_id',
    'idx_orders_id',
    'idx_orders_code',
    'idx_ar_ledgers_id',
    'idx_ar_ledgers_code',
    'idx_master_orders_id',
    'idx_master_orders_code',
    'idx_return_orders_id',
    'idx_return_orders_code',
    'idx_fund_ledgers_id',
    'idx_fund_ledgers_code'
  ];

  for (const name of forbiddenNames) {
    assert.equal(src.includes(`name: '${name}'`), false, `${name} should be removed`);
    assert.equal(src.includes(`name: "${name}"`), false, `${name} should be removed`);
  }
});

test('ensureMongoIndexes detects same key with different options without auto drop', () => {
  const src = read('src/services/mongoIndexService.js');

  assert.match(src, /function sameIndexOptions/);
  assert.match(src, /sameKeyDifferentOptions/);
  assert.match(src, /conflictWith/);
  assert.match(src, /Cần drop index cũ sau khi audit duplicate/);
  assert.doesNotMatch(src, /dropIndex\(/);
});

test('duplicate key audit and migration scripts exist with dry-run safeguards', () => {
  const audit = read('scripts/audit-duplicate-business-keys.js');
  const migrate = read('scripts/migrate-duplicate-business-keys.js');
  const drop = read('scripts/drop-replaced-nonunique-indexes.js');
  const pkg = read('package.json');

  assert.match(audit, /TOTAL_DUPLICATE_KEYS/);
  assert.match(migrate, /const dryRun = !process\.argv\.includes\(['"]--write['"]\)/);
  assert.match(migrate, /-DUP-/);
  assert.match(drop, /const dryRun = !process\.argv\.includes\(['"]--write['"]\)/);

  assert.match(pkg, /audit:duplicate-keys/);
  assert.match(pkg, /migrate:duplicate-keys/);
  assert.match(pkg, /drop:old-indexes/);
});
