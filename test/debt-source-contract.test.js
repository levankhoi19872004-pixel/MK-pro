'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

const REQUIRED = ['debt-current', 'debt-by-customer', 'debt-ledger', 'debt-receipts', 'debt-aging'];

test('debt contracts use arLedgers as SSoT and mark read models as forbidden', () => {
  for (const code of REQUIRED) {
    const contract = SOURCE_CONTRACT_REGISTRY[code];
    assert.ok(contract, code);
    if (code !== 'debt-receipts') assert.deepEqual(contract.primaryCollections, ['arLedgers']);
    assert.match(contract.ssotRule, /arLedgers/i);
  }
  assert.ok(SOURCE_CONTRACT_REGISTRY['debt-current'].forbiddenCollections.includes('salesOrders.debtAmount'));
});

test('debt new service/API returns sourceNote and UI renders collapsible source note', () => {
  const service = fs.readFileSync('src/services/v2/debtNew.service.js', 'utf8');
  const route = fs.readFileSync('src/routes/newOperationsRoutes.js', 'utf8');
  const ui = fs.readFileSync('public/js/app/new/92-debt-new.js', 'utf8');
  assert.match(service, /buildDebtSourceNote/);
  assert.match(route, /debt-by-customer|debt-ledger|debt-receipts/);
  assert.match(ui, /debtNewSourceNote/);
  assert.match(ui, /renderDebtSourceNote/);
});
