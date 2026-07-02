'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

const REQUIRED = ['fund-ledger', 'fund-balance', 'receipt-list', 'cash-daily-closing'];

test('fund contracts use fundLedgers and forbid cashbooks/bankbooks as primary source', () => {
  for (const code of REQUIRED) {
    const contract = SOURCE_CONTRACT_REGISTRY[code];
    assert.ok(contract, code);
    assert.deepEqual(contract.primaryCollections, ['fundLedgers']);
    assert.equal(contract.fundSource, 'fundLedgers');
    assert.ok(contract.forbiddenCollections.includes('cashbooks'));
    assert.ok(contract.forbiddenCollections.includes('bankbooks'));
  }
});
