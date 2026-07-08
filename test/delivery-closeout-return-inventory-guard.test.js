'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

function baseReturn(overrides = {}) {
  return {
    id: 'RO-B0038766',
    code: 'RO-B0038766',
    orderId: 'SO1782984458697627',
    orderCode: 'B0038766',
    salesOrderId: 'SO1782984458697627',
    salesOrderCode: 'B0038766',
    deliveryDate: '2026-07-03',
    deliveryStaffCode: 'ghth',
    status: 'received',
    returnStatus: 'received',
    warehouseReceiveStatus: 'received',
    totalReturnAmount: 747770,
    amount: 747770,
    ...overrides
  };
}

test('delivery closeout accepts returnOrders with inventoryPosted true from latest DB query', () => {
  const row = baseReturn({ inventoryPosted: true });
  assert.equal(DeliveryCloseoutService.validateReturnOrderContract(row), true);
  assert.equal(DeliveryCloseoutService.hasValidReturnInventoryState(row), true);
});

test('delivery closeout accepts returnOrders with stockPosted or stockInStatus posted', () => {
  assert.equal(DeliveryCloseoutService.validateReturnOrderContract(baseReturn({ stockPosted: true })), true);
  assert.equal(DeliveryCloseoutService.validateReturnOrderContract(baseReturn({ stockInStatus: 'posted' })), true);
});

test('delivery closeout accepts explicit inventoryImpact posted or none with reason', () => {
  assert.equal(DeliveryCloseoutService.validateReturnOrderContract(baseReturn({ inventoryImpact: { mode: 'posted', warehouseCode: 'MAIN' } })), true);
  assert.equal(DeliveryCloseoutService.validateReturnOrderContract(baseReturn({ inventoryImpact: { mode: 'none', reason: 'no stock impact by design' } })), true);
});

test('delivery closeout rejects confirmed returnOrders without inventory state and returns diagnostic payload', () => {
  const row = baseReturn();
  assert.throws(
    () => DeliveryCloseoutService.validateReturnOrderContract(row),
    (err) => {
      assert.equal(err.code, 'RETURN_ORDER_INVENTORY_IMPACT_REQUIRED');
      assert.equal(err.status, 400);
      assert.equal(err.invalidReturnOrders[0].code, 'RO-B0038766');
      assert.equal(err.invalidReturnOrders[0].orderCode, 'B0038766');
      assert.equal(err.invalidReturnOrders[0].sourceUsedForValidation, 'returnOrders');
      return true;
    }
  );
});

test('accounting closeout guard reads latest returnOrders and returns diagnostic payload statically', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/accounting/AccountingCloseoutService.js'), 'utf8');
  assert.match(source, /assertReturnOrdersInventoryReady\(returnOrders\)/);
  assert.match(source, /invalidReturnOrders/);
  assert.match(source, /returnOrders\.latestDbQuery/);
});
test('returnOrders latest DB projection includes inventory guard fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/master-order/masterOrderReturn.impl.js'), 'utf8');
  assert.match(source, /inventoryPosted:\s*1/);
  assert.match(source, /stockPosted:\s*1/);
  assert.match(source, /stockInStatus:\s*1/);
  assert.match(source, /inventoryImpact:\s*1/);
  assert.match(source, /stockTransactionIds:\s*1/);
});
