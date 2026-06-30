'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const audit = require('../scripts/audit-inventory-access-violations');
const stockContract = require('../src/utils/assertStockPostingContract.util');

test('inventory audit detects runtime inventory snapshot usage outside allowed boundary', () => {
  const issues = audit.analyzeText(`const rows = await inventorySnapshots.find({});`, 'src/controllers/badInventory.controller.js');
  assert.ok(issues.some((issue) => issue.code === 'RUNTIME_INVENTORY_SNAPSHOT'));
});

test('stock posting contract rejects missing source/idempotency', () => {
  const validation = stockContract.validateStockPostingContract({ productCode: 'P1', warehouseCode: 'MAIN', direction: 'OUT', quantity: 1 });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((err) => err.field === 'sourceType'));
  assert.ok(validation.errors.some((err) => err.field === 'sourceId'));
  assert.ok(validation.errors.some((err) => err.field === 'idempotencyKey'));
});

test('inventory audit has no unclassified P0/P1 runtime violations', () => {
  const report = audit.runAudit();
  const blocking = report.issues.filter((issue) => ['P0', 'P1'].includes(issue.severity));
  assert.deepEqual(blocking, [], blocking.map((issue) => `${issue.severity} ${issue.code} ${issue.file}:${issue.line}`).join('\n'));
});
