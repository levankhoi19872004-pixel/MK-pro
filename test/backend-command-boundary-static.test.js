'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase214 command contracts define allowed writes and forbidden write boundaries', () => {
  const { ACTION_COMMAND_CONTRACTS } = require('../src/config/actionCommandContracts');
  ['deliveryCloseout', 'deliveryBulkAdjustment', 'deliveryAdjustmentSave', 'debtCollectionSubmit', 'debtCollectionConfirm', 'returnStockIn', 'warehouseReturnConfirm', 'importCommit', 'sseExport'].forEach((key) => {
    const contract = ACTION_COMMAND_CONTRACTS[key];
    assert.ok(contract, `${key} contract missing`);
    assert.equal(contract.requestBudget, 1, `${key} must have one command request budget`);
    assert.ok(contract.idempotencyKey, `${key} must define idempotency key`);
    assert.ok(Array.isArray(contract.allowedWrites), `${key} allowedWrites missing`);
    assert.ok(Array.isArray(contract.forbiddenWrites), `${key} forbiddenWrites missing`);
  });
  assert.ok(ACTION_COMMAND_CONTRACTS.deliveryCloseout.allowedWrites.includes('readModelSyncJobs'));
  assert.equal(ACTION_COMMAND_CONTRACTS.deliveryCloseout.readModelSync, 'enqueue');
  assert.ok(ACTION_COMMAND_CONTRACTS.debtCollectionSubmit.forbiddenWrites.includes('arLedgers'));
});

test('Command telemetry exposes stable stage timing shape', () => {
  const { createCommandTelemetry } = require('../src/utils/commandTelemetry');
  const telemetry = createCommandTelemetry('test.command');
  telemetry.mark('loadData', { rows: 2 });
  const result = telemetry.finish();
  assert.equal(result.command, 'test.command');
  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].name, 'loadData');
  assert.equal(result.stages[0].stage, 'loadData');
  assert.equal(typeof result.stages[0].ms, 'number');
  assert.equal(typeof result.totalMs, 'number');
});

test('Closeout and debt collection services expose command telemetry without synchronous read-model rebuild', () => {
  const closeout = read('src/services/accounting/AccountingCloseoutService.js');
  const debtCollection = read('src/services/DebtCollectionService.js');
  assert.match(closeout, /createCommandTelemetry\('delivery\.closeout'\)/);
  assert.match(debtCollection, /createCommandTelemetry\('debtCollection\.submit'\)/);
  assert.match(debtCollection, /createCommandTelemetry\('debtCollection\.confirm'\)/);
  assert.doesNotMatch(closeout, /rebuildDebtReadModel\(|rebuildCustomerDebtReadModel\(|deleteMany\(.*arDebt/i);
  assert.match(closeout, /CloseoutPostCommitHandler\.enqueueReadModelSync/);
});
