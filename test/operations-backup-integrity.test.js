'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBackupIntegrity, compareBackupIntegrity, technicalTotals } = require('../src/operations/backupIntegrity');

test('backup integrity detects changed restored data and records technical totals', () => {
  const data = {
    inventories: [{ productCode: 'A', onHand: 10 }],
    arLedgers: [{ debit: 1000, credit: 200, status: 'active' }],
    fundLedgers: [{ direction: 'in', amount: 300 }, { direction: 'out', amount: 100 }],
    salesOrders: [{ id: 'SO1' }],
    masterOrders: [],
    returnOrders: [{ id: 'RO1' }]
  };
  const integrity = buildBackupIntegrity(data);
  assert.deepEqual(technicalTotals(data), {
    inventoryQuantityTotal: 10,
    arBalanceTotal: 800,
    fundBalanceTotal: 200,
    salesOrderCount: 1,
    masterOrderCount: 0,
    returnOrderCount: 1,
    inventoryRowCount: 1,
    arLedgerRowCount: 1,
    fundLedgerRowCount: 2
  });
  assert.equal(compareBackupIntegrity(integrity, structuredClone(data)).ok, true);

  const reordered = structuredClone(data);
  reordered.fundLedgers.reverse();
  assert.equal(compareBackupIntegrity(integrity, reordered).ok, true, 'collection document order must not affect restore integrity');
  const changed = structuredClone(data);
  changed.inventories[0].onHand = 9;
  assert.equal(compareBackupIntegrity(integrity, changed).ok, false);
});
