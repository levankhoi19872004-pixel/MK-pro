'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');


const ROOT = path.resolve(__dirname, '..');
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function collectibleFixture(remainingDebt, pendingCollectionAmount) {
  return {
    remainingDebt,
    pendingCollectionAmount,
    availableToCollect: Math.max(0, Math.round(remainingDebt - pendingCollectionAmount))
  };
}

test('collectible state allows 190365 allocation when remainingDebt is 190366 and no pending lock exists', () => {
  const state = collectibleFixture(190366, 0);

  assert.equal(state.remainingDebt, 190366);
  assert.equal(state.pendingCollectionAmount, 0);
  assert.equal(state.availableToCollect, 190366);
  assert.equal(190365 <= state.availableToCollect, true);
});

test('collectible state subtracts submitted pending amount and rejects only real over-allocation', () => {
  const pass = collectibleFixture(190366, 100000);

  assert.equal(pass.remainingDebt, 190366);
  assert.equal(pass.pendingCollectionAmount, 100000);
  assert.equal(pass.availableToCollect, 90366);
  assert.equal(90366 <= pass.availableToCollect, true);
  assert.equal(90367 > pass.availableToCollect, true);
});

test('collectible contract is exposed to frontend and validation detail without creating AR-RECEIPT at submit', () => {
  const readService = read('src/services/DebtReadService.js');
  const collectionService = read('src/services/DebtCollectionService.js');
  const route = read('src/routes/newOperationsRoutes.js');

  assert.match(readService, /function collectibleStateFromRows/);
  assert.match(readService, /async function getDebtOrderCollectibleState/);
  assert.match(readService, /pendingCollectionAmount/);
  assert.match(readService, /availableToCollect/);
  assert.match(readService, /DEBT_COLLECTION_ALLOCATION_EXCEEDS_AVAILABLE/);
  assert.match(route, /detail:\s*result\.detail/);
  assert.match(collectionService, /status:\s*'submitted'/);

  const submitStart = collectionService.indexOf('async function submitDebtCollection');
  const submitEnd = collectionService.indexOf('function buildListFilter', submitStart);
  const submitBlock = collectionService.slice(submitStart, submitEnd);
  assert.doesNotMatch(submitBlock, /ArPostingService\.postReceipt/);
});
