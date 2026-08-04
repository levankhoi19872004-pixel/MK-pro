'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'src/services/deliveryCloseoutCorrection.service.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/routes/newOperationsRoutes.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/js/app/new/91-delivery-today-new.js'), 'utf8');

test('delivery adjustment exposes canonical return rows from orders.items and returnOrders.items', () => {
  assert.match(routes, /\/delivery-today\/closeouts\/:id\/adjustment-return-rows/);
  assert.match(service, /async function buildDeliveryAdjustmentReturnRows/);
  assert.match(service, /compactDeliveredItemsFromOrder\(order\)/);
  assert.match(service, /currentReturnMapFromOrders\(returnOrders\)/);
  assert.match(service, /deliveredQtySource: 'orders\.items'/);
  assert.match(service, /currentReturnQtySource: 'returnOrders\.items'/);
});

test('delivery adjustment save applies returnAdjustment.items into returnOrders', () => {
  assert.match(service, /async function applyReturnOrderAdjustment/);
  assert.match(service, /returnOrderRepository\.upsert\(payload/);
  assert.match(service, /SL trả đúng không được lớn hơn SL giao/);
  assert.match(service, /RETURN_ORDER_ALREADY_POSTED_OR_CONFIRMED/);
  assert.match(service, /returnAdjustmentInputItems\(input\)/);
});

test('delivery today popup loads canonical rows and sends only explicit changed return lines', () => {
  assert.match(ui, /adjustmentReturnRowsEndpoint/);
  assert.match(ui, /loadCanonicalReturnRows\(row\)/);
  assert.match(ui, /minimalReturnMutationItems/);
  assert.match(ui, /payload\.returnAdjustmentItems\s*=\s*minimalReturnMutationItems\(correctedReturnItems\)/);
  assert.match(ui, /var returnChanged = correctedReturnItems\.length > 0/);
  assert.match(ui, /changeType:\s*operationIntentForPopup/);
  assert.doesNotMatch(ui, /payload\.returnAdjustmentAmount\s*=/);
  assert.doesNotMatch(ui, /payload\.correctedReturnItems\s*=/);
  assert.doesNotMatch(ui, /items:\s*fullReturnItems/);
});
