'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('debt collection submit creates pending collection without posting ledgers', () => {
  const source = read('src/services/DebtCollectionService.js');
  const start = source.indexOf('async function submitDebtCollection');
  const end = source.indexOf('function buildListFilter', start);
  const block = source.slice(start, end);

  assert.match(block, /status:\s*['"]submitted['"]/);
  assert.match(block, /DebtCollection\.create/);
  assert.doesNotMatch(block, /ArPostingService\.postReceipt/);
  assert.doesNotMatch(block, /FundPostingService\.postCashIn/);
});

test('debt collection confirm is the only flow that posts AR and fund ledgers', () => {
  const source = read('src/services/DebtCollectionService.js');
  const start = source.indexOf('async function confirmDebtCollection');
  const end = source.indexOf('async function rejectDebtCollection', start);
  const block = source.slice(start, end);

  assert.match(block, /withMongoTransaction/);
  assert.match(block, /ArPostingService\.postReceipt/);
  assert.match(block, /FundPostingService\.postCashIn/);
  assert.match(block, /accounting_confirmed/);
});

test('mobile debts endpoint uses DebtReadService and mobile debt collection submit route exists', () => {
  const mobileIndex = read('src/routes/mobile/index.js');
  const mobileService = read('src/services/mobile/debts.service.js');
  const routes = read('src/routes/mobile/debts.routes.js');

  assert.match(mobileIndex, /router\.use\('\/debts',\s*createMobileDebtRouter\(ctx\)\)/);
  assert.match(mobileIndex, /router\.use\('\/debt-collections',\s*createMobileDebtCollectionRouter\(ctx\)\)/);
  assert.match(mobileService, /DebtReadService\.getCustomerDebts/);
  assert.match(routes, /router\.post\('\/'/);
});
