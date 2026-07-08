'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('bulk adjustment route uses shared commit service and exposes selected-order endpoint', () => {
  const routes = read('src/routes/newOperationsRoutes.js');
  assert.match(routes, /DeliveryAdjustmentCommitService/);
  assert.match(routes, /DeliveryAdjustmentBulkCommitService/);
  assert.match(routes, /\/delivery-today\/adjustments\/bulk-commit/);
  assert.match(routes, /commitManyAdjustments/);
  assert.match(routes, /commitOneAdjustment/);
});

test('bulk service calls the same one-order commit path and limits batch size', () => {
  const service = read('src/services/delivery/DeliveryAdjustmentBulkCommitService.js');
  assert.match(service, /DeliveryAdjustmentCommitService\.commitOneAdjustment/);
  assert.match(service, /MAX_BULK_ORDERS\s*=\s*200/);
  assert.match(service, /processedOrders/);
  assert.match(service, /skippedAlreadySynced/);
  assert.match(service, /createdDebtAdjustments/);
});

test('one-order commit wraps delivery closeout correction service and skips when AR is already synced', () => {
  const service = read('src/services/delivery/DeliveryAdjustmentCommitService.js');
  assert.match(service, /deliveryCloseoutCorrectionService\.createCorrection/);
  assert.match(service, /reconcileOrderDebt/);
  assert.match(service, /BULK-ADJ:/);
  assert.match(service, /already_synced/);
});

test('delivery today UI has bulk adjustment button and calls bulk endpoint for checked orders', () => {
  const ui = read('public/js/app/new/91-delivery-today-new.js');
  assert.match(ui, /deliveryTodayNewBulkAdjustmentCommit/);
  assert.match(ui, /Ghi nhận điều chỉnh đã chọn/);
  assert.match(ui, /\/api\/new\/delivery-today\/adjustments\/bulk-commit/);
  assert.match(ui, /submitBulkAdjustmentCommit/);
});
