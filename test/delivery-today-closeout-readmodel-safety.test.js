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
  assert.match(body, /ArDebtOrder\.deleteMany\s*\(\s*{\s*sourceId\s*}/);
  const sourceBranch = body.slice(body.indexOf('if (sourceId)'), body.indexOf('if (customerCode)'));
  assert.doesNotMatch(sourceBranch, /ArDebtCustomer\.deleteMany/);
  assert.match(body, /options\.allowFullRebuild\s*===\s*true/);
  assert.match(body, /AR_DEBT_READ_MODEL_SCOPE_REQUIRED/);
  assert.doesNotMatch(body, /const\s+customerFilterValue\s*=\s*scope\.customerCode\s*\?\s*{\s*customerCode:\s*scope\.customerCode\s*}\s*:\s*{\s*}/);
});

test('delivery closeout rebuilds AR debt read model outside transaction by customer', () => {
  const source = read(closeoutPath);
  const transactionIndex = source.indexOf('await withMongoTransaction');
  const rebuildIndex = source.indexOf('rebuildDebtForCustomer', transactionIndex);
  assert.ok(transactionIndex > -1, 'closeout must still use transaction for business writes');
  assert.ok(rebuildIndex > transactionIndex, 'customer read-model rebuild must happen after transaction block');
  const between = source.slice(transactionIndex, rebuildIndex);
  assert.doesNotMatch(between, /rebuildDebtForSource\s*\(/);
  assert.match(source, /affectedCustomerCodes/);
});



test('AR debt customer rebuild uses replaceOne/upsert instead of scoped deleteMany on every closeout', () => {
  const source = read(readModelPath);
  const match = source.match(/async\s+function\s+persistReadModel[\s\S]*?\n}\n\nasync function rebuildDebtForSource/);
  assert.ok(match, 'persistReadModel must exist');
  const body = match[0];
  const customerBranch = body.slice(body.indexOf('if (customerCode)'), body.indexOf('if (options.allowFullRebuild'));
  assert.match(customerBranch, /ArDebtCustomer\.replaceOne\s*\(/);
  assert.match(customerBranch, /upsert\s*:\s*true/);
  assert.match(customerBranch, /ArDebtCustomer\.deleteOne\s*\(\s*{\s*customerCode\s*}/);
  assert.doesNotMatch(customerBranch, /ArDebtCustomer\.deleteMany\s*\(\s*{\s*customerCode\s*}/);
  assert.match(body, /incremental_customer_replace/);
});

