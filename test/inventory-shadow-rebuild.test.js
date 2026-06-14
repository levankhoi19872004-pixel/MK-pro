'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/domain/reconciliation/InventoryRebuildService.js', 'utf8');
const inventory = fs.readFileSync('src/services/inventoryService.js', 'utf8');

test('inventory rebuild writes to a shadow collection and validates before swap', () => {
  assert.match(service, /\$out:\s*shadowName/);
  assert.match(service, /validateInventoryShadow/);
  assert.match(service, /atomicSwapCollection/);
  assert.match(service, /negativeStockCount/);
  assert.match(service, /transactionTotal/);
});

test('atomic swap keeps a backup and restores it when shadow rename fails', () => {
  const block = service.match(/async function atomicSwapCollection[\s\S]*?\n}\n\nasync function validateInventoryShadow/)?.[0] || '';
  assert.match(block, /backupName/);
  assert.match(block, /rename\(backupName/);
  assert.match(block, /rename\(currentName/);
  assert.match(block, /catch \(error\)/);
});

test('inventory service no longer deletes inventories before rebuild', () => {
  const rebuild = inventory.match(/async function rebuildCurrentInventoryFromTransactions[\s\S]*?\nasync function buildTransactionsFromDocuments/)?.[0] || '';
  const normalize = inventory.match(/async function normalizeOneWarehouse[\s\S]*?\n\nmodule\.exports/)?.[0] || '';
  assert.doesNotMatch(rebuild, /InventoryLegacy\.deleteMany/);
  assert.doesNotMatch(normalize, /InventoryLegacy\.deleteMany/);
  assert.match(rebuild, /InventoryRebuildService\.rebuildInventoryFromTransactions/);
});

test('stock transaction reset also uses a validated shadow replacement', () => {
  const rebuild = inventory.match(/async function rebuildStockLedgerFromDocuments[\s\S]*?\nasync function normalizeOneWarehouse/)?.[0] || '';
  assert.doesNotMatch(rebuild, /StockTransaction\.deleteMany/);
  assert.match(rebuild, /replaceStockTransactions/);
});
