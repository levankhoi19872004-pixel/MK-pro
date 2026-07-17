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

test('delivery today popup loads canonical rows and sends full returnAdjustment payload', () => {
  assert.match(ui, /adjustmentReturnRowsEndpoint/);
  assert.match(ui, /loadCanonicalReturnRows\(row\)/);
  assert.match(ui, /if \(!returnLocked\)/);
  assert.match(ui, /payload\.returnAdjustment\s*=\s*\{\s*source: 'delivery-adjustment-popup',\s*items: fullReturnItems/s);
  assert.match(ui, /payload\.returnAdjustmentItems\s*=\s*fullReturnItems/);
  assert.match(ui, /item\.deliveredQty/);
});
