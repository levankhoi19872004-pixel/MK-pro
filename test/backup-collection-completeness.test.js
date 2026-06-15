'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { APP_COLLECTION_KEYS } = require('../src/constants/collectionKeys');

const REQUIRED = [
  'users', 'salesTargets', 'inventories', 'stockTransactions', 'salesOrders', 'returnOrders',
  'arLedgers', 'fundLedgers', 'debtCollections', 'externalDebtOrders',
  'deliveryCashSubmissions', 'expenseVouchers', 'fundTransfers', 'auditLogs'
];

test('backup covers all canonical operational and financial collections', () => {
  for (const key of REQUIRED) assert.ok(APP_COLLECTION_KEYS.includes(key), key);
});

test('backup list has one key per physical MongoDB collection', () => {
  const names = APP_COLLECTION_KEYS.map((key) => {
    assert.ok(models[key], `Missing model for ${key}`);
    return models[key].collection.name;
  });
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, []);
  assert.equal(APP_COLLECTION_KEYS.includes('stock'), false);
  assert.equal(APP_COLLECTION_KEYS.includes('payments'), false);
  assert.equal(APP_COLLECTION_KEYS.includes('cashbook'), false);
});
