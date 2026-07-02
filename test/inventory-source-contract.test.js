'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

test('inventory contracts use inventories/stockTransactions and forbid products.stock/snapshots', () => {
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['inventory-current'].primaryCollections, ['inventories']);
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['inventory-movement'].primaryCollections, ['stockTransactions']);
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['stock-card'].primaryCollections, ['stockTransactions']);
  assert.ok(SOURCE_CONTRACT_REGISTRY['inventory-current'].forbiddenCollections.includes('products.stock'));
});

test('inventory controller returns sourceNote', () => {
  const controller = fs.readFileSync('src/controllers/inventoryController.js', 'utf8');
  assert.match(controller, /buildSourceNote\('inventory-current'/);
  assert.match(controller, /sourceNote/);
});
