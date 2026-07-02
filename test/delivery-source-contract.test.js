'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

const REQUIRED = ['delivery-today-orders', 'delivery-today-by-staff', 'delivery-today-collections', 'delivery-today-returns'];

test('delivery contracts distinguish orders, fundLedgers and returnOrders', () => {
  for (const code of REQUIRED) assert.ok(SOURCE_CONTRACT_REGISTRY[code], code);
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['delivery-today-orders'].primaryCollections, ['orders']);
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['delivery-today-collections'].primaryCollections, ['fundLedgers']);
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['delivery-today-returns'].primaryCollections, ['returnOrders']);
  assert.ok(SOURCE_CONTRACT_REGISTRY['delivery-today-orders'].forbiddenCollections.includes('master_orders.totalAmount'));
  assert.ok(SOURCE_CONTRACT_REGISTRY['delivery-today-orders'].forbiddenCollections.includes('arLedgers'));
});

test('delivery new service and UI surface source note only around KPI/list', () => {
  const service = fs.readFileSync('src/services/v2/deliveryTodayNew.service.js', 'utf8');
  const ui = fs.readFileSync('public/js/app/new/91-delivery-today-new.js', 'utf8');
  assert.match(service, /buildDeliveryTodaySourceNotes/);
  assert.match(service, /delivery-today-orders/);
  assert.match(ui, /deliveryTodayNewSourceNote/);
  assert.match(ui, /renderDeliverySourceNote/);
});


test('delivery today new KPI UI does not use arLedgers as delivery KPI source', () => {
  const ui = fs.readFileSync('public/js/app/new/91-delivery-today-new.js', 'utf8');
  const deliveryService = fs.readFileSync('src/services/v2/deliveryTodayNew.service.js', 'utf8');
  assert.doesNotMatch(ui, /arLedgers|ArLedger/);
  assert.match(deliveryService, /delivery-today-orders/);
  assert.match(deliveryService, /delivery-today-collections/);
  assert.match(deliveryService, /delivery-today-returns/);
});
