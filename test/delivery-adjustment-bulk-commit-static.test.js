'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('bulk adjustment route accepts row payloads and exposes selected-order endpoint', () => {
  const routes = read('src/routes/newOperationsRoutes.js');
  assert.match(routes, /DeliveryAdjustmentCommitService/);
  assert.match(routes, /DeliveryAdjustmentBulkCommitService/);
  assert.match(routes, /\/delivery-today\/adjustments\/bulk-commit/);
  assert.match(routes, /const orders = Array\.isArray\(body\.orders\)/);
  assert.match(routes, /commitManyAdjustments/);
  assert.match(routes, /commitOneAdjustment/);
});

test('bulk service replays the one-order commit path for order objects and limits batch size', () => {
  const service = read('src/services/delivery/DeliveryAdjustmentBulkCommitService.js');
  assert.match(service, /Array\.isArray\(input\.orders\)/);
  assert.match(service, /DeliveryAdjustmentCommitService\.commitOneAdjustment/);
  assert.match(service, /MAX_BULK_ORDERS\s*=\s*200/);
  assert.match(service, /processedOrders/);
  assert.match(service, /skippedAlreadySynced/);
  assert.match(service, /createdDebtAdjustments/);
});

test('one-order commit builds manual-save payload and calls delivery correction service without custom bulk idempotency', () => {
  const service = read('src/services/delivery/DeliveryAdjustmentCommitService.js');
  assert.match(service, /deliveryCloseoutCorrectionService\.createCorrection/);
  assert.match(service, /payloadBuiltLikeManualSave/);
  assert.match(service, /manualSaveRouteUsed/);
  assert.match(service, /correctedCashLines:\s*\[\]/);
  assert.doesNotMatch(service, /BULK-ADJ:/);
});

test('delivery today UI sends selected row context to bulk endpoint', () => {
  const ui = read('public/js/app/new/91-delivery-today-new.js');
  assert.match(ui, /deliveryTodayNewBulkAdjustmentCommit/);
  assert.match(ui, /Ghi nhận điều chỉnh đã chọn/);
  assert.match(ui, /\/api\/new\/delivery-today\/adjustments\/bulk-commit/);
  assert.match(ui, /orders:\s*orderPayloads/);
  assert.match(ui, /closeoutVersionId/);
  assert.match(ui, /finalDebtAmount/);
});
