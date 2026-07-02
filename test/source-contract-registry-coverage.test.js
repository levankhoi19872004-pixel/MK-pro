'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SOURCE_CONTRACT_REGISTRY,
  listSourceContracts
} = require('../src/services/source-contracts/SourceContractRegistry');

const REQUIRED = [
  'dashboard-sales-today', 'dashboard-current-debt', 'dashboard-fund-balance', 'dashboard-inventory-summary', 'dashboard-delivery-today',
  'debt-current', 'debt-by-customer', 'debt-ledger', 'debt-receipts', 'debt-aging',
  'fund-ledger', 'fund-balance', 'receipt-list', 'cash-daily-closing',
  'inventory-current', 'inventory-movement', 'stock-card',
  'delivery-today-orders', 'delivery-today-by-staff', 'delivery-today-collections', 'delivery-today-returns',
  'import-excel-preview', 'import-sales-orders', 'import-promotion-groups', 'import-promotion-product-rules', 'import-products', 'import-customers'
];

test('required system source contracts exist and have mandatory fields', () => {
  for (const code of REQUIRED) {
    const contract = SOURCE_CONTRACT_REGISTRY[code];
    assert.ok(contract, `missing ${code}`);
    assert.equal(contract.code, code);
    assert.ok(contract.module, `${code} missing module`);
    assert.ok(contract.primaryCollections.length, `${code} missing primaryCollections`);
    assert.ok(contract.service, `${code} missing service`);
    assert.ok(contract.sourceLabel, `${code} missing sourceLabel`);
    assert.ok(contract.ssotRule, `${code} missing ssotRule`);
  }
});

test('source contract codes are unique', () => {
  const codes = listSourceContracts().map((contract) => contract.code);
  assert.equal(codes.length, new Set(codes).size);
});
