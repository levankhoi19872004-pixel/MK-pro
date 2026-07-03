'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readModelPath = path.join(root, 'src/services/arDebtReadModel.service.js');
const closeoutPath = path.join(root, 'src/services/accounting/AccountingCloseoutService.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('AR debt read-model refuses unscoped customer deletes in source rebuild', () => {
  const source = read(readModelPath);
  const match = source.match(/async\s+function\s+persistReadModel[\s\S]*?\n}\n\nasync function rebuildDebtForSource/);
  assert.ok(match, 'persistReadModel must exist');
  const body = match[0];
  assert.match(body, /if\s*\(sourceId\)/);
  assert.doesNotMatch(body, /ArDebtOrder\.deleteMany\s*\(\s*{\s*sourceId\s*}/, 'source hot path should upsert by id and skip destructive delete unless explicitly requested');
  const sourceBranch = body.slice(body.indexOf('if (sourceId)'), body.indexOf('if (customerCode)'));
  assert.doesNotMatch(sourceBranch, /ArDebtCustomer\.deleteMany/);
  assert.match(body, /options\.allowFullRebuild\s*===\s*true/);
  assert.match(body, /AR_DEBT_READ_MODEL_SCOPE_REQUIRED/);
  assert.doesNotMatch(body, /const\s+customerFilterValue\s*=\s*scope\.customerCode\s*\?\s*{\s*customerCode:\s*scope\.customerCode\s*}\s*:\s*{\s*}/);
});

test('customer read-model refresh avoids destructive customer/order deleteMany by customerCode', () => {
  const source = read(readModelPath);
  const match = source.match(/if\s*\(customerCode\)\s*{[\s\S]*?\n\s*}\n\n\s*if \(options\.allowFullRebuild === true\)/);
  assert.ok(match, 'persistReadModel customer scope branch must exist');
  const body = match[0];
  assert.match(body, /replaceDebtCustomer\(ArDebtCustomer/);
  assert.doesNotMatch(body, /ArDebtCustomer\.deleteMany\s*\(\s*{\s*customerCode\s*}/);
  assert.doesNotMatch(body, /ArDebtOrder\.deleteMany\s*\(\s*{\s*customerCode\s*,\s*id\s*:\s*{\s*\$nin/);
  assert.doesNotMatch(body, /ArDebtOrder\.deleteMany\s*\(\s*{\s*customerCode\s*}/);
  assert.match(body, /staleOrderCleanupSkipped\s*:\s*true/);
  assert.match(source, /async\s+function\s+refreshDebtCustomerFromOrders\s*\(/);
  const refresh = source.match(/async\s+function\s+refreshDebtCustomerFromOrders[\s\S]*?\n}\n\nasync function rebuildAllDebtReadModels/);
  assert.ok(refresh, 'refreshDebtCustomerFromOrders must be defined before full rebuild');
  assert.match(refresh[0], /replaceDebtCustomer\(ArDebtCustomer/);
  assert.doesNotMatch(refresh[0], /ArDebtCustomer\.deleteMany/);
});

test('delivery closeout refreshes read model incrementally outside transaction', () => {
  const source = read(closeoutPath);
  const transactionIndex = source.indexOf('await withMongoTransaction');
  const sourceRebuildIndex = source.indexOf('rebuildDebtForSource', transactionIndex);
  const customerRefreshIndex = source.indexOf('refreshDebtCustomerFromOrders', transactionIndex);
  assert.ok(transactionIndex > -1, 'closeout must still use transaction for business writes');
  assert.ok(sourceRebuildIndex > transactionIndex, 'source read-model rebuild must happen after transaction block');
  assert.ok(customerRefreshIndex > sourceRebuildIndex, 'customer summary refresh must happen after source order rebuild');
  const between = source.slice(transactionIndex, sourceRebuildIndex);
  assert.doesNotMatch(between, /rebuildDebtForSource\s*\(/);
  assert.doesNotMatch(between, /refreshDebtCustomerFromOrders\s*\(/);
  assert.doesNotMatch(source, /rebuildDebtForCustomer\s*\(customerCode/);
  assert.match(source, /readModelRebuildNeeded/);
  assert.match(source, /affectedSourceIds/);
  assert.match(source, /affectedCustomerCodes/);
});
